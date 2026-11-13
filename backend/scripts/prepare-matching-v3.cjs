// Stage 1: validate configuration and inventory existing inputs. Never calculate scores.
require('dotenv/config');
const fs = require('node:fs');
const path = require('node:path');
const { prisma } = require('../src/config/prisma.ts');
const { Prisma } = require('../src/generated/prisma/client.ts');
const { inspectInputs } = require('../src/services/matching/v3/input-readiness.ts');
const { v3Template, validateV3Config, BUILTIN_NAME } = require('../src/services/matching/v3/config.ts');
const { writeAudit } = require('../src/services/audit-log.service.ts');
async function main() {
  const args = process.argv.slice(2);
  if (args.length % 2 || args.some((v,i) => i%2===0 && !['--actor-id','--season'].includes(v)) || new Set(args.filter((_,i)=>i%2===0)).size !== args.length/2) throw new Error('Usage: npm run matching:v3:prepare -- --actor-id ADMIN_ID [--season 2025/2026]');
  const arg = (name,fallback) => { const i=args.indexOf(name);return i<0?fallback:args[i+1]; };
  const actorId = Number(arg('--actor-id'));
  if (!Number.isInteger(actorId) || actorId<=0) throw new Error('--actor-id phải là ID Admin hiện có.');
  const season = arg('--season','2025/2026');
  if (!/^\d{4}\/\d{4}$/.test(season) || +season.slice(5)!==+season.slice(0,4)+1 || new Date(`${season.slice(5)}-07-01T00:00:00Z`)>new Date()) throw new Error('Mùa phải liên tiếp và đã kết thúc.');
  const report = await prisma.$transaction(async tx => {
    const admin=await tx.user.findUnique({where:{id:actorId}});
    if (admin?.role!=='ADMIN') throw new Error('Chỉ Admin được chuẩn bị cấu hình V3.');
    const template=v3Template();
    const expected=validateV3Config({...template,id:0,createdAt:new Date(),isActive:false,
      financialWeight:new Prisma.Decimal(template.financialWeight),squadWeight:new Prisma.Decimal(template.squadWeight),riskWeight:new Prisma.Decimal(template.riskWeight)});
    let config=await tx.scoringConfig.findUnique({where:{name_version:{name:BUILTIN_NAME,version:1}}});
    let created=false;
    if (config) {
      if (validateV3Config(config).hash!==expected.hash) throw new Error('Cấu hình cùng tên/phiên bản đã khác template; không ghi đè. Hãy tạo phiên bản mới.');
    } else {
      config=await tx.scoringConfig.create({data:template});created=true;
      await writeAudit(tx,{actorId,ipAddress:null},'ScoringConfig',config.id,'CREATE',undefined,config);
    }
    const rows=await tx.playerStats.findMany({where:{season},include:{player:true,estimate:true,metrics:true},orderBy:{id:'asc'}});
    if (!rows.length) throw new Error(`Không có dữ liệu cầu thủ mùa ${season}; chưa thể xác nhận giai đoạn 1.`);
    return {...inspectInputs(rows,season),generatedAt:new Date().toISOString(),config:{id:config.id,created,isActive:config.isActive},
      inputChanges:0,readiness:{
        financialQuotes:await tx.matchingInput.count(),activeContracts:await tx.contract.count({where:{status:'ACTIVE'}}),
        injuryRows:await tx.injuryHistory.count(),injuryRowsWithBodyRegion:await tx.injuryHistory.count({where:{bodyRegion:{not:null}}}),
        injuryCoverageRecords:await tx.playerDataVerification.count({where:{injuryVerifiedAt:{not:null}}}),
        marketValueHistoryRows:await tx.playerMarketValueHistory.count(),positionMinutesRows:await tx.playerStats.count({where:{season,positionMinutes:{not:Prisma.DbNull}}}),
      }};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:30000});
  const dest=path.resolve(__dirname,'../data/v3-metrics/stage-1-readiness.json');
  fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,JSON.stringify(report,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({implementationStage:report.implementationStage,scoringAvailable:report.scoringAvailable,config:report.config,totals:report.totals,statuses:report.statuses,readiness:report.readiness,issues:report.issues.length,report:dest},null,2));
  if(report.issues.length)process.exitCode=1;
}
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>prisma.$disconnect());
