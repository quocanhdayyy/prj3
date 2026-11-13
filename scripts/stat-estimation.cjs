const FIELDS = ['tacklesWon', 'interceptions', 'keyPasses', 'passesCompleted', 'passesAttempted'];
const METHOD = 'PEER_MEDIAN_PER90_V1';
const PERSONAL_METHOD = 'PERSONAL_EVIDENCE_PER90_V2';
const role = position => ({LW:'WING',RW:'WING',LB:'FULLBACK',RB:'FULLBACK'})[position] || position;
const quantile = (values, q) => {
  const sorted = [...values].sort((a,b)=>a-b), index = (sorted.length-1)*q;
  const low = Math.floor(index), fraction = index-low;
  return sorted[low] + ((sorted[low+1] ?? sorted[low])-sorted[low])*fraction;
};
const cohort = (target, donors, eligible) => {
  const known = donors.filter(d=>d.id!==target.id && d.stats.minutesPlayed>=900 && eligible(d.stats));
  const tests = [
    ['SAME_POSITION_AND_LEAGUE',d=>d.position===target.position&&d.leagues.some(l=>target.leagues.includes(l))],
    ['SAME_ROLE_AND_LEAGUE',d=>role(d.position)===role(target.position)&&d.leagues.some(l=>target.leagues.includes(l))],
    ['SAME_POSITION_TOP5',d=>d.position===target.position],
    ['SAME_ROLE_TOP5',d=>role(d.position)===role(target.position)],
  ];
  for (const [basis,predicate] of tests) {
    const rows = known.filter(predicate);
    if (rows.length>=12) return {basis,rows};
  }
  return null; // Never substitute an unrelated position just to manufacture a number.
};

function estimatePlayer(target, donors) {
  const values={}, fields={}, stats=target.stats, scale=stats.minutesPlayed/90;
  if (!Number.isFinite(scale)||scale<=0) return {values,fields};
  const note = (field, pool, rates, predicted, extra={}) => {
    values[field]=Math.max(0,Math.round(predicted));
    fields[field]={basis:pool.basis,donorCount:pool.rows.length,donorPlayerIds:pool.rows.map(d=>d.id),
      medianPer90:quantile(rates,0.5),peerP10Per90:quantile(rates,0.1),peerP90Per90:quantile(rates,0.9),
      uncertainty:'NOT_AN_OBSERVATION',...extra};
  };
  for (const field of FIELDS.slice(0,3)) {
    if (stats[field]!==null) continue;
    const pool=cohort(target,donors,s=>s[field]!==null);
    if (!pool) continue;
    const rates=pool.rows.map(d=>d.stats[field]*90/d.stats.minutesPlayed);
    note(field,pool,rates,quantile(rates,0.5)*scale);
  }
  const completed=stats.passesCompleted, attempted=stats.passesAttempted;
  if (completed===null || attempted===null) {
    const pool=cohort(target,donors,s=>s.passesCompleted!==null&&s.passesAttempted!==null&&s.passesAttempted>0&&s.passesCompleted<=s.passesAttempted);
    if (pool) {
      const ratios=pool.rows.map(d=>d.stats.passesCompleted/d.stats.passesAttempted), ratio=quantile(ratios,0.5);
      const attemptedRates=pool.rows.map(d=>d.stats.passesAttempted*90/d.stats.minutesPlayed);
      const completedRates=pool.rows.map(d=>d.stats.passesCompleted*90/d.stats.minutesPlayed);
      if (attempted===null) {
        const predicted=completed===null?quantile(attemptedRates,0.5)*scale:ratio>0?completed/ratio:null;
        if (predicted!==null) note('passesAttempted',pool,attemptedRates,Math.max(completed??0,predicted),{completionRatio:ratio});
      }
      if (completed===null) {
        const attempts=attempted??values.passesAttempted;
        if (attempts!==undefined) note('passesCompleted',pool,completedRates,Math.min(attempts,attempts*ratio),{completionRatio:ratio});
      }
    }
  }
  return {values,fields};
}

// Mask known fields, exclude the target from donors, report error rather than claiming accuracy.
function validateEstimates(donors) {
  const result={};
  for (const field of FIELDS) {
    const targets=donors.filter(d=>d.stats.minutesPlayed>=900&&d.stats[field]!==null).sort((a,b)=>a.id-b.id);
    const stride=Math.max(1,Math.floor(targets.length/150));
    const errors=[];
    for (let i=0;i<targets.length&&errors.length<150;i+=stride) {
      const target=targets[i], masked={...target,stats:{...target.stats,[field]:null}};
      // Hide both passing fields to mirror the common fully-missing case.
      if (field.startsWith('passes')) {masked.stats.passesCompleted=null;masked.stats.passesAttempted=null;}
      const predicted=estimatePlayer(masked,donors).values[field];
      if (predicted===undefined) continue;
      errors.push(Math.abs(predicted-target.stats[field])*90/target.stats.minutesPlayed);
    }
    result[field]={maskedPlayers:errors.length,meanAbsoluteErrorPer90:errors.length?errors.reduce((a,b)=>a+b,0)/errors.length:null};
  }
  return result;
}
function personalizePrediction(target, baseline, evidence) {
  const values={...baseline.values},fields={...baseline.fields},minutes=target.stats.minutesPlayed;
  if(minutes<=0)return baseline;
  const current=evidence.find(e=>e.sourceSeason==='2025/2026');
  const prior=evidence.find(e=>e.sourceSeason==='2024/2025');
  const describe=(field,entry,weight,value,extra={})=>{
    values[field]=Math.max(0,Math.round(value));
    fields[field]={...baseline.fields[field],basis:entry.sourceSeason==='2025/2026'?'PERSONAL_CURRENT_SEASON_RESCALED':'PERSONAL_PRIOR_SEASON_SHRUNK',
      personalWeight:weight,personalPer90:entry.values[field]*90/entry.minutes,
      personalEvidence:{sourceSeason:entry.sourceSeason,sourceMinutes:entry.minutes,sourceValue:entry.values[field],
        sourcePlayerId:entry.sourcePlayerId,identityBasis:entry.identityBasis,sourceTeam:entry.sourceTeam,
        sourceUrl:entry.sourceUrl,sourceSha256:entry.sourceSha256,row:entry.row},...extra};
  };
  for(const field of FIELDS.slice(0,3)){
    if(target.stats[field]!==null)continue;
    const entry=current?.values[field]!==undefined?current:prior?.values[field]!==undefined?prior:null;
    if(!entry||!fields[field])continue;
    const weight=entry===current?1:Math.min(0.65,entry.minutes/(entry.minutes+900));
    const rate=weight*entry.values[field]*90/entry.minutes+(1-weight)*fields[field].medianPer90;
    describe(field,entry,weight,rate*minutes/90);
  }
  const pair=e=>e&&e.values.passesCompleted!==undefined&&e.values.passesAttempted!==undefined&&e.values.passesAttempted>0&&e.values.passesCompleted<=e.values.passesAttempted;
  const entry=pair(current)?current:pair(prior)?prior:null;
  if(entry&&(target.stats.passesCompleted===null||target.stats.passesAttempted===null)){
    const weight=entry===current?1:Math.min(0.65,entry.minutes/(entry.minutes+900));
    const personalRatio=entry.values.passesCompleted/entry.values.passesAttempted;
    const baseRatio=baseline.fields.passesAttempted?.completionRatio??baseline.fields.passesCompleted?.completionRatio??personalRatio;
    const ratio=weight*personalRatio+(1-weight)*baseRatio;
    let attempts=target.stats.passesAttempted;
    if(attempts===null&&baseline.fields.passesAttempted){
      const baseRate=baseline.fields.passesAttempted.medianPer90;
      const rate=weight*entry.values.passesAttempted*90/entry.minutes+(1-weight)*baseRate;
      const predicted=target.stats.passesCompleted!==null&&ratio>0?target.stats.passesCompleted/ratio:rate*minutes/90;
      describe('passesAttempted',entry,weight,Math.max(target.stats.passesCompleted??0,predicted),{completionRatio:ratio});attempts=values.passesAttempted;
    }
    if(target.stats.passesCompleted===null&&baseline.fields.passesCompleted&&attempts!==null&&attempts!==undefined)
      describe('passesCompleted',entry,weight,Math.min(attempts,attempts*ratio),{completionRatio:ratio});
  }
  return{values,fields};
}
module.exports={FIELDS,METHOD,PERSONAL_METHOD,estimatePlayer,personalizePrediction,validateEstimates};
