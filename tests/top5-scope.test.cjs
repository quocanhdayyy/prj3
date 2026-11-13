const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { prisma } = require('../src/config/prisma.ts');
const {scopeStats,assertProtected,restoreDeleted}=require('./top5-baseline.cjs');
const root = path.join(__dirname,'../data/scope-top5');
const report=JSON.parse(fs.readFileSync(path.join(root,'report.json')));
const before=JSON.parse(fs.readFileSync(path.join(root,report.checkpointFile)));
const bundle=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/transfermarkt/prepared.json')));
const hash=v=>crypto.createHash('sha256').update(Buffer.isBuffer(v)?v:JSON.stringify(v)).digest('hex');
(async()=>{
  const removed=new Set(report.removedPlayerIds),removedClubs=new Set(report.removedClubIds);
  const players=await prisma.player.findMany({orderBy:{id:'asc'}}),clubs=await prisma.club.findMany({orderBy:{id:'asc'}});
  assert.equal(hash(restoreDeleted('player',players)),hash(before.allPlayers.filter(p=>!removed.has(p.id))),'Retained player records');
  assert.equal(hash(restoreDeleted('club',clubs)),hash(before.allClubs.filter(c=>!removedClubs.has(c.id))),'Retained club records');
  assert.equal(players.filter(p=>p.transfermarktId!==null).length,2684);
  assert.equal(clubs.filter(c=>c.transfermarktId!==null).length,96);
  assert(clubs.filter(c=>c.transfermarktId!==null).every(c=>['Premier League','La Liga','Bundesliga','Serie A','Ligue 1'].includes(c.league)));
  const changes=new Map(report.updatedStats.map(s=>[s.id,s.data]));
  const stats=await prisma.playerStats.findMany({orderBy:{id:'asc'}});
  assert.deepEqual(stats,scopeStats(before.allStats));
  const imported=new Map(players.filter(p=>p.transfermarktId!==null).map(p=>[p.transfermarktId,p]));
  const statsByPlayer=new Map(stats.map(s=>[s.playerId,s]));
  for(const e of bundle.players)for(const field of ['appearances','minutesPlayed','goals','assists','yellowCards','redCards'])assert.equal(statsByPlayer.get(imported.get(e.player.transfermarktId).id)[field],e.stats[field]);
  const values=await prisma.playerMarketValueHistory.findMany({where:{playerId:{in:[...imported.values()].map(p=>p.id)}},orderBy:{id:'asc'}});
  assert.equal(values.length,53352);assert.equal(hash(values),before.retainedValuations.sha256);
  for(const [model,baseline]of Object.entries(before.protectedModels)){
    await assertProtected(prisma,model,baseline);
  }
  const backup=fs.readFileSync(path.join(root,report.backup.file));assert.equal(backup.subarray(0,5).toString(),'PGDMP');assert.equal(hash(backup),report.backup.sha256);
  assert.equal(fs.statSync(path.join(root,report.backup.file)).mode&0o077,0);
  const updates=await prisma.auditLog.count({where:{entityType:'PlayerStats',newValue:{path:['importProvenance','pipeline'],equals:'SCOPE_TOP5_V1'}}});assert.equal(updates,report.reaggregatedStats);
  console.log('PASS: 2684 imported players/96 clubs/53352 valuations; retained IDs unchanged; only scoped totals changed; user/business data preserved; private PostgreSQL backup checksum verified.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>prisma.$disconnect());
