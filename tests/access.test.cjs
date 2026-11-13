const assert=require('node:assert/strict');
const app=require('../src/app.ts').default;
const {prisma}=require('../src/config/prisma.ts');
const {createUser}=require('../src/services/user.service.ts');
(async()=>{
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}/api`;
 const call=async(method,path,body,token)=>{const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined || method==='GET'?{}:{body:JSON.stringify(body)})});return {status:r.status,body:r.status===204?null:await r.json()};};
 let users=[],club,player;const tag=Date.now();const pass='AccessTestPass123';
 try{
  for(const [index,role] of [[1,'SCOUT'],[2,'SCOUT'],[3,'ADMIN']])users.push(await createUser({username:`access${index}_${tag}`,email:`access${index}_${tag}@example.com`,password:pass,role}));
  const tokens=[];for(const u of users){const r=await call('POST','/auth/login',{email:u.email,password:pass});assert.equal(r.status,200);tokens.push(r.body.data.accessToken);}
  const [a,b,admin]=tokens;
  for(const route of ['clubs','players','contracts','player-stats','injury-history','users','club-requirements','shortlists']){
   for(const [method,path,body] of [['GET',`/${route}`],['GET',`/${route}/1`],['POST',`/${route}`,{}],['PATCH',`/${route}/1`,{}],['DELETE',`/${route}/1`]])assert.equal((await call(method,path,body)).status,401);
  }
  assert.equal((await call('GET','/health')).status,200);
  for(const route of ['clubs','players','contracts','player-stats','injury-history']){
   assert.equal((await call('GET',`/${route}`,undefined,a)).status,200);
   for(const method of ['POST','PATCH','DELETE'])assert.equal((await call(method,`/${route}`+(method==='POST'?'':'/1'),{},a)).status,403);
  }
  for(const method of ['GET','POST','PATCH','DELETE'])assert.equal((await call(method,'/users'+(['PATCH','DELETE'].includes(method)?`/${users[0].id}`:''),{},a)).status,403);
  const listed=await call('GET','/users',undefined,admin);assert.equal(listed.status,200);assert(listed.body.data.every(u=>!('passwordHash' in u)));
  const created=await call('POST','/clubs',{name:'Access Test Club',country:'Vietnam',league:'Test',foundedYear:2000},admin);assert.equal(created.status,201);club=created.body.data;
  assert.equal((await call('PATCH',`/clubs/${club.id}`,{name:'Updated Access Club'},admin)).status,200);
  player=await prisma.player.create({data:{name:'Access Player',dateOfBirth:new Date('2000-01-01'),nationality:'Vietnam',position:'CM',marketValue:1,height:180,preferredFoot:'RIGHT'}});
  const input={clubId:club.id,minAge:18,maxAge:25,salaryLimit:'1000',position:'CM',priority:1,budget:'10000'};
  const req=await call('POST','/club-requirements',input,a);assert.equal(req.status,201);const rid=req.body.data.id;assert.equal(req.body.data.userId,users[0].id);
  assert.equal((await call('POST','/club-requirements',{...input,userId:users[1].id},a)).status,400);
  assert.equal((await call('GET','/club-requirements',undefined,b)).body.data.some(x=>x.id===rid),false);
  assert.equal((await call('GET',`/club-requirements/${rid}`,undefined,b)).status,404);
  assert.equal((await call('PATCH',`/club-requirements/${rid}`,{maxAge:30},b)).status,404);
  assert.equal((await call('DELETE',`/club-requirements/${rid}`,undefined,b)).status,404);
  assert.equal((await call('PATCH',`/club-requirements/${rid}`,{maxAge:30},a)).status,200);
  assert.equal((await call('GET',`/club-requirements/${rid}`,undefined,admin)).status,200);
  assert.equal((await call('PATCH',`/club-requirements/${rid}`,{priority:2},admin)).status,200);
  const short=await call('POST','/shortlists',{playerId:player.id,requirementId:rid},a);assert.equal(short.status,201);const sid=short.body.data.id;
  assert.equal((await call('POST','/shortlists',{playerId:player.id,requirementId:rid},b)).status,409);
  assert.equal((await call('POST','/shortlists',{playerId:player.id,userId:users[1].id},a)).status,400);
  assert.equal((await call('GET','/shortlists',undefined,b)).body.data.some(x=>x.id===sid),false);
  for(const method of ['GET','PATCH','DELETE'])assert.equal((await call(method,`/shortlists/${sid}`,method==='PATCH'?{note:'stolen'}:undefined,b)).status,404);
  assert.equal((await call('PATCH',`/shortlists/${sid}`,{note:'own'},a)).status,200);
  assert.equal((await call('GET',`/shortlists/${sid}`,undefined,admin)).status,200);
  assert.equal((await call('PATCH',`/shortlists/${sid}`,{note:'admin'},admin)).status,200);
  assert.equal((await call('DELETE',`/shortlists/${sid}`,undefined,admin)).status,204);
  assert.equal((await call('DELETE',`/club-requirements/${rid}`,undefined,a)).status,204);
  assert.equal((await call('DELETE',`/clubs/${club.id}`,undefined,admin)).status,204);club=null;
  await prisma.user.update({where:{id:users[2].id},data:{role:'SCOUT'}});
  assert.equal((await call('GET','/users',undefined,admin)).status,403);
  console.log('PASS: All data routes require auth; Scout read-only catalog; Admin CRUD; token-derived ownership; private list/detail/PATCH/DELETE isolation; spoofed IDs blocked; role changes reflected immediately.');
 }finally{
  const ids=users.map(u=>u.id);if(ids.length){await prisma.shortlistItem.deleteMany({where:{userId:{in:ids}}});await prisma.shortlist.deleteMany({where:{userId:{in:ids}}});await prisma.clubRequirement.deleteMany({where:{userId:{in:ids}}});await prisma.user.deleteMany({where:{id:{in:ids}}});}
  if(player)await prisma.player.delete({where:{id:player.id}});if(club)await prisma.club.delete({where:{id:club.id}});
  await new Promise(r=>server.close(r));await prisma.$disconnect();
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
