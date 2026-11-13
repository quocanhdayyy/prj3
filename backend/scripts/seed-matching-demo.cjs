// Explicit, repeatable local demo. All football facts below are invented.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { prisma } = require('../src/config/prisma.ts');
const { matchingTemplate } = require('../src/config/matching-rules.ts');
const { validateMatchingConfig } = require('../src/services/matching/matching-config.ts');
const { evaluateMatching } = require('../src/services/matching/matching-engine.service.ts');
const { shiftCalendarMonths } = require('../src/services/matching/matching-scoring.service.ts');
const { writeAudit } = require('../src/services/audit-log.service.ts');

const SOURCE = 'DEMO - synthetic football data';
const SEASON = '2025/2026';
const json = value => JSON.parse(JSON.stringify(value));
const day = () => new Date(`${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })}T00:00:00Z`);
const daysAgo = (date, days) => new Date(date.getTime() - days * 86400000);

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--owner-id' || !/^[1-9]\d*$/.test(args[1]) || Number(args[1]) > 2147483647) {
    throw new Error('Dùng: npm run seed:matching -- --owner-id <ID admin đã có>. Không tạo tài khoản hoặc mật khẩu mẫu.');
  }
  const ownerId = Number(args[1]);
  const owner = await prisma.user.findUniqueOrThrow({ where: { id: ownerId }, select: { id: true, username: true, role: true } });
  assert.equal(owner.role, 'ADMIN', 'Chọn tài khoản ADMIN để thử cấu hình demo chưa active.');
  const asOf = day();
  assert(asOf >= new Date('2026-07-01T00:00:00Z'), 'Mùa mẫu 2025/2026 chưa kết thúc.');
  const context = { actorId: owner.id, ipAddress: null };
  const configName = `DEMO Matching - owner ${owner.id}`;
  const existing = await prisma.scoringConfig.findUnique({ where: { name_version: { name: configName, version: 1 } } });

  const ids = await prisma.$transaction(async tx => {
    // Serialize repeated/concurrent runs for the same owner.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(51942, ${owner.id}::integer)`;
    const configAlready = await tx.scoringConfig.findUnique({ where: { name_version: { name: configName, version: 1 } } });
    if (configAlready) {
      const manifest = await tx.auditLog.findFirst({ where: { entityType: 'MatchingDemo', entityId: configAlready.id, actorId: owner.id, action: 'CREATE' } });
      assert(manifest?.newValue?.playerId && manifest.newValue.requirementId, 'Cấu hình trùng tên nhưng thiếu manifest demo; dừng để tránh sửa nhầm dữ liệu.');
      return manifest.newValue;
    }

    const { instructions, ...body } = matchingTemplate();
    body.name = configName;
    // Provisional DEMO weights, not approved defaults and never activated here.
    body.criteriaWeights.squad = { position: 0.2, age: 0.2, form: 0.6 };
    body.criteriaWeights.risk = { injury: 0.6, resale: 0.4 };
    body.parameters.positionGroups = [['ST', 'LW', 'RW'], ['CAM', 'CM', 'CDM'], ['CB', 'RB', 'LB']];
    body.parameters.completedSeasons = [SEASON];
    const config = await tx.scoringConfig.create({ data: { ...body, isActive: false } });
    validateMatchingConfig(config);
    await writeAudit(tx, context, 'ScoringConfig', config.id, 'CREATE', undefined, config);

    const clubs = [];
    for (const name of ['DEMO Former FC', 'DEMO Current FC', 'DEMO Buyer FC']) {
      const club = await tx.club.create({ data: { name, country: 'Vietnam', league: 'DEMO League', foundedYear: 2000 } });
      clubs.push(club);
      await writeAudit(tx, context, 'Club', club.id, 'CREATE', undefined, club);
    }
    const [formerClub, currentClub, buyerClub] = clubs;
    const player = await tx.player.create({ data: {
      name: 'DEMO - Nguyen Minh An', dateOfBirth: new Date('2001-01-15T00:00:00Z'), nationality: 'Vietnam',
      position: 'ST', secondaryPositions: ['LW', 'RW'], marketValue: '50000000', height: 185, preferredFoot: 'RIGHT',
    } });
    await writeAudit(tx, context, 'Player', player.id, 'CREATE', undefined, player);
    const requirement = await tx.clubRequirement.create({ data: {
      userId: owner.id, clubId: buyerClub.id, minAge: 20, maxAge: 30, position: 'ST', priority: 1,
      budget: '60000000', salaryLimit: '10000000',
    } });
    await writeAudit(tx, context, 'ClubRequirement', requirement.id, 'CREATE', undefined, requirement);

    const contractStart = shiftCalendarMonths(asOf, -24);
    const oldContract = await tx.contract.create({ data: {
      playerId: player.id, clubId: formerClub.id, startDate: shiftCalendarMonths(asOf, -60), endDate: contractStart,
      salaryPerYear: '4000000', releaseClause: '40000000', status: 'EXPIRED',
    } });
    const contract = await tx.contract.create({ data: {
      playerId: player.id, clubId: currentClub.id, startDate: contractStart, endDate: shiftCalendarMonths(asOf, 48),
      salaryPerYear: '8000000', releaseClause: '80000000', status: 'ACTIVE',
    } });
    for (const row of [oldContract, contract]) await writeAudit(tx, context, 'Contract', row.id, 'CREATE', undefined, row);
    const transfer = await tx.transfer.create({ data: {
      playerId: player.id, fromClubId: formerClub.id, toClubId: currentClub.id, transferDate: contractStart,
      type: 'PERMANENT', fee: '35000000', reliability: 'UNKNOWN', source: SOURCE,
    } });
    await writeAudit(tx, context, 'Transfer', transfer.id, 'CREATE', undefined, transfer);
    const stats = await tx.playerStats.create({ data: {
      playerId: player.id, season: SEASON, appearances: 30, minutesPlayed: 2250, goals: 15, assists: 5,
      yellowCards: 3, redCards: 0, tacklesWon: 18, interceptions: 10, keyPasses: 25,
      passesCompleted: 600, passesAttempted: 750,
    } });
    await writeAudit(tx, context, 'PlayerStats', stats.id, 'CREATE', undefined, stats);
    const injury = await tx.injuryHistory.create({ data: {
      playerId: player.id, injuryType: 'DEMO - ankle sprain', startDate: daysAgo(asOf, 200), endDate: daysAgo(asOf, 180),
    } });
    await writeAudit(tx, context, 'InjuryHistory', injury.id, 'CREATE', undefined, injury);
    const estimate = await tx.matchingInput.create({ data: {
      playerId: player.id, requirementId: requirement.id, userId: owner.id, estimatedFee: '50000000',
      expectedSalaryPerYear: '9000000', feeSource: SOURCE, salarySource: SOURCE,
    } });
    await writeAudit(tx, context, 'MatchingInput', estimate.id, 'CREATE', undefined, estimate);
    const shortlist = await tx.shortlist.create({ data: { userId: owner.id, name: 'DEMO - ST candidates' } });
    await writeAudit(tx, context, 'Shortlist', shortlist.id, 'CREATE', undefined, shortlist);
    const item = await tx.shortlistItem.create({ data: {
      userId: owner.id, shortlistId: shortlist.id, playerId: player.id, requirementId: requirement.id,
      priority: 1, note: 'DEMO: full synthetic player for matching tests. Not a real scouting report.',
    } });
    await writeAudit(tx, context, 'ShortlistItem', item.id, 'CREATE', undefined, item);
    const notification = await tx.notification.create({ data: {
      userId: owner.id, playerId: player.id, type: 'INJURY_RECORDED', title: 'DEMO - injury record',
      content: 'Synthetic 20-day ankle injury, recovered. For API testing only.', eventKey: `demo-matching:${config.id}:injury:${injury.id}`,
    } });
    await writeAudit(tx, context, 'Notification', notification.id, 'CREATE', undefined, notification);
    const manifest = {
      demoVersion: 1, ownerId: owner.id, playerId: player.id, requirementId: requirement.id, configId: config.id,
      formerClubId: formerClub.id, currentClubId: currentClub.id, buyerClubId: buyerClub.id,
      contractIds: [oldContract.id, contract.id], transferId: transfer.id, statsId: stats.id, injuryId: injury.id,
      matchingInputId: estimate.id, shortlistId: shortlist.id, shortlistItemId: item.id, notificationId: notification.id,
    };
    await writeAudit(tx, context, 'MatchingDemo', config.id, 'CREATE', undefined, manifest);
    return manifest;
  }, { isolationLevel: 'Serializable', timeout: 15000 });

  // Refresh only this demo's dated evidence so it can be tested again on a later day.
  await prisma.$transaction(async tx => {
    const original = await tx.playerDataVerification.findUnique({ where: { playerId: ids.playerId } });
    const verification = {
      injuryCoveredFrom: shiftCalendarMonths(asOf, -24), injuryCoveredThrough: asOf, injuryVerifiedAt: new Date(),
      injuryVerifiedById: owner.id, injurySource: SOURCE, registrationStatus: 'CONTRACTED', registrationAsOf: asOf,
      registrationVerifiedAt: new Date(), registrationVerifiedById: owner.id, registrationSource: SOURCE,
    };
    const verified = await tx.playerDataVerification.upsert({ where: { playerId: ids.playerId }, create: { playerId: ids.playerId, ...verification }, update: verification });
    await writeAudit(tx, context, 'PlayerDataVerification', ids.playerId, 'VERIFY', original ?? undefined, verified);
    for (const [valuedAt, marketValue] of [[shiftCalendarMonths(asOf, -12), '40000000'], [asOf, '50000000']]) {
      const key = { playerId: ids.playerId, valuedAt, source: SOURCE };
      const previous = await tx.playerMarketValueHistory.findUnique({ where: { playerId_valuedAt_source: key } });
      if (!previous) {
        const value = await tx.playerMarketValueHistory.create({ data: { ...key, marketValue, reliability: 'UNKNOWN' } });
        await writeAudit(tx, context, 'PlayerMarketValueHistory', value.id, 'CREATE', undefined, value);
      }
    }
  });

  const request = { playerId: ids.playerId, requirementId: ids.requirementId, configId: ids.configId, season: SEASON, formRole: 'PRIMARY', valuationSource: SOURCE, save: false };
  const preview = await evaluateMatching(request, undefined, context);
  assert.equal(preview.complete, true, `Demo phải đủ mọi tiêu chí: ${JSON.stringify(preview.missing)}`);
  // Reuse an identical daily snapshot instead of making duplicate history on every seed run.
  const previous = await prisma.matchResult.findFirst({ where: { playerId: ids.playerId, requirementId: ids.requirementId, configId: ids.configId }, orderBy: { id: 'desc' } });
  const same = previous?.inputSnapshot?.evaluatedOn === asOf.toISOString().slice(0, 10)
    && isDeepStrictEqual(previous.criteriaScores, preview.criteria);
  const result = same ? { ...preview, saved: true, resultId: previous.id } : await evaluateMatching({ ...request, save: true }, undefined, context);
  assert(result.saved && result.resultId);
  const report = {
    synthetic: true, source: SOURCE, evaluatedOn: asOf.toISOString().slice(0, 10), owner, ids,
    provisionalWeights: { squad: { position: 0.2, age: 0.2, form: 0.6 }, risk: { injury: 0.6, resale: 0.4 } },
    configActivated: false, request,
    scores: { F: result.financialScore, S: result.squadScore, R: result.riskScore, total: result.totalScore },
    resultId: result.resultId, complete: result.complete, missing: result.missing,
    evidence: {
      verification: await prisma.playerDataVerification.findUnique({ where: { playerId: ids.playerId } }),
      valuations: await prisma.playerMarketValueHistory.findMany({ where: { playerId: ids.playerId }, orderBy: { valuedAt: 'asc' } }),
    },
    session: 'Use the existing admin login; no credentials or auth sessions were generated.',
  };
  await fs.writeFile(path.join(__dirname, '../docs/testing/matching-demo-data.json'), JSON.stringify(json(report), null, 2) + '\n');
  console.log(JSON.stringify({ reusedDataset: !!existing, ...report, evidence: undefined }, null, 2));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
