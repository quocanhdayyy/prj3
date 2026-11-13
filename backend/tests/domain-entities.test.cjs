const assert = require('node:assert/strict');
const { prisma } = require('../src/config/prisma.ts');
const ROLLBACK = 'ENTITY_TEST_ROLLBACK';
let counter = 0;
async function fixture(tx) {
  const key = `${Date.now()}_${++counter}`;
  const user = await tx.user.create({data:{username:`entity_${key}`,email:`entity_${key}@example.com`,passwordHash:'test-only'}});
  const club = await tx.club.create({data:{name:'Entity Test Club',country:'Vietnam',league:'Test',foundedYear:2000}});
  const destination = await tx.club.create({data:{name:'Destination Test Club',country:'Vietnam',league:'Test',foundedYear:2001}});
  const player = await tx.player.create({data:{name:'Entity Test Player',dateOfBirth:new Date('2000-01-01'),nationality:'Vietnam',position:'CM',marketValue:1,height:180,preferredFoot:'RIGHT'}});
  const requirement = await tx.clubRequirement.create({data:{userId:user.id,clubId:club.id,minAge:18,maxAge:25,salaryLimit:1000,position:'CM',priority:1,budget:10000}});
  const config = await tx.scoringConfig.create({data:{name:`Entity ${key}`,version:1,financialWeight:'0.4',squadWeight:'0.4',riskWeight:'0.2',criteriaWeights:{},parameters:{}}});
  return {user,club,destination,player,requirement,config};
}
async function scenario(check) {
  await assert.rejects(prisma.$transaction(async tx => {
    await check(tx, await fixture(tx));
    throw new Error(ROLLBACK);
  }), error => error.message === ROLLBACK);
}
const resultData = f => ({userId:f.user.id,playerId:f.player.id,requirementId:f.requirement.id,configId:f.config.id,totalScore:80,financialScore:80,squadScore:80,riskScore:80,criteriaScores:{},prosCons:{pros:[],cons:[]},inputSnapshot:{season:'test'}});
(async()=>{
  await scenario(async(tx,f)=>{
    const list=await tx.shortlist.create({data:{userId:f.user.id,name:'Summer'}});
    const other=await tx.shortlist.create({data:{userId:f.user.id,name:'Winter'}});
    const data={userId:f.user.id,playerId:f.player.id,shortlistId:list.id};
    await tx.shortlistItem.create({data});
    await tx.shortlistItem.create({data:{...data,shortlistId:other.id}});
    await assert.rejects(tx.shortlistItem.create({data}),e=>e.code==='P2002');
  });
  await scenario(async(tx,f)=>{
    const list=await tx.shortlist.create({data:{userId:f.user.id,name:'Owner'}});
    const other=await tx.user.create({data:{username:`other_${Date.now()}`,email:`other_${Date.now()}@example.com`,passwordHash:'test-only'}});
    await assert.rejects(tx.shortlistItem.create({data:{userId:other.id,playerId:f.player.id,shortlistId:list.id}}),e=>e.code==='P2003');
  });
  await scenario(async(tx,f)=>{
    await tx.transfer.create({data:{playerId:f.player.id,fromClubId:f.club.id,toClubId:f.destination.id,transferDate:new Date('2025-07-01'),type:'PERMANENT',fee:'12345.67',source:'test',reliability:'OFFICIAL'}});
    await tx.transfer.create({data:{playerId:f.player.id,toClubId:f.destination.id,transferDate:new Date('2025-08-01'),type:'FREE',fee:0}});
    await assert.rejects(tx.transfer.create({data:{playerId:f.player.id,toClubId:f.club.id,fromClubId:f.club.id,transferDate:new Date('2025-09-01'),type:'PERMANENT'}}));
  });
  await scenario(async(tx,f)=>{
    const data={userId:f.user.id,playerId:f.player.id,type:'CONTRACT_EXPIRING',title:'Test',content:'Test notification',eventKey:'contract:1:6months'};
    await tx.notification.create({data});
    await assert.rejects(tx.notification.create({data}),e=>e.code==='P2002');
  });
  await scenario(async(tx,f)=>{
    await tx.matchResult.create({data:resultData(f)});
    await tx.scoringConfig.update({where:{id:f.config.id},data:{isActive:false}});
    await assert.rejects(tx.scoringConfig.update({where:{id:f.config.id},data:{parameters:{changed:true}}}));
  });
  await scenario(async(tx,f)=>{
    await assert.rejects(tx.matchResult.create({data:{...resultData(f),totalScore:101}}));
  });
  await scenario(async(tx,f)=>{
    await assert.rejects(tx.scoringConfig.create({data:{name:'invalid',version:1,financialWeight:'0.5',squadWeight:'0.4',riskWeight:'0.2',criteriaWeights:{},parameters:{}}}));
  });
  await scenario(async(tx,f)=>{
    const log=await tx.auditLog.create({data:{entityType:'Player',entityId:f.player.id,action:'UPDATE',actorId:f.user.id,oldValue:{name:'Old'},newValue:{name:'New'},ipAddress:'127.0.0.1'}});
    assert.equal(log.newValue.name,'New');
    const saved=await tx.matchResult.create({data:resultData(f)});
    await tx.player.update({where:{id:f.player.id},data:{marketValue:20}});
    assert.deepEqual((await tx.matchResult.findUniqueOrThrow({where:{id:saved.id}})).inputSnapshot,{season:'test'});
  });
  console.log('PASS: New domain entities, Shortlist ownership/duplicates, transfer constraints, notification deduplication, config version protection, score ranges, audit storage. All fixture writes rolled back.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>prisma.$disconnect());
