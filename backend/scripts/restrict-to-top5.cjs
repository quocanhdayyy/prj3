// Explicit, backed-up scope change. Never cascade-delete user-owned business data.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { prisma } = require('../src/config/prisma.ts');
const { validateBundle } = require('./import-transfermarkt.cjs');
const ROOT = path.join(__dirname, '../data/scope-top5');
const hash = v => crypto.createHash('sha256').update(typeof v === 'string' || Buffer.isBuffer(v) ? v : JSON.stringify(v)).digest('hex');
const json = v => JSON.parse(JSON.stringify(v));
const BASE = ['appearances','minutesPlayed','goals','assists','yellowCards','redCards'];
const EXTRA = ['tacklesWon','interceptions','keyPasses','passesCompleted','passesAttempted'];
const PROTECTED = ['user','contract','injuryHistory','clubRequirement','shortlist','shortlistItem','transfer','notification','scoringConfig','matchResult','matchingInput','playerDataVerification'];

async function backup(file) {
  const url = new URL(process.env.DATABASE_URL);
  assert(['localhost','127.0.0.1'].includes(url.hostname), 'Scope change supports the local project database only.');
  const executable = process.env.PG_DUMP_PATH || '/Library/PostgreSQL/18/bin/pg_dump';
  const env = { ...process.env, PGPASSWORD: decodeURIComponent(url.password) };
  const result = spawnSync(executable, ['--format=custom','--no-owner','--no-acl','--file',file,'--host',url.hostname,'--port',url.port || '5432','--username',decodeURIComponent(url.username),'--dbname',decodeURIComponent(url.pathname.slice(1))], { env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.error?.message || result.stderr || 'pg_dump failed');
  await fs.chmod(file, 0o600);
  const restore = spawnSync(path.join(path.dirname(executable), 'pg_restore'), ['--list',file], { encoding: 'utf8' });
  assert.equal(restore.status, 0, 'Backup archive could not be read by pg_restore');
  return { file: path.basename(file), sha256: hash(await fs.readFile(file)), bytes: (await fs.stat(file)).size };
}

async function main() {
  process.umask(0o077);
  const args = process.argv.slice(2);
  assert(args[0] === '--actor-id' && /^\d+$/.test(args[1] || '') && (args.length === 2 || (args.length === 3 && args[2] === '--apply')), 'Use --actor-id <admin ID> [--apply].');
  const actorId = Number(args[1]), apply = args.includes('--apply');
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: actorId }, select: { role: true } })).role, 'ADMIN');
  const original = JSON.parse(await fs.readFile(path.join(ROOT,'transfermarkt/prepared.json'),'utf8'));
  const next = JSON.parse(await fs.readFile(path.join(__dirname,'../data/transfermarkt/prepared.json'),'utf8'));
  validateBundle(next);
  assert.equal(original.provider, next.provider); assert.equal(next.season,'2025/2026');
  assert.deepEqual(next.report.coverage.map(c => c.competitionId).sort(), ['ES1','FR1','GB1','IT1','L1']);
  const keep = new Set(next.players.map(e => e.player.transfermarktId));
  const keepClubs = new Set(next.clubs.map(e => e.transfermarktId));
  const dropSourceIds = original.players.filter(e => !keep.has(e.player.transfermarktId)).map(e => e.player.transfermarktId);
  const dropClubSources = original.clubs.filter(e => !keepClubs.has(e.transfermarktId)).map(e => e.transfermarktId);
  const candidates = await prisma.player.findMany({ where: { transfermarktId: { in: dropSourceIds } }, select: { id: true } });
  const clubs = await prisma.club.findMany({ where: { transfermarktId: { in: dropClubSources } }, select: { id: true } });
  const tag = new Date().toISOString().replace(/[:.]/g,'-');
  await fs.mkdir(ROOT,{recursive:true,mode:0o700});
  const archive = apply && (candidates.length || clubs.length) ? await backup(path.join(ROOT,`before-${tag}.dump`)) : null;
  const report = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(51943, 2025)`;
    const players = await tx.player.findMany({ where: { transfermarktId: { in: dropSourceIds } } });
    const clubs = await tx.club.findMany({ where: { transfermarktId: { in: dropClubSources } } });
    assert.deepEqual(players.map(p=>p.id).sort((a,b)=>a-b), candidates.map(p=>p.id).sort((a,b)=>a-b));
    const ids = players.map(p => p.id), cids = clubs.map(c => c.id);
    const refs = { contract:{OR:[{playerId:{in:ids}},{clubId:{in:cids}}]}, injuryHistory:{playerId:{in:ids}},
      clubRequirement:{clubId:{in:cids}}, shortlistItem:{playerId:{in:ids}},
      transfer:{OR:[{playerId:{in:ids}},{fromClubId:{in:cids}},{toClubId:{in:cids}}]}, notification:{playerId:{in:ids}},
      matchResult:{playerId:{in:ids}}, matchingInput:{playerId:{in:ids}}, playerDataVerification:{playerId:{in:ids}} };
    for(const [model,where] of Object.entries(refs)) assert.equal(await tx[model].count({where}),0,`User/business records reference excluded ${model}; aborting, never cascading.`);
    const stats = await tx.playerStats.findMany({ where:{playerId:{in:ids}} });
    assert(stats.every(s=>s.season===next.season), 'Excluded players have other-season stats; review first.');
    const valuations = await tx.playerMarketValueHistory.findMany({ where:{playerId:{in:ids}} });
    assert(valuations.every(v=>v.source===next.provider), 'Excluded players have manually sourced valuations; review first.');
    const retainedPlayers = await tx.player.findMany({ where:{transfermarktId:{in:[...keep]}},orderBy:{id:'asc'} });
    const retainedStats = await tx.playerStats.findMany({ where:{playerId:{in:retainedPlayers.map(p=>p.id)},season:next.season} });
    const sourceById = new Map(next.players.map(e=>[e.player.transfermarktId,e]));
    const originalBySource = new Map(original.players.map(e=>[e.player.transfermarktId,e]));
    const playerById = new Map(retainedPlayers.map(p=>[p.id,p]));
    const changes=[];
    for(const current of retainedStats) {
      const entry=sourceById.get(playerById.get(current.playerId).transfermarktId);
      if(BASE.some(k=>current[k]!==entry.stats[k])) {
        const old=originalBySource.get(entry.player.transfermarktId);
        assert(old && BASE.every(k=>current[k]===old.stats[k]),'A season total was manually changed; review before reaggregation: '+entry.player.name);
        changes.push({current,data:{...Object.fromEntries(BASE.map(k=>[k,entry.stats[k]])),...Object.fromEntries(EXTRA.map(k=>[k,null]))}});
      }
    }
    const protectedModels={};
    for(const model of PROTECTED) {const key=model==='playerDataVerification'?'playerId':'id';const rows=await tx[model].findMany({orderBy:{[key]:'asc'}});protectedModels[model]={count:rows.length,sha256:hash(rows)};}
    const checkpointFile=`checkpoint-${tag}.json`;
    if(apply && (ids.length||cids.length||changes.length)) {
      assert(archive,'A verified backup is required before scope mutation.');
      const retainedValuations=await tx.playerMarketValueHistory.findMany({where:{playerId:{in:retainedPlayers.map(p=>p.id)}},orderBy:{id:'asc'}});
      const snapshot={protectedModels,allPlayers:await tx.player.findMany({orderBy:{id:'asc'}}),allClubs:await tx.club.findMany({orderBy:{id:'asc'}}),allStats:await tx.playerStats.findMany({orderBy:{id:'asc'}}),retainedValuations:{count:retainedValuations.length,sha256:hash(retainedValuations)}};
      await fs.writeFile(path.join(ROOT,checkpointFile),JSON.stringify(snapshot),{flag:'wx',mode:0o600});
      for(const {current,data} of changes) {
        assert.equal((await tx.playerStats.updateMany({where:current,data})).count,1);
        await tx.auditLog.create({data:{actorId,entityType:'PlayerStats',entityId:current.id,action:'UPDATE',oldValue:json(current),newValue:json({...current,...data,importProvenance:{pipeline:'SCOPE_TOP5_V1',reason:'Reaggregate only top-five domestic-league matches; clear detailed counters whose old season scope changed.'}})}});
      }
      await tx.playerStats.deleteMany({where:{id:{in:stats.map(s=>s.id)}}});
      await tx.playerMarketValueHistory.deleteMany({where:{id:{in:valuations.map(v=>v.id)}}});
      await tx.auditLog.createMany({data:players.map(p=>({actorId,entityType:'Player',entityId:p.id,action:'DELETE',oldValue:json({...p,scopeChange:'TOP5',backup:archive.file})}))});
      await tx.player.deleteMany({where:{id:{in:ids}}});
      await tx.auditLog.createMany({data:clubs.map(c=>({actorId,entityType:'Club',entityId:c.id,action:'DELETE',oldValue:json({...c,scopeChange:'TOP5',backup:archive.file})}))});
      await tx.club.deleteMany({where:{id:{in:cids}}});
      for(const model of PROTECTED) {const key=model==='playerDataVerification'?'playerId':'id';assert.equal(hash(await tx[model].findMany({orderBy:{[key]:'asc'}})),protectedModels[model].sha256,model+' changed');}
    }
    const coverage=await tx.playerStats.findMany({where:{season:next.season,player:{transfermarktId:{in:[...keep]}}}});
    const filled=coverage.reduce((a,s)=>{const n=EXTRA.filter(k=>s[k]!==null).length;a[n===5?'complete':n?'partial':'missing']++;return a;},{complete:0,partial:0,missing:0});
    const result={pipeline:'SCOPE_TOP5_V1',mode:apply?'APPLY':'DRY_RUN',season:next.season,runAt:new Date().toISOString(),leagues:next.report.coverage,
      removed:{players:players.length,clubs:clubs.length,stats:stats.length,valuations:valuations.length},reaggregatedStats:changes.length,
      retained:{importedPlayers:next.players.length,importedClubs:next.clubs.length,valuations:next.valuations.length},detailedStats:filled,
      backup:archive,checkpointFile:apply&&(ids.length||changes.length||cids.length)?checkpointFile:null,
      removedPlayerIds:ids,removedClubIds:cids,updatedStats:changes.map(c=>({id:c.current.id,data:c.data}))};
    if(apply&&(ids.length||cids.length||changes.length)) await tx.auditLog.create({data:{actorId,entityType:'DatasetScope',entityId:2025,action:'UPDATE',newValue:json(result)}});
    return result;
  },{isolationLevel:'Serializable',timeout:180000,maxWait:15000});
  const modified=report.removed.players||report.removed.clubs||report.reaggregatedStats;
  await fs.writeFile(path.join(ROOT,apply?(modified?'report.json':'last-noop.json'):'dry-run.json'),JSON.stringify(report,null,2)+'\n');
  const {removedPlayerIds,removedClubIds,updatedStats,...summary}=report;
  if(apply&&modified) await fs.writeFile(path.join(__dirname,'../docs/archive/reports/top5-scope-report.json'),JSON.stringify(summary,null,2)+'\n');
  console.log(JSON.stringify(summary,null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>prisma.$disconnect());
