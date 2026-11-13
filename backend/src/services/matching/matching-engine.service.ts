import { prisma } from "../../config/prisma";
import { Prisma } from "../../generated/prisma/client";
import type { ClubRequirement, Player, MatchingInput, Contract, PlayerDataVerification, PlayerStats, InjuryHistory, PlayerMarketValueHistory } from "../../generated/prisma/client";
import { ApiError, ownerWhere, requireFound } from "../../utils/api-handler";
import { validateMatchingConfig } from "./matching-config";
import type { EngineConfig } from "./matching-config";
import { financialRawScores, remainingContractMonths } from "./financial-scoring.service";
import { combine, decimal, display, normalizePosition, playerAge, scoreBand, scoreForm, scoreInjury, scorePosition, scoreResale } from "./matching-scoring.service";
import { writeAudit } from "../audit-log.service";
import type { AuditContext } from "../audit-log.service";

export type EvaluationInput = { playerId: number; requirementId: number; season: string; formRole: "PRIMARY" | "REQUIRED"; save: boolean; configId?: number; valuationSource?: string };
const json = (value: unknown): Prisma.InputJsonObject => JSON.parse(JSON.stringify(value));
const today = (now: Date) => new Date(`${now.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" })}T00:00:00.000Z`);
const configured = async (tx: Prisma.TransactionClient, configId: number | undefined, isAdmin: boolean) => {
  const record = configId === undefined ? await tx.scoringConfig.findFirst({ where: { isActive: true } })
    : await tx.scoringConfig.findFirst({ where: { id: configId, ...(isAdmin ? {} : { isActive: true }) } });
  if (!record) throw new ApiError(409, "Chưa có cấu hình Matching được chọn. Hãy tạo và kích hoạt cấu hình hoặc gửi configId.");
  return validateMatchingConfig(record);
};

type EvaluationData = {
  requirement: ClubRequirement; player: Player; estimate: MatchingInput | null; contract: Contract | null;
  verification: PlayerDataVerification | null; stats: PlayerStats | null;
  injuries: InjuryHistory[]; valuations: PlayerMarketValueHistory[];
};

const evaluateInside = async (tx: Prisma.TransactionClient, input: EvaluationInput, ownerId: number | undefined, context: AuditContext, config: EngineConfig, now: Date, loaded?: EvaluationData) => {
  const requirement = loaded ? loaded.requirement : requireFound(await tx.clubRequirement.findFirst({ where: { id: input.requirementId, ...ownerWhere(ownerId) } }));
  const player = loaded ? loaded.player : requireFound(await tx.player.findUnique({ where: { id: input.playerId } }));
  if (!config.rules.completedSeasons.includes(input.season)) throw new ApiError(409, "Mùa chưa được xác nhận đã kết thúc trong parameters.completedSeasons; chưa áp dụng bảng phút tuyệt đối.");
  const asOf = today(now);
  const estimate = loaded ? loaded.estimate : await tx.matchingInput.findUnique({ where: { requirementId_playerId: { requirementId: requirement.id, playerId: player.id } } });
  const contract = loaded ? loaded.contract : await tx.contract.findFirst({ where: { playerId: player.id, status: "ACTIVE", startDate: { lte: asOf }, endDate: { gte: asOf } }, orderBy: { id: "asc" } });
  const verification = loaded ? loaded.verification : await tx.playerDataVerification.findUnique({ where: { playerId: player.id } });
  const free = !contract && verification?.registrationStatus === "FREE_AGENT" && verification.registrationAsOf?.getTime() === asOf.getTime()
    && !!verification.registrationVerifiedAt && verification.registrationVerifiedAt <= now;
  const months = contract ? remainingContractMonths(asOf, contract.endDate) : free ? decimal(0) : null;
  const financialInputs = { budget: requirement.budget, salaryLimit: requirement.salaryLimit, estimatedFee: estimate?.estimatedFee ?? null, expectedSalaryPerYear: estimate?.expectedSalaryPerYear ?? null, remainingMonths: months };
  const finance = financialRawScores(financialInputs, config.rules.financial);
  const financialScore = combine(finance, config.weights.financial);
  const age = playerAge(player.dateOfBirth, asOf);
  const position = scorePosition(player.position, player.secondaryPositions, requirement.position, config.rules);
  const ageScore = age === null ? null : scoreBand(age, config.rules.squadAge);
  const stats = loaded ? loaded.stats : await tx.playerStats.findUnique({ where: { playerId_season: { playerId: player.id, season: input.season } } });
  const formPosition = input.formRole === "PRIMARY" ? player.position : requirement.position;
  const form = scoreForm(stats, formPosition, config.rules);
  const squad = { position: position.score, age: ageScore, form: form.score };
  const squadScore = combine(squad, config.weights.squad);
  const injuries = loaded ? loaded.injuries : await tx.injuryHistory.findMany({ where: { playerId: player.id, startDate: { lte: asOf } }, orderBy: { startDate: "asc" } });
  const injury = scoreInjury(injuries, verification, asOf, now, config.rules);
  const valuations = loaded ? loaded.valuations : await tx.playerMarketValueHistory.findMany({ where: {
    playerId: player.id, valuedAt: { lte: asOf }, recordedAt: { lte: now },
    ...(input.valuationSource === undefined ? {} : { source: input.valuationSource }),
  }, orderBy: { id: "asc" } });
  const resale = scoreResale(valuations, age, asOf, now, config.rules, input.valuationSource);
  const risk = { injury: injury.score, resale: resale.score };
  const riskScore = combine(risk, config.weights.risk);
  const total = combine({ financial: financialScore, squad: squadScore, risk: riskScore }, config.pillarWeights);
  // MatchResult columns require all pillar scores; never manufacture missing pillars just to save.
  const complete = total !== null && financialScore !== null && squadScore !== null && riskScore !== null;
  const missing: string[] = [];
  for (const [pillar, values] of Object.entries({ financial: finance, squad, risk })) {
    const weights = config.weights[pillar as keyof typeof config.weights];
    for (const [field, value] of Object.entries(values)) if (value === null && (weights[field] ?? 0) > 0) missing.push(`${pillar}.${field}`);
  }
  const pros: string[] = []; const cons: string[] = []; const warnings: string[] = [];
  if (estimate?.estimatedFee != null) (estimate.estimatedFee.lte(requirement.budget) ? pros : cons).push(estimate.estimatedFee.lte(requirement.budget) ? "Phí mua dự kiến trong ngân sách." : "Phí mua dự kiến vượt ngân sách.");
  if (estimate?.expectedSalaryPerYear != null) (estimate.expectedSalaryPerYear.lte(requirement.salaryLimit) ? pros : cons).push(estimate.expectedSalaryPerYear.lte(requirement.salaryLimit) ? "Lương dự kiến trong trần." : "Lương dự kiến vượt trần.");
  if (position.basis === "PRIMARY") pros.push("Khớp vị trí chính.");
  if (position.basis === "SECONDARY") pros.push("Có vị trí phụ khớp yêu cầu.");
  if (position.basis === "OTHER") cons.push("Khác nhóm vị trí yêu cầu.");
  if (injury.details.ongoing) cons.push("Đang có chấn thương chưa hồi phục tại ngày đánh giá.");
  if (resale.details.changePercent !== null) (resale.details.changePercent >= 0 ? pros : cons).push(`Giá trị thị trường biến động ${resale.details.changePercent}% trong kỳ đối chiếu.`);
  if (resale.details.quoteAgeDays !== null && resale.details.quoteAgeDays > 0) warnings.push(`Định giá gần nhất có ngày ${resale.details.currentDate}, cũ ${resale.details.quoteAgeDays} ngày. Kỳ so sánh thực tế ${resale.details.comparisonDays} ngày; xem hai mốc nguồn, không coi là giá hôm nay hay đúng 12 tháng.`);
  if (form.details.capApplied) warnings.push("Điểm phong độ bị giới hạn theo số phút thi đấu.");
  if (stats && stats.minutesPlayed > 0 && stats.minutesPlayed < 450) warnings.push("Mẫu thi đấu dưới 450 phút; theo bảng đã chốt, trần phong độ vẫn là 80, không bảo đảm độ tin cậy thống kê.");
  if (position.basis === "POSITION_GROUP_NOT_CONFIGURED") warnings.push("Chưa khai báo đủ nhóm vị trí; không tự gán 0 hoặc 50.");
  if (age !== null && (age < requirement.minAge || age > requirement.maxAge)) warnings.push("Tuổi ngoài minAge/maxAge của yêu cầu; bản đã chốt dùng bảng tuổi cố định và chưa áp dụng loại tự động.");
  if (missing.length) warnings.push("Thiếu dữ liệu/cấu hình ở một số tiêu chí; không gán điểm trung tính hoặc chia lại trọng số.");
  if (valuations.some(value => value.reliability === "UNKNOWN" || value.reliability === "RUMOR")) warnings.push("Lịch sử định giá có nguồn UNKNOWN/RUMOR; chưa áp dụng hệ số giảm độ tin cậy chưa được chốt.");
  const criteria = {
    financial: { weights: config.weights.financial, scores: Object.fromEntries(Object.entries(finance).map(([key, value]) => [key, display(value)])),
      inputs: financialInputs, contractBasis: contract ? "ACTIVE_CONTRACT" : free ? "VERIFIED_FREE_AGENT_TODAY" : "UNKNOWN" },
    squad: { weights: config.weights.squad, scores: Object.fromEntries(Object.entries(squad).map(([key, value]) => [key, display(value)])),
      age, positionBasis: position.basis, primaryPosition: normalizePosition(player.position), requiredPosition: normalizePosition(requirement.position),
      formRoleBasis: input.formRole, formRole: form.role, form: form.details },
    risk: { weights: config.weights.risk, scores: Object.fromEntries(Object.entries(risk).map(([key, value]) => [key, display(value)])), injury: injury.details, resale: resale.details },
  };
  const result = input.save && complete ? await tx.matchResult.create({ data: {
    userId: requirement.userId, playerId: player.id, requirementId: requirement.id, configId: config.id,
    totalScore: total!, financialScore: financialScore!, squadScore: squadScore!, riskScore: riskScore!,
    criteriaScores: json(criteria), prosCons: { pros, cons, warnings }, inputSnapshot: json({ engineVersion: config.rules.engineVersion, evaluatedOn: asOf.toISOString().slice(0, 10), evaluatedAt: now,
    season: input.season, formRole: input.formRole, valuationSource: input.valuationSource ?? null,
    player, requirement, matchingInput: estimate, contract, verification, stats, injuries, valuations, config }), evaluatedAt: now,
  } }) : null;
  if (result) await writeAudit(tx, context, "MatchResult", result.id, "CREATE", undefined, {
    id: result.id, userId: result.userId, playerId: result.playerId, requirementId: result.requirementId, configId: result.configId, totalScore: result.totalScore,
  });
  return { complete, saved: result !== null, resultId: result?.id ?? null,
    player: { id: player.id, name: player.name }, requirementId: requirement.id, season: input.season, evaluatedAt: now.toISOString(),
    config: { id: config.id, name: config.name, version: config.version, engineVersion: config.rules.engineVersion, pillarWeights: config.pillarWeights },
    totalScore: complete ? display(total) : null, financialScore: display(financialScore), squadScore: display(squadScore), riskScore: display(riskScore),
    criteria: json(criteria), missing, prosCons: { pros, cons, warnings },
  };
};

export const evaluateMatching = (input: EvaluationInput, ownerId: number | undefined, context: AuditContext) => prisma.$transaction(async tx => {
  // Ownership is checked even when the active configuration is missing/invalid.
  requireFound(await tx.clubRequirement.findFirst({ where: { id: input.requirementId, ...ownerWhere(ownerId) } }));
  const config = await configured(tx, input.configId, ownerId === undefined);
  if (input.save) await tx.$queryRaw`SELECT id FROM scoring_configs WHERE id = ${config.id} FOR SHARE`;
  return evaluateInside(tx, input, ownerId, context, config, new Date());
}, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });

export type RankInput = Omit<EvaluationInput, "playerId" | "save"> & { playerIds: number[] };
export const rankMatching = (input: RankInput, ownerId: number | undefined, context: AuditContext) => prisma.$transaction(async tx => {
  requireFound(await tx.clubRequirement.findFirst({ where: { id: input.requirementId, ...ownerWhere(ownerId) } }));
  const config = await configured(tx, input.configId, ownerId === undefined); const now = new Date();
  const results = [];
  for (const playerId of input.playerIds) results.push(await evaluateInside(tx, { ...input, playerId, save: false }, ownerId, context, config, now));
  const ranked = results.filter(value => value.complete).sort((a, b) => (b.totalScore! - a.totalScore!) || a.player.id - b.player.id);
  return { config: { id: config.id, version: config.version }, ranked, incomplete: results.filter(value => !value.complete), saved: false };
}, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30000 });


export type SearchInput = Omit<EvaluationInput, "playerId" | "save"> & { page: number; pageSize: number };

// Discovery uses the imported top-five-league cohort for this season, not nationality
// or contract club. The importer enforces that cohort; manual/demo players are excluded.
export const searchMatching = (input: SearchInput, ownerId: number | undefined, context: AuditContext) => prisma.$transaction(async tx => {
  const requirement = requireFound(await tx.clubRequirement.findFirst({ where: { id: input.requirementId, ...ownerWhere(ownerId) } }));
  const config = await configured(tx, input.configId, ownerId === undefined);
  if (input.season !== "2025/2026") throw new ApiError(409, "Tự tìm ứng viên hiện hỗ trợ bộ dữ liệu 5 giải mùa 2025/2026.");
  if (!config.rules.completedSeasons.includes(input.season)) throw new ApiError(409, "Mùa chưa được xác nhận đã kết thúc trong parameters.completedSeasons.");
  const now = new Date(); const asOf = today(now);
  const players = await tx.player.findMany({ where: {
    transfermarktId: { not: null }, stats: { some: { season: input.season } },
  }, orderBy: { id: "asc" } });
  const playerIds = players.map(player => player.id);
  // Load each relation once for the whole cohort, avoiding queries per candidate.
  const [estimates, contracts, verifications, stats, injuries, valuations] = playerIds.length ? await Promise.all([
    tx.matchingInput.findMany({ where: { requirementId: requirement.id, playerId: { in: playerIds } } }),
    tx.contract.findMany({ where: { playerId: { in: playerIds }, status: "ACTIVE", startDate: { lte: asOf }, endDate: { gte: asOf } }, orderBy: { id: "asc" } }),
    tx.playerDataVerification.findMany({ where: { playerId: { in: playerIds } } }),
    tx.playerStats.findMany({ where: { playerId: { in: playerIds }, season: input.season } }),
    tx.injuryHistory.findMany({ where: { playerId: { in: playerIds }, startDate: { lte: asOf } }, orderBy: { startDate: "asc" } }),
    tx.playerMarketValueHistory.findMany({ where: { playerId: { in: playerIds }, valuedAt: { lte: asOf }, recordedAt: { lte: now },
      ...(input.valuationSource === undefined ? {} : { source: input.valuationSource }) }, orderBy: { id: "asc" } }),
  ]) : [[], [], [], [], [], []];
  const byPlayer = <T extends { playerId: number }>(rows: T[]) => new Map(rows.map(row => [row.playerId, row]));
  const grouped = <T extends { playerId: number }>(rows: T[]) => {
    const map = new Map<number, T[]>();
    for (const row of rows) { const group = map.get(row.playerId) ?? []; group.push(row); map.set(row.playerId, group); }
    return map;
  };
  const estimateMap = byPlayer(estimates), contractMap = byPlayer([...contracts].reverse()), verificationMap = byPlayer(verifications), statsMap = byPlayer(stats);
  const injuryMap = grouped(injuries), valuationMap = grouped(valuations);
  const results = [];
  for (const player of players) results.push(await evaluateInside(tx, { ...input, playerId: player.id, save: false }, ownerId, context, config, now, {
    requirement, player, estimate: estimateMap.get(player.id) ?? null, contract: contractMap.get(player.id) ?? null,
    verification: verificationMap.get(player.id) ?? null, stats: statsMap.get(player.id) ?? null,
    injuries: injuryMap.get(player.id) ?? [], valuations: valuationMap.get(player.id) ?? [],
  }));
  const ranked = results.filter(row => row.complete).sort((a, b) => (b.totalScore! - a.totalScore!) || a.player.id - b.player.id);
  const incomplete = results.filter(row => !row.complete);
  // Score the entire cohort before paginating; incomplete candidates follow ranked ones.
  const offset = (input.page - 1) * input.pageSize;
  const page = [...ranked, ...incomplete].slice(offset, offset + input.pageSize);
  return {
    requirementId: requirement.id, season: input.season, config: { id: config.id, version: config.version }, saved: false,
    scope: { source: "TRANSFERMARKT_IMPORTED_TOP5", positionFilter: false, ageFilter: false, feeFilter: false, salaryFilter: false },
    status: !results.length ? "NO_CANDIDATES" : !ranked.length ? "INCOMPLETE_DATA" : "RANKED",
    ranked: page.filter(row => row.complete).map((row, index) => ({ ...row, rank: offset + index + 1 })),
    incomplete: page.filter(row => !row.complete),
    meta: { page: input.page, pageSize: input.pageSize, totalCandidates: results.length, rankedCount: ranked.length,
      incompleteCount: incomplete.length, totalPages: Math.ceil(results.length / input.pageSize) },
  };
}, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 60000 });
