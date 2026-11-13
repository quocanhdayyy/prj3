const assert = require('node:assert/strict');
const app = require('../src/app.ts').default;
const { prisma } = require('../src/config/prisma.ts');
const { createUser } = require('../src/services/user.service.ts');
const { shiftCalendarMonths } = require('../src/services/matching/matching-scoring.service.ts');

(async () => {
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const users = [], players = [], configs = []; let club;
  const tag = Date.now(), password = 'FullMatchingTest123';
  const activeBefore = await prisma.scoringConfig.findFirst({ where: { isActive: true } });
  const call = async (method, path, body, token) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  };
  const expect = async (status, method, path, body, token) => {
    const response = await call(method, path, body, token); assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(response.body)}`); return response.body?.data;
  };
  try {
    for (const [index, role] of [[1,'ADMIN'],[2,'SCOUT'],[3,'SCOUT']]) users.push(await createUser({ username: `engine${index}_${tag}`, email: `engine${index}_${tag}@example.com`, password, role }));
    const tokens = []; for (const user of users) tokens.push((await expect(200,'POST','/auth/login',{ email: user.email, password })).accessToken);
    const [admin,a,b] = tokens;
    await expect(401,'GET','/matching/template'); await expect(401,'POST','/matching/evaluate',{}); await expect(401,'POST','/matching/rank',{});
    const template = await expect(200,'GET','/matching/template',undefined,a);
    assert.equal(template.criteriaWeights.squad.form,null); assert.equal(template.criteriaWeights.risk.injury,null);
    const { instructions, ...configBody } = template;
    assert(instructions.length > 0);
    configBody.name = `Engine test ${tag}`;
    // Arbitrary TEST fixture S/R weights and groups, never persisted as production defaults.
    configBody.criteriaWeights.squad = { position:0.2,age:0.2,form:0.6 };
    configBody.criteriaWeights.risk = { injury:0.6,resale:0.4 };
    configBody.parameters.positionGroups = [['ST','LW','RW'],['CAM','CM','CDM'],['CB','RB','LB']];
    configBody.parameters.completedSeasons = ['2025/2026'];
    await expect(403,'POST','/scoring-configs',configBody,a);
    const invalid = structuredClone(configBody); invalid.parameters.roles.ST.metrics.goals.b = 0.1;
    await expect(409,'POST','/scoring-configs',invalid,admin);
    const config = await expect(201,'POST','/scoring-configs',configBody,admin); configs.push(config.id);
    const day = new Date(`${new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Ho_Chi_Minh'})}T00:00:00Z`);
    club = await prisma.club.create({ data:{name:'Engine fixture club',country:'Vietnam',league:'Test',foundedYear:2000} });
    const requirement = await prisma.clubRequirement.create({ data:{clubId:club.id,userId:users[1].id,minAge:18,maxAge:30,budget:200000000,salaryLimit:30000000,position:'ST',priority:1} });
    for (let index = 0; index < 3; index++) players.push(await prisma.player.create({ data:{name:`Engine fixture ${index}`,dateOfBirth:shiftCalendarMonths(day,-25*12),nationality:'Vietnam',position:'ST',marketValue:24000000,height:180,preferredFoot:'RIGHT'} }));
    for (const [index, player] of players.slice(0,2).entries()) {
      await prisma.contract.create({ data:{playerId:player.id,clubId:club.id,startDate:day,endDate:shiftCalendarMonths(day,48),salaryPerYear:1,status:'ACTIVE'} });
      await prisma.matchingInput.create({ data:{playerId:player.id,requirementId:requirement.id,userId:users[1].id,estimatedFee:180000000,expectedSalaryPerYear:27000000,feeSource:'Test quote',salarySource:'Test quote'} });
      await prisma.playerStats.create({ data:{playerId:player.id,season:'2025/2026',appearances:25,minutesPlayed:2250,goals:index===0?15:0,assists:index===0?5:0,keyPasses:index===0?25:0,yellowCards:0,redCards:0} });
      await prisma.playerDataVerification.create({ data:{playerId:player.id,injuryCoveredFrom:shiftCalendarMonths(day,-24),injuryCoveredThrough:day,injuryVerifiedAt:new Date(),injuryVerifiedById:users[0].id,injurySource:'Complete test coverage'} });
      await prisma.playerMarketValueHistory.createMany({ data:[{playerId:player.id,valuedAt:shiftCalendarMonths(day,-12),marketValue:20000000,source:'Engine test source'},{playerId:player.id,valuedAt:day,marketValue:24000000,source:'Engine test source'}] });
    }
    const body = {playerId:players[0].id,requirementId:requirement.id,season:'2025/2026',formRole:'PRIMARY',configId:config.id};
    await expect(409,'POST','/matching/evaluate',body,a); // Scouts cannot select an inactive config.
    await expect(409,'POST','/matching/search',{requirementId:requirement.id,season:'2025/2026',formRole:'PRIMARY',configId:config.id},a);
    const preview = await expect(200,'POST','/matching/evaluate',body,admin);
    assert.equal(preview.complete,true); assert.equal(preview.saved,false); assert.equal(preview.financialScore,79);
    assert.equal(preview.squadScore,90.4); assert.equal(preview.riskScore,94.4); assert.equal(preview.totalScore,86.64);
    assert.equal(preview.criteria.squad.form.per90.goals,0.6);
    assert.equal(await prisma.matchResult.count({where:{configId:config.id}}),0);
    await expect(200,'POST',`/scoring-configs/${config.id}/activate`,undefined,admin);
    await expect(404,'POST','/matching/evaluate',body,b);
    for (const patch of [{formRole:'BEST'},{season:'2025/2025'},{save:'true'},{totalScore:100},{userId:users[2].id}]) await expect(400,'POST','/matching/evaluate',{...body,...patch},a);
    await expect(409,'POST','/matching/evaluate',{...body,season:'2026/2027'},a);
    const saved = await expect(200,'POST','/matching/evaluate',{...body,save:true},a);
    assert(saved.resultId); assert.equal(saved.saved,true);
    const original = await expect(200,'GET',`/match-results/${saved.resultId}`,undefined,a);
    assert.equal(original.userId,users[1].id); assert.equal(original.totalScore,'86.64');
    assert.equal(original.inputSnapshot.config.version,1); assert.equal(original.inputSnapshot.stats.goals,15);
    await expect(404,'GET',`/match-results/${saved.resultId}`,undefined,b);
    await expect(409,'PATCH',`/scoring-configs/${config.id}`,{parameters:configBody.parameters},admin);
    const rankBody = {requirementId:requirement.id,season:'2025/2026',formRole:'PRIMARY',configId:config.id,playerIds:players.slice(0,2).map(player=>player.id).reverse()};
    const ranking = await expect(200,'POST','/matching/rank',rankBody,a);
    assert.deepEqual(ranking.ranked.map(row=>row.player.id),players.slice(0,2).map(player=>player.id));
    assert.equal(ranking.ranked[0].totalScore,86.64); assert.equal(ranking.ranked[1].totalScore,71.28);
    const expanded = await expect(200,'POST','/matching/rank',{...rankBody,playerIds:players.map(player=>player.id)},a);
    assert.equal(expanded.ranked[0].totalScore,86.64); assert.equal(expanded.incomplete.length,1);
    await expect(404,'POST','/matching/rank',rankBody,b);
    await expect(400,'POST','/matching/rank',{...rankBody,playerIds:[players[0].id,players[0].id]},a);
    await expect(400,'POST','/matching/rank',{...rankBody,playerIds:Array.from({length:101},(_,i)=>i+1)},a);
    assert.equal(await prisma.matchResult.count({where:{configId:config.id}}),1); // rank does not create history.
    const incomplete = await expect(200,'POST','/matching/evaluate',{...body,playerId:players[2].id,save:true},a);
    assert.equal(incomplete.complete,false); assert.equal(incomplete.totalScore,null); assert.equal(incomplete.saved,false);
    assert.equal(incomplete.resultId,null); assert(incomplete.missing.includes('financial.fee'));
    assert.equal(incomplete.criteria.squad.scores.form,null); assert.equal(incomplete.criteria.risk.scores.injury,null);
    // Automatic discovery: imported cohort only; no manual player IDs supplied.
    await expect(401,'POST','/matching/search',{});
    const searchBody = {requirementId:requirement.id,season:'2025/2026',formRole:'PRIMARY',configId:config.id,pageSize:1};
    await expect(404,'POST','/matching/search',searchBody,b);
    for (const patch of [{page:0},{pageSize:101},{pageSize:1.5},{playerIds:[players[0].id]},{save:true},{formRole:'BEST'}])
      await expect(400,'POST','/matching/search',{...searchBody,...patch},a);
    await expect(409,'POST','/matching/search',{...searchBody,season:'2026/2027'},a);
    const manual = await expect(200,'POST','/matching/search',searchBody,a);
    assert(!manual.ranked.some(row=>players.some(player=>player.id===row.player.id)));
    assert.equal(manual.meta.rankedCount,0); // Other players have no estimates for this new requirement.
    const sourceBase = 1900000000 + (tag % 10000000);
    for (const [index,player] of players.entries()) await prisma.player.update({where:{id:player.id},data:{transfermarktId:sourceBase+index}});
    const withoutStats = await expect(200,'POST','/matching/search',searchBody,a);
    assert.equal(withoutStats.meta.totalCandidates,manual.meta.totalCandidates+2); // Imported profile without season statistics is excluded.
    // Imported players with zero minutes remain discoverable and explicitly incomplete.
    await prisma.playerStats.create({data:{playerId:players[2].id,season:'2025/2026',appearances:0,minutesPlayed:0,goals:0,assists:0,yellowCards:0,redCards:0}});
    const discovered = await expect(200,'POST','/matching/search',searchBody,a);
    assert.equal(discovered.meta.totalCandidates,manual.meta.totalCandidates+3);
    assert.equal(discovered.meta.rankedCount,2); assert.equal(discovered.saved,false);
    assert.equal(discovered.ranked[0].player.id,players[0].id); assert.equal(discovered.ranked[0].rank,1);
    for (const field of ['totalScore','financialScore','squadScore','riskScore']) assert.equal(discovered.ranked[0][field],preview[field]);
    assert.deepEqual(discovered.ranked[0].criteria,preview.criteria);
    const secondPage = await expect(200,'POST','/matching/search',{...searchBody,page:2},a);
    assert.equal(secondPage.ranked[0].player.id,players[1].id); assert.equal(secondPage.ranked[0].rank,2);
    const lastPage = await expect(200,'POST','/matching/search',{...searchBody,page:discovered.meta.totalPages},a);
    assert.equal(lastPage.incomplete[0].player.id,players[2].id);
    assert.equal(lastPage.incomplete[0].totalScore,null); assert(lastPage.incomplete[0].missing.includes('financial.fee'));
    assert.equal(lastPage.incomplete[0].player.name,players[2].name);
    const beyond = await expect(200,'POST','/matching/search',{...searchBody,page:discovered.meta.totalPages+1},a);
    assert.deepEqual(beyond.ranked,[]); assert.deepEqual(beyond.incomplete,[]);
    // No new hard age/budget constraints: the agreed scoring formulas still apply.
    await prisma.clubRequirement.update({where:{id:requirement.id},data:{minAge:80,maxAge:90,budget:100000000}});
    const overBudget = await expect(200,'POST','/matching/search',searchBody,a);
    assert.equal(overBudget.meta.rankedCount,2); assert.equal(overBudget.scope.ageFilter,false);
    assert(overBudget.ranked[0].financialScore < discovered.ranked[0].financialScore);
    await prisma.clubRequirement.update({where:{id:requirement.id},data:{minAge:18,maxAge:30,budget:200000000}});
    assert.equal(await prisma.matchResult.count({where:{configId:config.id}}),1); // Discovery never saves history.
    console.log('PASS: Automatic search discovers imported seasonal cohort including zero-minute players, excludes manual fixtures, preserves exact scores, ranks globally before pagination, checks auth/ownership/input and keeps missing data null without saving.');
    await prisma.playerStats.update({where:{playerId_season:{playerId:players[0].id,season:'2025/2026'}},data:{goals:0}});
    const historical = await expect(200,'GET',`/match-results/${saved.resultId}`,undefined,a);
    assert.equal(historical.inputSnapshot.stats.goals,15); assert.equal(historical.totalScore,'86.64');
    const logs = await call('GET',`/audit-logs?entityType=MatchResult&entityId=${saved.resultId}`,undefined,admin);
    assert.equal(logs.body.meta.total,1); assert.equal(logs.body.data[0].actorId,users[1].id);
    console.log('PASS: Full engine template/config validation, exact F/S/R/total, active config access, input/ownership checks, atomic save/history/audit, frozen versions/snapshots, partial data without fake points, candidate-independent ranking. Test-only fixtures cleaned.');
  } finally {
    const userIds = users.map(user=>user.id), playerIds = players.map(player=>player.id);
    if (configs.length) await prisma.matchResult.deleteMany({where:{configId:{in:configs}}});
    if (userIds.length) await prisma.auditLog.deleteMany({where:{actorId:{in:userIds}}});
    if (configs.length) await prisma.scoringConfig.deleteMany({where:{id:{in:configs}}});
    if (activeBefore) await prisma.scoringConfig.update({where:{id:activeBefore.id},data:{isActive:true}});
    if (playerIds.length) {
      await prisma.matchingInput.deleteMany({where:{playerId:{in:playerIds}}});
      await prisma.playerMarketValueHistory.deleteMany({where:{playerId:{in:playerIds}}});
      await prisma.playerDataVerification.deleteMany({where:{playerId:{in:playerIds}}});
      await prisma.playerStats.deleteMany({where:{playerId:{in:playerIds}}});
      await prisma.contract.deleteMany({where:{playerId:{in:playerIds}}});
      await prisma.player.deleteMany({where:{id:{in:playerIds}}});
    }
    if (userIds.length) {await prisma.clubRequirement.deleteMany({where:{userId:{in:userIds}}});await prisma.user.deleteMany({where:{id:{in:userIds}}});}
    if (club) await prisma.club.delete({where:{id:club.id}});
    await new Promise(resolve=>server.close(resolve)); await prisma.$disconnect();
  }
})().catch(error=>{console.error(error);process.exitCode=1});
