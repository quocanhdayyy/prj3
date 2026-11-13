const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {prisma}=require('../src/config/prisma.ts');
const supplemental=require('./import-supplemental-stats.cjs');
const enrichment=require('./import-stats-enrichment.cjs');
const {writeAudit}=require('../src/services/audit-log.service.ts');
const ROOT=path.join(__dirname,'..'),DATA=path.join(ROOT,'data/maintenance');
const json=x=>JSON.parse(JSON.stringify(x));
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const PLAYERS=new Map([[4,'Nguyen Van A'],[93,'DEMO - Nguyen Minh An']]);
const CLUBS=new Map([[1,'Example United'],[104,'DEMO Former FC'],[105,'DEMO Current FC'],[106,'DEMO Buyer FC']]);

async function main(){
 const args=process.argv.slice(2);assert(args[0]==='--actor-id'&&/^[1-9]\d*$/.test(args[1]||'')&&args.slice(2).every(x=>x==='--apply'));
 const actorId=Number(args[1]),apply=args.includes('--apply');
 assert.equal((await prisma.user.findUniqueOrThrow({where:{id:actorId},select:{role:true}})).role,'ADMIN');
 const top5=await read(path.join(ROOT,'data/transfermarkt/prepared.json'));
 assert.deepEqual([...new Set(top5.clubs.map(c=>c.league))].sort(),['Bundesliga','La Liga','Ligue 1','Premier League','Serie A']);
 const a=await read(path.join(ROOT,'data/supplemental-stats/prepared.json')),b=await read(path.join(ROOT,'data/stats-enrichment/prepared.json'));
 supplemental.validateBundle(a);enrichment.validate(b);
 assert.equal(sha(await fs.readFile(path.join(ROOT,'data/transfermarkt/prepared.json'))),a.transfermarktBundleSha256);
 assert.equal(sha(await fs.readFile(path.join(ROOT,'data/supplemental-stats/raw/sofascore_player_seasons.csv'))),a.sourceSha256);
 for(const source of b.sources){const file=path.resolve(ROOT,source.file);assert(file.startsWith(path.join(ROOT,'data')+path.sep));assert.equal(sha(await fs.readFile(file)),source.sha256);}
 await fs.mkdir(DATA,{recursive:true,mode:0o700});
 const result=await prisma.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(51943, 2025)`;
  const players=await tx.player.findMany({where:{id:{in:[...PLAYERS.keys()]}}}),clubs=await tx.club.findMany({where:{id:{in:[...CLUBS.keys()]}}});
  for(const p of players)assert(p.transfermarktId===null&&p.name===PLAYERS.get(p.id),'Refuse deleting an unexpected player');
  for(const c of clubs)assert(c.transfermarktId===null&&c.name===CLUBS.get(c.id),'Refuse deleting an unexpected club');
  const pids=players.map(p=>p.id),cids=clubs.map(c=>c.id);
  const requirements=await tx.clubRequirement.findMany({where:{clubId:{in:cids}}}),rids=requirements.map(r=>r.id);
  const filters={matchResult:{OR:[{playerId:{in:pids}},{requirementId:{in:rids}}]},matchingInput:{OR:[{playerId:{in:pids}},{requirementId:{in:rids}}]},shortlistItem:{OR:[{playerId:{in:pids}},{requirementId:{in:rids}}]},contract:{OR:[{playerId:{in:pids}},{clubId:{in:cids}}]},transfer:{OR:[{playerId:{in:pids}},{fromClubId:{in:cids}},{toClubId:{in:cids}}]},notification:{playerId:{in:pids}},playerStats:{playerId:{in:pids}},injuryHistory:{playerId:{in:pids}},playerMarketValueHistory:{playerId:{in:pids}},playerDataVerification:{playerId:{in:pids}}};
  const deleted={};
  for(const[model,where]of Object.entries(filters)){
   deleted[model]=await tx[model].findMany({where});
   assert(!deleted[model].some(row=>row.playerId&&!pids.includes(row.playerId)),'Refuse deleting dependencies of a real player');
  }
  deleted.clubRequirement=requirements;deleted.player=players;deleted.club=clubs;
  const listIds=[...new Set(deleted.shortlistItem.map(s=>s.shortlistId))];
  deleted.shortlist=await tx.shortlist.findMany({where:{id:{in:listIds},name:{startsWith:'DEMO'}}});
  for(const list of deleted.shortlist)assert.equal(await tx.shortlistItem.count({where:{shortlistId:list.id,id:{notIn:deleted.shortlistItem.map(i=>i.id)}}}),0);
  const real=await tx.player.findMany({where:{transfermarktId:{not:null}},orderBy:{id:'asc'},include:{stats:{where:{season:'2025/2026'}}}});
  assert.equal(real.length,2684);assert.deepEqual(real.map(p=>p.transfermarktId).sort((a,b)=>a-b),top5.players.map(p=>p.player.transfermarktId).sort((a,b)=>a-b));
  const index=new Map(real.map(p=>[p.transfermarktId,p])),changes=[];
  for(const [pipeline,bundle,planner]of[['SUPPLEMENTAL_REPAIR_V1',a,supplemental.planChange],['ENRICHMENT_REPAIR_V1',b,enrichment.planChange]]){
   for(const entry of bundle.entries){const p=index.get(entry.transfermarktId);if(!p||p.name!==entry.name||p.dateOfBirth.toISOString().slice(0,10)!==entry.dateOfBirth)continue;
    const current=p.stats[0],plan=planner(current,entry),data=pipeline.startsWith('SUPPLEMENTAL')?plan.data||{}:plan;
    if(!Object.keys(data).length)continue;
    assert(Object.keys(data).every(f=>enrichment.FIELDS.includes(f)&&current[f]===null));
    changes.push({old:json(current),data,pipeline,playerId:p.id,name:p.name,evidence:entry.evidence||entry.provenance});Object.assign(current,data);
   }
  }
  const summary={mode:apply?'APPLY':'DRY_RUN',deleted:Object.fromEntries(Object.entries(deleted).map(([k,v])=>[k,v.length])),realStatPlayersUpdated:new Set(changes.map(c=>c.playerId)).size,realStatFieldsFilled:changes.reduce((n,c)=>n+Object.keys(c.data).length,0)};
  if(!apply)return summary;
  if(!changes.length&&Object.values(deleted).every(rows=>rows.length===0))return{...summary,noOp:true};
  const tag=Date.now(),backupFile=`repair-${tag}.json`,backup={createdAt:new Date().toISOString(),deleted,changes};
  const bytes=JSON.stringify(backup,null,2);await fs.writeFile(path.join(DATA,backupFile),bytes,{flag:'wx',mode:0o600});
  assert.equal(sha(await fs.readFile(path.join(DATA,backupFile))),sha(bytes));
  for(const[model,rows]of Object.entries(deleted)){
   if(!rows.length)continue;const key=model==='playerDataVerification'?'playerId':'id';
   assert.equal((await tx[model].deleteMany({where:{[key]:{in:rows.map(r=>r[key])}}})).count,rows.length);
   for(const row of rows)await writeAudit(tx,{actorId,ipAddress:null},model,row[key],'DELETE',row,{maintenance:'REMOVE_MANUAL_DEMO_V1'});
  }
  for(const c of changes){assert.equal((await tx.playerStats.updateMany({where:c.old,data:c.data})).count,1);
   await writeAudit(tx,{actorId,ipAddress:null},'PlayerStats',c.old.id,'UPDATE',c.old,{...c.old,...c.data,importProvenance:{pipeline:c.pipeline,reliability:'UNKNOWN',evidence:c.evidence}});
  }
  assert.equal(await tx.player.count(),2684);assert.equal(await tx.club.count(),96);
  assert.equal(await tx.playerStats.count(),2684);
  return{...summary,backupFile,backupSha256:sha(bytes)};
 },{isolationLevel:'Serializable',timeout:60000});
 if(apply&&!result.noOp)await fs.writeFile(path.join(DATA,'repair-report.json'),JSON.stringify({...result,runAt:new Date().toISOString()},null,2),{mode:0o600});
 console.log(JSON.stringify(result,null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>prisma.$disconnect());
