import { prisma } from "../../config/prisma";
import { matchingRules } from "../../config/matching-rules";
import { riskInjuryDemos } from "../../config/risk-injury-demo";
import type { RiskInjuryDemo } from "../../config/risk-injury-demo";
import type { EngineRules } from "./matching-config";
import { combine, decimal, display, playerAge, scoreInjury, scoreInjuryDays, scoreResale, scoreResaleValues, shiftCalendarMonths } from "./matching-scoring.service";
import { requireFound } from "../../utils/api-handler";

export type RiskWeights = { injury: number; resale: number };
const rules: EngineRules = { ...structuredClone(matchingRules), positionGroups: [], completedSeasons: [] };
const summarize = (injury: ReturnType<typeof decimal> | null, resale: ReturnType<typeof decimal> | null, weights?: RiskWeights) => {
  const score = weights ? combine({ injury, resale }, { injury: decimal(weights.injury).div(100).toNumber(), resale: decimal(weights.resale).div(100).toNumber() }) : null;
  const missing = weights ? Object.entries({ injury, resale }).filter(([k, v]) => v === null && weights[k as keyof RiskWeights] > 0).map(([k]) => `risk.${k}`) : ["risk.weights"];
  return { riskScore: display(score), scores: { injury: display(injury), resale: display(resale) }, weights: weights ?? null,
    weightUnit: "PERCENT", complete: score !== null, saved: false, missing,
    engineVersion: rules.engineVersion, rulesBasis: "AGREED_INITIAL_RULES_PREVIEW" };
};

type StoredRiskInput = { playerId: number; valuationSource?: string; weights?: RiskWeights };
const evaluateRisk = (input: StoredRiskInput, now: Date, demo?: RiskInjuryDemo) => prisma.$transaction(async tx => {
  const player = requireFound(await tx.player.findUnique({ where: { id: input.playerId }, select: { id: true, name: true, dateOfBirth: true, position: true } }));
  const asOf = new Date(`${now.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" })}T00:00:00Z`);
  const age = playerAge(player.dateOfBirth, asOf);
  const injuries = demo ? [] : await tx.injuryHistory.findMany({ where: { playerId: player.id, startDate: { lte: asOf } }, orderBy: { startDate: "asc" } });
  const verification = demo ? null : await tx.playerDataVerification.findUnique({ where: { playerId: player.id } });
  const valuations = await tx.playerMarketValueHistory.findMany({ where: { playerId: player.id, valuedAt: { lte: asOf }, recordedAt: { lte: now }, ...(input.valuationSource === undefined ? {} : { source: input.valuationSource }) }, orderBy: { id: "asc" } });
  const demoScore = demo ? scoreInjuryDays(demo.daysMissed, demo.ongoing, rules) : null;
  const injury = demo && demoScore ? { score: demoScore.score, details: {
    observedDays: demo.daysMissed, daysMissed: demo.daysMissed, coverageVerified: false, ongoing: demo.ongoing,
    windowStart: shiftCalendarMonths(asOf, -24).toISOString().slice(0, 10), windowEnd: asOf.toISOString().slice(0, 10),
    scoreBeforeCap: display(demoScore.base), cap: demo.ongoing ? rules.ongoingInjuryCap : null,
    reason: null, simulated: true,
  } } : scoreInjury(injuries, verification, asOf, now, rules);
  const resale = scoreResale(valuations, age, asOf, now, rules, input.valuationSource);
  const warnings = [];
  if (demo) warnings.push("DEMO: Số ngày nghỉ và tình trạng chấn thương hoàn toàn giả lập để thử công thức; không phải lịch sử thật của cầu thủ. Tuổi và lịch sử giá vẫn đọc từ database. Không lưu hoặc xác minh dữ liệu giả.");
  else if (!injury.details.coverageVerified) warnings.push("Chưa xác minh đầy đủ lịch sử chấn thương hai năm; không có bản ghi không đồng nghĩa khỏe mạnh. Điểm chấn thương giữ null.");
  if (resale.details.quoteAgeDays !== null && resale.details.quoteAgeDays > 0) warnings.push(`Định giá gần nhất ngày ${resale.details.currentDate}, cũ ${resale.details.quoteAgeDays} ngày; không phải giá hôm nay. Kỳ đối chiếu thực tế ${resale.details.comparisonDays} ngày.`);
  if (valuations.some(v => v.reliability === "UNKNOWN" || v.reliability === "RUMOR")) warnings.push("Lịch sử giá có nguồn UNKNOWN/RUMOR; giữ nguồn và ngày thực tế, không tự gắn OFFICIAL.");
  return { ...summarize(injury.score, resale.score, input.weights), mode: demo ? "DEMO" : "DATABASE", demo: demo ? { id: demo.id, injuryDataBasis: "FICTIONAL_TWO_YEAR_TOTAL", valuationDataBasis: "DATABASE" } : null,
    player: { id: player.id, name: player.name, age, position: player.position },
    evaluatedOn: asOf.toISOString().slice(0, 10), injury: injury.details, resale: resale.details,
    availableValuationSources: [...new Set(valuations.map(v => v.source))], warnings };
}, { isolationLevel: "RepeatableRead" });

export const evaluateRiskPreview = (input: StoredRiskInput, now = new Date()) => evaluateRisk(input, now);
export const listRiskDemos = async () => {
  const players = await prisma.player.findMany({ where: { transfermarktId: { in: riskInjuryDemos.map(d => d.transfermarktId) } }, select: { id: true, transfermarktId: true, name: true } });
  return riskInjuryDemos.map(d => { const p = players.find(p => p.transfermarktId === d.transfermarktId);
    return { ...d, name: p?.name ?? d.name, playerId: p?.id ?? null, available: !!p, simulated: true }; });
};
export const evaluateRiskDemo = async (input: { demoId: string; valuationSource?: string; weights?: RiskWeights }, now = new Date()) => {
  const demo = requireFound(riskInjuryDemos.find(d => d.id === input.demoId) ?? null);
  const player = requireFound(await prisma.player.findUnique({ where: { transfermarktId: demo.transfermarktId }, select: { id: true } }));
  return evaluateRisk({ playerId: player.id, ...(input.weights ? { weights: input.weights } : {}), ...(input.valuationSource ? { valuationSource: input.valuationSource } : {}) }, now, demo);
};

export type RiskSimulationInput = { age: number | null; daysMissed: number | null; ongoing: boolean; currentValue: string | null; priorValue: string | null; weights?: RiskWeights };
export const simulateRiskPreview = (input: RiskSimulationInput) => {
  const injury = scoreInjuryDays(input.daysMissed, input.ongoing, rules);
  const resale = scoreResaleValues(input.currentValue === null ? null : decimal(input.currentValue), input.priorValue === null ? null : decimal(input.priorValue), input.age, rules);
  return { ...summarize(injury.score, resale.score, input.weights), mode: "SIMULATION", player: null, inputs: input,
    injury: { daysMissed: input.daysMissed, ongoing: input.ongoing, scoreBeforeCap: display(injury.base), cap: input.ongoing ? rules.ongoingInjuryCap : null },
    resale: { currentValue: input.currentValue, priorValue: input.priorValue, changePercent: display(resale.change, 6), trendScore: display(resale.trendScore), ageScore: display(resale.ageScore), weights: { trend: rules.resale.trendWeight, age: rules.resale.ageWeight } },
    warnings: ["Dữ liệu giả lập do bạn nhập để thử công thức. Không phải dữ liệu đã xác minh của bất kỳ cầu thủ nào, không lưu vào database.", "Số ngày nghỉ giả định đã gộp trùng trong cửa sổ hai năm. Hai giá trị giả định cùng nguồn, đơn vị EUR và cách nhau 12 tháng."] };
};
