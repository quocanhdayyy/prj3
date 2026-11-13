const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const app=require('../src/app.ts').default;
const {prisma}=require('../src/config/prisma.ts');
const {createUser}=require('../src/services/user.service.ts');
const {metricsInput,metricInputHash}=require('../src/services/player-metrics-input.ts');
(async()=>{
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${server.address().port}/api`;const users=[],players=[],configs=[];const tag=Date.now();
  const call=async(status,method,path,body,token)=>{
    const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const raw=await response.text();assert.equal(response.status,status,`${method} ${path}: ${raw}`);
    return raw.startsWith('{')?JSON.parse(raw).data:null;
  };
  try{
    for(const role of ['ADMIN','SCOUT'])users.push(await createUser({username:`v3inputs_${role}_${tag}`,email:`v3inputs_${role.toLowerCase()}_${tag}@example.com`,password:'InputFixturePass123',role}));
    const tokens=[];for(const u of users)tokens.push((await call(200,'POST','/auth/login',{email:u.email,password:'InputFixturePass123'})).accessToken);
    const [admin,scout]=tokens;
    await call(401,'GET','/matching/v3/template');
    const template=await call(200,'GET','/matching/v3/template',undefined,scout);
    assert.equal(template.implementationStage,1);assert.equal(template.scoringAvailable,false);assert.equal(template.roles.length,35);
    for(const path of ['evaluate','rank','search','rebuild','squad/preview'])await call(404,'POST','/matching/v3/'+path,{},admin);
    const body={...template.config,name:`Input fixture ${tag}`};
    await call(403,'POST','/scoring-configs',body,scout);
    const bad=structuredClone(body);bad.parameters.settings.referenceMinMinutes=-1;await call(409,'POST','/scoring-configs',bad,admin);
    const config=await call(201,'POST','/scoring-configs',body,admin);configs.push(config.id);assert.equal(config.isActive,false);
    const activeBefore=await prisma.scoringConfig.findFirst({where:{isActive:true}});
    await call(409,'POST',`/scoring-configs/${config.id}/activate`,undefined,admin);
    assert.equal((await prisma.scoringConfig.findFirst({where:{isActive:true}}))?.id,activeBefore?.id);
    players.push(await prisma.player.create({data:{name:'V3 input fixture',dateOfBirth:new Date('2000-01-01'),nationality:'Vietnam',position:'CM',height:180,marketValue:1,preferredFoot:'RIGHT'}}));
    const player=players[0],statsBody={playerId:player.id,season:'2025/2026',appearances:10,minutesPlayed:900,goals:1,assists:1,yellowCards:0,redCards:0,positionMinutes:{CM:650,CAM:250},positionMinutesSource:'TEST match logs'};
    await call(403,'POST','/player-stats',statsBody,scout);
    const stat=await call(201,'POST','/player-stats',statsBody,admin);assert.equal(stat.positionMinutes.CAM,250);
    const estimate=await prisma.playerStatsEstimate.create({data:{statsId:stat.id,method:'TEST',values:{keyPasses:5},evidence:{}}});
    await prisma.playerStatsMetrics.create({data:{statsId:stat.id,method:'TEST',inputHash:metricInputHash(metricsInput(player,stat,estimate)),sourceHash:'a'.repeat(64),values:{},evidence:{}}});
    await prisma.roleScoreSnapshot.create({data:{statsId:stat.id,configHash:'a'.repeat(64),datasetHash:'b'.repeat(64),matrixVersion:'TEST',values:{}}});
    for(const patch of [{positionMinutes:{CM:901}},{positionMinutes:{RWB:10}},{positionMinutes:{CM:-1}},{positionMinutes:{CM:1.5}},{positionMinutes:{}},{positionMinutesSource:null},{positionMinutes:null},{positionMinutes:{CM:Infinity}}])await call(400,'PATCH',`/player-stats/${stat.id}`,patch,admin);
    const repeated=await call(200,'PATCH',`/player-stats/${stat.id}`,{goals:1,positionMinutes:{CAM:250,CM:650}},admin);
    assert.equal(repeated.metrics.stale,false);assert(repeated.estimate);
    assert.equal(await prisma.roleScoreSnapshot.count({where:{statsId:stat.id}}),1);
    await call(200,'PATCH',`/player-stats/${stat.id}`,{positionMinutes:{CM:600,CAM:300}},admin);
    assert(await prisma.playerStatsMetrics.findUnique({where:{statsId:stat.id}}));assert.equal(await prisma.roleScoreSnapshot.count({where:{statsId:stat.id}}),0);
    await call(200,'PATCH',`/player-stats/${stat.id}`,{positionMinutes:null,positionMinutesSource:null},admin);
    await call(200,'PATCH',`/player-stats/${stat.id}`,{goals:2},admin);assert.equal(await prisma.playerStatsMetrics.count({where:{statsId:stat.id}}),0);
    assert.equal(await prisma.playerStatsEstimate.count({where:{statsId:stat.id}}),0);
    const injuryBody={playerId:player.id,injuryType:'TEST muscle injury',bodyRegion:' left thigh ',startDate:'2025-01-01',endDate:'2025-01-08'};
    await call(403,'POST','/injury-history',injuryBody,scout);
    const injury=await call(201,'POST','/injury-history',injuryBody,admin);assert.equal(injury.bodyRegion,'LEFT_THIGH');assert.equal(injury.daysMissed,7);
    await call(400,'PATCH',`/injury-history/${injury.id}`,{bodyRegion:''},admin);
    await call(200,'PATCH',`/injury-history/${injury.id}`,{bodyRegion:null},admin);
    const emptySeason='1900/1901';
    assert.equal(await prisma.playerStats.count({where:{season:emptySeason}}),0);
    const emptyRun=spawnSync(process.execPath,['--import','tsx','scripts/prepare-matching-v3.cjs','--actor-id',String(users[0].id),'--season',emptySeason],{cwd:require('node:path').resolve(__dirname,'..'),encoding:'utf8'});
    assert.equal(emptyRun.status,1);assert(emptyRun.stderr.includes('Không có dữ liệu cầu thủ mùa'));
    console.log('PASS: stage1 config/template,35 roles,no scoring routes,blocked V3 activation,admin access,no-op updates retain estimates/cache,real corrections invalidate inputs,position minutes/source,and injury body region. Fixtures cleaned.');
  }finally{
    const ids=players.map(p=>p.id),uids=users.map(u=>u.id);
    if(ids.length){await prisma.injuryHistory.deleteMany({where:{playerId:{in:ids}}});await prisma.playerStats.deleteMany({where:{playerId:{in:ids}}});await prisma.player.deleteMany({where:{id:{in:ids}}});}
    if(uids.length)await prisma.auditLog.deleteMany({where:{actorId:{in:uids}}});
    if(configs.length)await prisma.scoringConfig.deleteMany({where:{id:{in:configs}}});
    if(uids.length)await prisma.user.deleteMany({where:{id:{in:uids}}});
    await new Promise(r=>server.close(r));await prisma.$disconnect();
  }
})().catch(e=>{console.error(e);process.exitCode=1});
