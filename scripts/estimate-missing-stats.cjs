const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {prisma}=require('../src/config/prisma.ts');
const {writeAudit}=require('../src/services/audit-log.service.ts');
const {FIELDS,METHOD:BASELINE_METHOD,PERSONAL_METHOD,estimatePlayer,personalizePrediction,validateEstimates}=require('./stat-estimation.cjs');
const ROOT=path.join(__dirname,'..'),DATA=path.join(ROOT,'data/maintenance');
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex');
async function main(){
 const args=process.argv.slice(2);assert(args[0]==='--actor-id'&&/^[1-9]\d*$/.test(args[1]||'')&&args.slice(2).every(x=>x==='--apply'));
 const actorId=Number(args[1]),apply=args.includes('--apply');
 assert.equal((await prisma.user.findUniqueOrThrow({where:{id:actorId},select:{role:true}})).role,'ADMIN');
 const bundle=JSON.parse(await fs.readFile(path.join(ROOT,'data/transfermarkt/prepared.json'),'utf8'));
 const clubLeague=new Map(bundle.clubs.map(c=>[String(c.transfermarktId),c.league]));
 const membership=new Map(bundle.players.map(p=>[p.player.transfermarktId,[...new Set(p.provenance.clubsDuringSeason.map(c=>clubLeague.get(String(c))).filter(Boolean))]]));
 const personalFile=path.join(DATA,'personal-stat-evidence.json');
 const personal=JSON.parse(await fs.readFile(personalFile,'utf8'));
 assert.equal(personal.method,'PERSONAL_SOURCE_EVIDENCE_V1');assert.equal(personal.targetSeason,'2025/2026');
 assert.equal(personal.sourceSha256,crypto.createHash('sha256').update(await fs.readFile(path.join(ROOT,'data/supplemental-stats/raw/sofascore_player_seasons.csv'))).digest('hex'));
 assert.equal(personal.identityBridgeSha256,crypto.createHash('sha256').update(await fs.readFile(path.join(ROOT,'data/stats-enrichment/reference/reep-people.csv'))).digest('hex'));
 const personalIndex=new Map();for(const entry of personal.entries){const list=personalIndex.get(entry.transfermarktId)||[];list.push(entry);personalIndex.set(entry.transfermarktId,list);}
 const METHOD=PERSONAL_METHOD,personalEvidenceSha256=hash(personal);
 await fs.mkdir(DATA,{recursive:true,mode:0o700});
 const result=await prisma.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(51943, 2025)`;
  const players=await tx.player.findMany({where:{transfermarktId:{not:null}},orderBy:{id:'asc'},include:{stats:{where:{season:'2025/2026'}}}});
  const donors=players.map(p=>({id:p.id,name:p.name,position:p.position,leagues:membership.get(p.transfermarktId)||[],stats:p.stats[0]}));
  const profileIndex=new Map(players.map(p=>[p.id,p]));
  assert(donors.every(p=>p.stats&&p.leagues.length));
  const observedHash=hash(donors),validation=validateEstimates(donors);
  const entries=[],missing=[],personalBasis={};
  for(const target of donors){
   const profile=profileIndex.get(target.id),evidence=(personalIndex.get(profile.transfermarktId)||[]).filter(e=>e.name===profile.name&&e.dateOfBirth===profile.dateOfBirth.toISOString().slice(0,10));
   const prediction=personalizePrediction(target,estimatePlayer(target,donors),evidence),values=prediction.values;
   for(const field of Object.keys(values)){const basis=prediction.fields[field].basis;personalBasis[basis]=(personalBasis[basis]||0)+1;}
   assert(Object.keys(values).every(f=>FIELDS.includes(f)&&target.stats[f]===null&&Number.isInteger(values[f])&&values[f]>=0));
   const completed=target.stats.passesCompleted??values.passesCompleted,attempted=target.stats.passesAttempted??values.passesAttempted;
   if(completed!=null&&attempted!=null)assert(completed<=attempted);
   if(Object.keys(values).length)entries.push({statsId:target.stats.id,method:METHOD,values,evidence:{
    dataBasis:'ESTIMATED_NOT_OBSERVED',season:'2025/2026',playerId:target.id,playerName:target.name,
    targetMinutes:target.stats.minutesPlayed,observedDataSha256:observedHash,minimumDonorMinutes:900,minimumDonors:12,
    policy:'Prefer identity-checked personal 25/26 rates; otherwise shrink personal 24/25 rates toward same-position/league peers. Joint passing preserves completed <= attempted.',
    personalEvidenceSha256,
    warning:'Estimated, not observed 25/26 totals. Prior seasons and cross-provider minutes may differ. Peer quantiles are not a calibrated interval. Does not infer injuries, contract or salary.',
    fields:prediction.fields,
   }});
   for(const field of FIELDS)if(target.stats[field]===null&&values[field]===undefined)missing.push({playerId:target.id,field});
  }
  let written=0,unchanged=0;
  const previous=await tx.playerStatsEstimate.findMany(),prior=new Map(previous.map(e=>[e.statsId,e]));
  const targetIds=new Set(donors.map(p=>p.stats.id)),plannedIds=new Set(entries.map(e=>e.statsId));
  const stale=previous.filter(e=>[METHOD,BASELINE_METHOD].includes(e.method)&&targetIds.has(e.statsId)&&!plannedIds.has(e.statsId));
  const report={mode:apply?'APPLY':'DRY_RUN',method:METHOD,observedDataSha256:observedHash,players:entries.length,
   estimatedFields:entries.reduce((n,e)=>n+Object.keys(e.values).length,0),remainingUnestimatedFields:missing.length,staleEstimateRows:stale.length,
   personalBasis,validation:{peerBaselineOnly:validation,note:'Baseline masking errors are not validation of personal evidence rescaling.'},example:entries.slice(0,5).map(e=>({playerId:e.evidence.playerId,name:e.evidence.playerName,values:e.values})),
   limitation:'Original fields remain null; engine continues to score observed data. Estimates are exposed separately by player-stats API.'};
  if(apply){
   await fs.writeFile(path.join(DATA,`estimates-before-${Date.now()}.json`),JSON.stringify(previous,null,2),{flag:'wx',mode:0o600});
   for(const old of stale){await tx.playerStatsEstimate.delete({where:{statsId:old.statsId}});await writeAudit(tx,{actorId,ipAddress:null},'PlayerStatsEstimate',old.statsId,'DELETE',old);}
   for(const entry of entries){const old=prior.get(entry.statsId);
    if(old&&hash({method:old.method,values:old.values,evidence:old.evidence})===hash({method:entry.method,values:entry.values,evidence:entry.evidence})){unchanged++;continue;}
    await tx.playerStatsEstimate.upsert({where:{statsId:entry.statsId},create:entry,update:{...entry,generatedAt:new Date()}});
    await writeAudit(tx,{actorId,ipAddress:null},'PlayerStatsEstimate',entry.statsId,old?'UPDATE':'CREATE',old,entry);written++;
   }
   const after=await tx.player.findMany({where:{transfermarktId:{not:null}},orderBy:{id:'asc'},include:{stats:{where:{season:'2025/2026'}}}});
   assert.equal(hash(after.map(p=>({id:p.id,name:p.name,position:p.position,leagues:membership.get(p.transfermarktId)||[],stats:p.stats[0]}))),observedHash,'Observed statistics changed');
  }
  return{...report,rowsWritten:written,rowsUnchanged:unchanged};
 },{isolationLevel:'Serializable',timeout:60000});
 if(apply)await fs.writeFile(path.join(DATA,'estimates-report.json'),JSON.stringify({...result,runAt:new Date().toISOString()},null,2),{mode:0o600});
 console.log(JSON.stringify(result,null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>prisma.$disconnect());
