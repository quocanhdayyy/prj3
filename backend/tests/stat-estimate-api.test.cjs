const assert=require('node:assert/strict');
const app=require('../src/app.ts').default;
const {prisma}=require('../src/config/prisma.ts');
const {createUser}=require('../src/services/user.service.ts');
const {updatePlayerStats}=require('../src/services/player-stats.service.ts');
const {metricsInput,metricInputHash}=require('../src/services/player-metrics-input.ts');
const {scoreForm}=require('../src/services/matching/matching-scoring.service.ts');
const {matchingRules}=require('../src/config/matching-rules.ts');
(async()=>{
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 let user,player;
 try{
  const tag=Date.now(),password='EstimateFixture123';user=await createUser({username:'estimate_'+tag,email:'estimate_'+tag+'@example.com',password,role:'SCOUT'});
  const base='http://127.0.0.1:'+server.address().port+'/api';
  const login=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:user.email,password})});assert.equal(login.status,200);
  const token=(await login.json()).data.accessToken;
  player=await prisma.player.create({data:{name:'Estimate temporary fixture',nationality:'Test',dateOfBirth:new Date('2000-01-01'),position:'ST'}});
  const stats=await prisma.playerStats.create({data:{playerId:player.id,season:'2025/2026',appearances:10,minutesPlayed:900,goals:5,assists:2,yellowCards:0,redCards:0}});
  const estimate=await prisma.playerStatsEstimate.create({data:{statsId:stats.id,method:'TEST_ONLY',values:{keyPasses:10},evidence:{dataBasis:'ESTIMATED_NOT_OBSERVED'}}});
  await prisma.playerStatsMetrics.create({data:{statsId:stats.id,method:'TEST_ONLY',
   inputHash:metricInputHash(metricsInput(player,stats,estimate)),sourceHash:'a'.repeat(64),
   values:{expectedGoalsPer90:{value:.5,status:'ESTIMATED',basis:'TEST_ONLY',unit:'PER_90'}},
   evidence:{purpose:'V3_PROTOTYPE_INPUTS_NOT_VERIFIED_PERFORMANCE'}}});
  assert.equal((await fetch(base+'/player-stats/'+stats.id)).status,401);
  const response=await fetch(base+'/player-stats/'+stats.id,{headers:{Authorization:'Bearer '+token}});assert.equal(response.status,200);
  const body=await response.json();assert.equal(body.data.playerName,player.name);assert.equal(body.data.keyPasses,null);assert.equal(body.data.estimate.values.keyPasses,10);
  assert.equal(body.data.metrics.values.expectedGoalsPer90.status,'ESTIMATED');
  assert.equal(body.data.metrics.stale,false);
  const list=await (await fetch(base+'/player-stats',{headers:{Authorization:'Bearer '+token}})).json();
  assert(list.data.some(row=>row.id===stats.id));
  assert(list.data.every(row=>!Object.hasOwn(row,'metrics'))); // Avoid sending all advanced provenance in a list.
  await prisma.player.update({where:{id:player.id},data:{height:185}});
  const stale=await (await fetch(base+'/player-stats/'+stats.id,{headers:{Authorization:'Bearer '+token}})).json();
  assert.equal(stale.data.metrics.stale,true); // A profile correction changes inference inputs too.
  assert.equal(scoreForm(stats,'ST',matchingRules).score,null); // engine does not silently consume imputation.
  const corrected=await updatePlayerStats(stats.id,{keyPasses:15});assert.equal(corrected.keyPasses,15);assert.equal(corrected.estimate,null);
  assert.equal(await prisma.playerStatsEstimate.count({where:{statsId:stats.id}}),0);
  assert.equal(corrected.metrics,null);
  assert.equal(await prisma.playerStatsMetrics.count({where:{statsId:stats.id}}),0);
  console.log('PASS: authenticated API separates observations, estimates and V3 inputs; profile edits flag stale data; stat corrections invalidate both; engine remains observation-only.');
 }finally{
  if(player){await prisma.playerStats.deleteMany({where:{playerId:player.id}});await prisma.player.delete({where:{id:player.id}});}
  if(user)await prisma.user.delete({where:{id:user.id}});
  await new Promise(r=>server.close(r));await prisma.$disconnect();
 }
})().catch(e=>{console.error(e);process.exitCode=1});
