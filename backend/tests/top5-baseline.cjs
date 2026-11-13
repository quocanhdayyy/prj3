// Historical import checks must account for the explicit, audited scope reduction.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const root = path.join(__dirname,'../data/scope-top5');
const read = file => JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const scope = fs.existsSync(path.join(root,'report.json')) ? read('report.json') : null;
const checkpoint = scope ? read(scope.checkpointFile) : null;
const removed = new Set(scope?.removedPlayerIds || []), removedClubs = new Set(scope?.removedClubIds || []);
const updates = new Map((scope?.updatedStats || []).map(r=>[r.id,r.data]));
const sha = v => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const maintenanceRoot=path.join(__dirname,'../data/maintenance');
const repairReport=fs.existsSync(path.join(maintenanceRoot,'repair-report.json'))?JSON.parse(fs.readFileSync(path.join(maintenanceRoot,'repair-report.json'),'utf8')):null;
const repair=repairReport?JSON.parse(fs.readFileSync(path.join(maintenanceRoot,repairReport.backupFile),'utf8')):null;
if(repairReport)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(maintenanceRoot,repairReport.backupFile))).digest('hex'),repairReport.backupSha256);
const deletedIds=model=>new Set((repair?.deleted[model]||[]).map(r=>r.id??r.playerId));
const repairUpdates=new Map();for(const c of repair?.changes||[])repairUpdates.set(c.old.id,{...repairUpdates.get(c.old.id),...c.data});
const scopeStats = rows => rows.filter(r=>!removed.has(r.playerId)&&!deletedIds('playerStats').has(r.id)).map(r=>({...r,...(updates.get(r.id)||{}),...(repairUpdates.get(r.id)||{})}));
const restoreDeleted=(model,rows,ids,select)=>{
 const key=model==='playerDataVerification'?'playerId':'id',seen=new Set(rows.map(r=>r[key]));
 const deleted=(repair?.deleted[model]||[]).filter(r=>!seen.has(r[key])&&(!ids||ids.includes(r[key])));
 const project=r=>select?Object.fromEntries(Object.keys(select).map(k=>[k,r[k]])):r;
 return [...rows,...deleted.map(project)].sort((a,b)=>a[key]-b[key]);
};
async function assertProtected(prisma, model, baseline) {
  const key=model==='playerDataVerification'?'playerId':'id';
  const rows=await prisma[model].findMany({orderBy:{[key]:'asc'}});
  if(scope && (model==='player'||model==='club')) {
    const original=model==='player'?checkpoint.allPlayers:checkpoint.allClubs;
    assert.equal(sha(original),baseline.sha256,model+' historical baseline before scope');
    const deleted=model==='player'?removed:removedClubs;
    assert.equal(sha(restoreDeleted(model,rows)),sha(original.filter(r=>!deleted.has(r.id))),model+' retained records'); return;
  }
  if(scope && model==='playerMarketValueHistory') {
    assert.equal(rows.length,baseline.count-scope.removed.valuations-(repair?.deleted.playerMarketValueHistory.length||0));
    const kept=new Set(checkpoint.allPlayers.filter(p=>p.transfermarktId!==null&&!removed.has(p.id)).map(p=>p.id));
    assert.equal(sha(rows.filter(r=>kept.has(r.playerId))),checkpoint.retainedValuations.sha256); return;
  }
  const restored=restoreDeleted(model,rows);
  assert.equal(restored.length,baseline.count); assert.equal(sha(restored),baseline.sha256,model+' changed');
}
module.exports={scope,scopeStats,assertProtected,restoreDeleted,deletedIds};
