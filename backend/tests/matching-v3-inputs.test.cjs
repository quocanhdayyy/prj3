const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('../src/generated/prisma/client.ts');
const C = require('../src/services/matching/v3/config.ts');
const { inspectMetric, inspectInputs } = require('../src/services/matching/v3/input-readiness.ts');
const { metricsInput, metricInputHash, positionMinutesIssue } = require('../src/services/player-metrics-input.ts');
const near = (a,b) => assert(Math.abs(a-b)<1e-10);
const metric = (value,status='DERIVED',unit='PER_90',extra={})=>({value,status,unit,basis:'TEST',...extra});

test('workbook registry:35 distinct roles,33 outfield,2 GK,all columns sum100%',()=>{
  assert.equal(C.roles.length,35);assert.equal(new Set(C.roles.map(r=>r.id)).size,35);
  assert.equal(C.roles.filter(r=>r.group==='GK').length,2);
  for(const r of C.roles){near(Object.values(r.weights).reduce((a,b)=>a+b,0),1);assert(Object.values(r.weights).every(w=>Number.isFinite(w)&&w>=0&&w<=1));}
  assert.equal(C.inputMetrics.outfield.length,18);assert.equal(C.inputMetrics.goalkeeper.length,6);
  assert.deepEqual(C.roles.filter(r=>r.group==='CB').map(r=>r.name),['No-Nonsense CB','Ball-Playing CB','Stopper','Covering CB']);
  near(C.roles.find(r=>r.id==='BALL_PLAYING_CB').weights.progressivePassesPer90,.28);
  near(C.roles.find(r=>r.id==='TRADITIONAL_GK').weights.goalsPreventedPer90,.4);
});
test('all ten supported positions map into seven groups; GK has no neighbor',()=>{
  assert.equal(Object.keys(C.positionGroup).length,10);assert.equal(C.positionGroup.CDM,'MIDFIELD');assert.equal(C.positionGroup.RB,'FULLBACK');assert.deepEqual(C.adjacent.GK,[]);
});
test('options are validated,defensively cloned,and preserve agreed defaults',()=>{
  const a=C.parseOptions();a.leagues.push('La Liga');assert.deepEqual(C.parseOptions().leagues,[]);
  assert.equal(C.parseOptions().minMinutes,900);assert.equal(C.parseOptions().minimumRoleScore,70);assert.equal(C.parseOptions().feeTolerance,0);
  for(const b of [{minMinutes:-1},{minimumRoleScore:101},{dataMode:'FAKE'},{allowPositionShift:'yes'},{leagues:['Eredivisie']},{minimumAge:30,maximumAge:20},{topN:101},{wageTolerance:Infinity},{minMinute:450}])assert.throws(()=>C.parseOptions(b));
});
test('settings reject fractional minute thresholds,zero multiplier and invalid transfers',()=>{
  const settings=C.validateSettings(C.defaultSettings);settings.trackingTransfers.sprintsPer90.pressuresPer90=.1;assert.equal(C.defaultSettings.trackingTransfers.sprintsPer90.pressuresPer90,1);
  for(const patch of [{referenceMinMinutes:450.5},{referenceMinMinutes:0},{marketValueFeeMultiplier:0},{minimumReferencePlayers:0},{valuationMinimumPoints:3},{missingInjuryScore:99},{trackingTransfers:{sprintsPer90:{goalsPer90:1}}},{trackingTransfers:{sprintsPer90:{pressuresPer90:.5}}}])assert.throws(()=>C.validateSettings({...structuredClone(C.defaultSettings),...patch}));
});
test('versioned config matches template and detects incompatible matrix',()=>{
  const t=C.v3Template();const record={...t,id:5,isActive:false,createdAt:new Date(),financialWeight:new Prisma.Decimal(t.financialWeight),squadWeight:new Prisma.Decimal(t.squadWeight),riskWeight:new Prisma.Decimal(t.riskWeight)};
  assert.equal(C.validateV3Config(record).hash,C.builtinConfig().hash);
  record.parameters.matrixVersion='wrong';assert.throws(()=>C.validateV3Config(record),/ma trận/);
});
test('weights normalize positive sums;zero and unknown keys fail',()=>{
  near(C.unitWeights({financial:30,squad:50,risk:20},['financial','squad','risk'],'weights').squad,.5);
  assert.throws(()=>C.unitWeights({financial:0,squad:0,risk:0},['financial','squad','risk'],'weights'));
  assert.throws(()=>C.unitWeights({financial:1,squad:0,risk:0,total:1},['financial','squad','risk'],'weights'));
});
test('input contract preserves signed keeper metric,real zero and missing null',()=>{
  assert(inspectMetric('goalsPreventedPer90',metric(-.2)).usable);
  assert(inspectMetric('goalsPer90',metric(0)).usable);
  assert.equal(inspectMetric('goalsPer90',metric(-1)).usable,false);
  assert.equal(inspectMetric('goalsPer90',{value:null,status:'MISSING'}).status,'MISSING');
  assert.equal(inspectMetric('goalsPer90',metric(2,'DERIVED','PERCENT')).usable,false);
  assert.equal(inspectMetric('savePercentage',metric(101,'ESTIMATED','PERCENT')).usable,false);
});
test('ratios need event counts,safely reject denominator0,infinity and successes>attempts',()=>{
  for(const extra of [{},{successes:0,attempts:0},{successes:11,attempts:10},{successes:1,attempts:Infinity}])assert.equal(inspectMetric('aerialWinPercentage',metric(50,'ESTIMATED','PERCENT',extra)).usable,false);
  assert(inspectMetric('aerialWinPercentage',metric(50,'ESTIMATED','PERCENT',{successes:1,attempts:2})).usable);
  assert.equal(inspectMetric('aerialWinPercentage',metric(60,'ESTIMATED','PERCENT',{successes:1,attempts:2})).usable,false);
});
test('inventory separates estimates from observations,detects stale input,and never scores',()=>{
  const row={id:1,playerId:1,season:'2025/2026',appearances:25,minutesPlayed:2250,goals:1,assists:1,yellowCards:0,redCards:0,tacklesWon:1,interceptions:1,keyPasses:1,passesCompleted:1,passesAttempted:1,positionMinutes:null,estimate:null,
    player:{id:1,transfermarktId:1,name:'TEST',dateOfBirth:new Date('2000-01-01'),position:'CM',height:180}};
  const values=Object.fromEntries(C.inputMetrics.outfield.map(k=>[k,metric(C.percentageMetrics.has(k)?50:1,'ESTIMATED',C.percentageMetrics.has(k)?'PERCENT':'PER_90',C.ratioMetrics.has(k)?{successes:1,attempts:2}:{})]));
  row.metrics={inputHash:metricInputHash(metricsInput(row.player,row,null)),values,evidence:{leagues:['Premier League']}};
  let report=inspectInputs([row],row.season);assert.equal(report.totals.completePrototypeInputs,1);assert.equal(report.totals.completeObservedInputs,0);assert.equal(report.scoringAvailable,false);assert.equal(report.issues.length,0);assert(!Object.hasOwn(report,'totalScore'));
  row.player.height=185;report=inspectInputs([row],row.season);assert.equal(report.totals.staleRecords,1);assert.equal(report.totals.completePrototypeInputs,0);
});
test('position minute validation is shared by imports and API,including missing source and over-allocation',()=>{
  assert.equal(positionMinutesIssue(900,{CM:650,CAM:250},'TEST match logs'),null);
  assert(positionMinutesIssue(900,{CM:901},'TEST'));
  assert(positionMinutesIssue(900,{CM:1},null));
  assert(positionMinutesIssue(900,null,'TEST'));
  assert(positionMinutesIssue(900,{LCM:1},'TEST'));
  assert.equal(positionMinutesIssue(900,null,null),null);
});
test('inventory flags malformed imported position minutes and lists zero-minute players as incomplete',()=>{
  const row={id:1,playerId:1,season:'2025/2026',minutesPlayed:0,positionMinutes:{CM:1},positionMinutesSource:'TEST',estimate:null,metrics:null,
    player:{id:1,transfermarktId:1,name:'Zero-minute fixture',dateOfBirth:new Date('2000-01-01'),position:'CM',height:180}};
  const report=inspectInputs([row],row.season);
  assert.equal(report.totals.zeroMinutePlayers,1);assert.equal(report.totals.invalidPositionMinutesRecords,1);
  assert.equal(report.totals.completePrototypeInputs,0);assert(report.incomplete[0].missing.includes('positiveMinutesPlayed'));
  assert(report.issues.some(issue=>issue.issue.startsWith('INVALID_POSITION_MINUTES')));
});
