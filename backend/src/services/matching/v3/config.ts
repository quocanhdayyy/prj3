import { v3Matrix } from "../../../config/matching-v3-matrix";
import { metricInputHash } from "../../player-metrics-input";
import { ApiError } from "../../../utils/api-handler";
import { InputError } from "../../../utils/api-validation";
import type { ScoringConfig } from "../../../generated/prisma/client";

export const ENGINE_VERSION = "matching-v3.0.0";
export const IMPLEMENTATION_STAGE = 1;
export const SCORING_AVAILABLE = false;
export const BUILTIN_NAME = "Matching V3";
export const groups = ["CB", "FULLBACK", "MIDFIELD", "CAM", "WING", "ST", "GK"] as const;
export type Group = typeof groups[number];
export type DataMode = "OBSERVED_ONLY" | "PROTOTYPE";
export type Role = { id: string; name: string; description: string; group: Group; weights: Record<string, number> };
export const roles: Role[] = v3Matrix.roles.map(r => ({ ...r, group: r.group as Group, weights: r.weights as Record<string, number> }));
export const matrixVersion = v3Matrix.version;
export const ratioMetrics = new Set(["aerialWinPercentage", "pressureSuccessPercentage"]);
export const percentageMetrics = new Set([...ratioMetrics, "savePercentage", "crossStopPercentage"]);
export const knownMetrics = [...new Set(roles.flatMap(r => Object.keys(r.weights)))];
export const inputMetrics = {
  outfield: [...new Set(roles.filter(r => r.group !== "GK").flatMap(r => Object.keys(r.weights)))],
  goalkeeper: [...new Set(roles.filter(r => r.group === "GK").flatMap(r => Object.keys(r.weights)))],
  percentage: [...percentageMetrics], smoothingRequiresCounts: [...ratioMetrics],
  statuses: ["OBSERVED", "DERIVED", "ESTIMATED", "MISSING"], signed: ["goalsPreventedPer90"],
};
export const leagueNames = ["Premier League", "La Liga", "Bundesliga", "Serie A", "Ligue 1"];
export const positionGroup: Record<string, Group> = {
  CB: "CB", RB: "FULLBACK", LB: "FULLBACK", CM: "MIDFIELD", CDM: "MIDFIELD",
  CAM: "CAM", LW: "WING", RW: "WING", ST: "ST", GK: "GK",
};
export const adjacent: Record<Group, Group[]> = {
  CB: [], FULLBACK: ["WING"], MIDFIELD: ["CAM"], CAM: ["MIDFIELD", "WING", "ST"],
  WING: ["FULLBACK", "CAM", "ST"], ST: ["CAM", "WING"], GK: [],
};
export const strategies = {
  MONEYBALL: { financial: .5, squad: .3, risk: .2 },
  BALANCED: { financial: .3, squad: .5, risk: .2 },
  LONG_TERM: { financial: .2, squad: .3, risk: .5 },
  IMMEDIATE_ROLE: { financial: .2, squad: .7, risk: .1 },
};
export const defaultSettings = {
  referenceMinMinutes: 450, minimumReferencePlayers: 10, smoothingPrior: 30,
  ratioMean: "ATTEMPT_WEIGHTED" as "ATTEMPT_WEIGHTED" | "PLAYER_MEAN",
  fullMinutes: 2000, minutesWeight: .2, capBonus: 20,
  // Provisional implementation policies; explicit in template/results and versioned.
  trackingTransfers: { sprintsPer90: { pressuresPer90: 1 }, distanceKmPer90: { progressiveCarriesPer90: 1 } } as Record<string, Record<string, number>>,
  marketValueFeeMultiplier: 1.15, allowMarketValueFeeEstimate: true,
  missingInjuryScore: null as number | null,
  valuationMaxAgeDays: 180, valuationMinimumPoints: 4, volatilitySample: true,
};
export type Settings = typeof defaultSettings;
export type Weights = Record<"financial" | "squad" | "risk", number>;
export type V3Config = {
  id: number | null; name: string; version: number; matrixVersion: string; settings: Settings;
  financialWeights: Record<"fee" | "salary" | "contract", number>;
  riskWeights: Record<"injury" | "resale", number>; pillarWeights: Weights; hash: string;
};
export type RunOptions = {
  dataMode: DataMode; minMinutes: number; minimumRoleScore: number; allowPositionShift: boolean;
  feeTolerance: number; wageTolerance: number; contractMinYears: number; contractMaxYears: number;
  holdingYears: number; minimumAge: number | null; maximumAge: number | null;
  preferredFoot: string | null; leagues: string[]; topN: number;
};
export const defaultOptions: RunOptions = {
  dataMode: "PROTOTYPE", minMinutes: 900, minimumRoleScore: 70, allowPositionShift: false,
  feeTolerance: 0, wageTolerance: 0, contractMinYears: 2, contractMaxYears: 4,
  holdingYears: 3, minimumAge: null, maximumAge: null, preferredFoot: null, leagues: [], topN: 10,
};
export function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InputError(`${field} phải là object.`);
  return value as Record<string, unknown>;
}
export function exactKeys(value: Record<string, unknown>, allowed: string[], field: string, required = false) {
  if (Object.keys(value).some(k => !allowed.includes(k)) || (required && allowed.some(k => !Object.hasOwn(value, k)))) throw new InputError(`${field} chứa trường không hợp lệ hoặc thiếu trường.`);
}
export function numeric(value: unknown, field: string, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new InputError(`${field} phải là số trong khoảng ${min}–${max}.`);
  return value;
}
export function unitWeights<K extends string>(value: unknown, keys: K[], field: string): Record<K, number> {
  const obj = object(value, field); exactKeys(obj, keys, field, true);
  const values = keys.map(k => numeric(obj[k], `${field}.${k}`));
  const total = values.reduce((a, b) => a + b, 0);
  if (!Number.isFinite(total) || total <= 0) throw new InputError(`${field} phải có tổng dương.`);
  return Object.fromEntries(keys.map((key, index) => [key, values[index]! / total])) as Record<K, number>;
}
export function parseOptions(value: unknown = {}): RunOptions {
  const obj = object(value, "options"); exactKeys(obj, Object.keys(defaultOptions), "options");
  const result = { ...structuredClone(defaultOptions), ...obj } as RunOptions;
  if (!["PROTOTYPE", "OBSERVED_ONLY"].includes(result.dataMode)) throw new InputError("dataMode phải là PROTOTYPE hoặc OBSERVED_ONLY.");
  for (const k of ["minMinutes", "minimumRoleScore", "feeTolerance", "wageTolerance", "contractMinYears", "contractMaxYears", "holdingYears", "topN"] as const) numeric(result[k], k);
  if (!Number.isInteger(result.minMinutes) || !Number.isInteger(result.topN) || result.topN < 1 || result.topN > 100 || result.minimumRoleScore > 100
    || result.feeTolerance > 10 || result.wageTolerance > 10 || result.holdingYears > 30 || result.contractMaxYears > 30 || result.contractMinYears > result.contractMaxYears) throw new InputError("options ngoài phạm vi cho phép.");
  if (typeof result.allowPositionShift !== "boolean") throw new InputError("allowPositionShift phải là boolean.");
  for (const key of ["minimumAge", "maximumAge"] as const) if (result[key] !== null) numeric(result[key], key, 0, 100);
  if (result.minimumAge !== null && result.maximumAge !== null && result.minimumAge > result.maximumAge) throw new InputError("minimumAge không được lớn hơn maximumAge.");
  if (result.preferredFoot !== null && !["LEFT", "RIGHT", "BOTH"].includes(result.preferredFoot)) throw new InputError("preferredFoot phải là LEFT, RIGHT, BOTH hoặc null.");
  if (!Array.isArray(result.leagues) || result.leagues.some(v => !leagueNames.includes(v)) || new Set(result.leagues).size !== result.leagues.length) throw new InputError("leagues chỉ nhận các giải trong phạm vi top 5, không trùng.");
  return result;
}
export function validateSettings(value: unknown): Settings {
  const obj = object(value, "settings"); exactKeys(obj, Object.keys(defaultSettings), "settings", true);
  const s = obj as unknown as Settings;
  for (const k of ["referenceMinMinutes", "minimumReferencePlayers", "smoothingPrior", "fullMinutes", "minutesWeight", "capBonus", "marketValueFeeMultiplier", "valuationMaxAgeDays", "valuationMinimumPoints"] as const) numeric(s[k], k);
  if (!Number.isInteger(s.referenceMinMinutes) || s.referenceMinMinutes < 1 || s.referenceMinMinutes > 100000
    || !Number.isInteger(s.fullMinutes) || s.fullMinutes <= 0 || s.fullMinutes > 100000 || s.minutesWeight > 1 || s.capBonus > 100 || s.minimumReferencePlayers < 1 || s.minimumReferencePlayers > 100000 || !Number.isInteger(s.minimumReferencePlayers)
    || s.valuationMinimumPoints < 4 || s.valuationMinimumPoints > 1000 || !Number.isInteger(s.valuationMinimumPoints) || s.smoothingPrior <= 0
    || !Number.isInteger(s.valuationMaxAgeDays) || s.valuationMaxAgeDays > 730 || s.marketValueFeeMultiplier <= 0) throw new InputError("settings ngoài phạm vi cho phép.");
  if (!["ATTEMPT_WEIGHTED", "PLAYER_MEAN"].includes(s.ratioMean) || typeof s.volatilitySample !== "boolean" || typeof s.allowMarketValueFeeEstimate !== "boolean") throw new InputError("Chính sách settings không hợp lệ.");
  if (s.missingInjuryScore !== null && s.missingInjuryScore !== 70) throw new InputError("missingInjuryScore chỉ nhận null hoặc 70 theo đặc tả.");
  const transfers = object(s.trackingTransfers, "trackingTransfers");
  exactKeys(transfers, ["sprintsPer90", "distanceKmPer90"], "trackingTransfers");
  for (const [from, to] of Object.entries(transfers)) {
    const targets = object(to, `trackingTransfers.${from}`);
    if (!Object.keys(targets).length || Object.keys(targets).some(k => !["pressuresPer90", "progressiveCarriesPer90"].includes(k))) throw new InputError("Chỉ chuyển trọng số tracking sang Press/90 hoặc PrgC.");
    const total = Object.entries(targets).reduce((sum, [key, w]) => sum + numeric(w, key, 0, 1), 0);
    if (Math.abs(total - 1) > 1e-10) throw new InputError("Mỗi phép chuyển trọng số phải có tổng 1.");
  }
  return structuredClone(s);
}
const make = (data: Omit<V3Config, "hash">): V3Config => ({ ...data, hash: metricInputHash({ ...data, id: undefined }) });
export function builtinConfig(): V3Config {
  return make({ id: null, name: BUILTIN_NAME, version: 1, matrixVersion, settings: structuredClone(defaultSettings),
    financialWeights: { fee: .45, salary: .35, contract: .2 }, riskWeights: { injury: .5, resale: .5 }, pillarWeights: { ...strategies.BALANCED } });
}
export function validateV3Config(record: ScoringConfig): V3Config {
  try {
    const params = object(record.parameters, "parameters"); exactKeys(params, ["engineVersion", "matrixVersion", "settings"], "parameters", true);
    if (params.engineVersion !== ENGINE_VERSION || params.matrixVersion !== matrixVersion) throw new InputError("Phiên bản engine hoặc ma trận không khớp mã nguồn hiện tại.");
    const weights = object(record.criteriaWeights, "criteriaWeights"); exactKeys(weights, ["financial", "squad", "risk"], "criteriaWeights", true);
    const squad = object(weights.squad, "squad"); exactKeys(squad, ["role"], "squad", true);
    if (squad.role !== 1) throw new InputError("V3 lấy S từ vai trò; squad.role phải bằng 1.");
    return make({ id: record.id, name: record.name, version: record.version, matrixVersion,
      settings: validateSettings(params.settings),
      financialWeights: unitWeights(weights.financial, ["fee", "salary", "contract"], "financial"),
      riskWeights: unitWeights(weights.risk, ["injury", "resale"], "risk"),
      pillarWeights: unitWeights({ financial: record.financialWeight.toNumber(), squad: record.squadWeight.toNumber(), risk: record.riskWeight.toNumber() }, ["financial", "squad", "risk"], "pillarWeights") });
  } catch (e) { if (e instanceof InputError) throw new ApiError(409, `Cấu hình V3 chưa hợp lệ: ${e.message}`); throw e; }
}
export const v3Template = () => ({
  name: BUILTIN_NAME, version: 1, financialWeight: .3, squadWeight: .5, riskWeight: .2,
  criteriaWeights: { financial: { fee: .45, salary: .35, contract: .2 }, squad: { role: 1 }, risk: { injury: .5, resale: .5 } },
  parameters: { engineVersion: ENGINE_VERSION, matrixVersion, settings: structuredClone(defaultSettings) },
});
export const policies = [
  "PROTOTYPE cho phép dữ liệu ước tính và tập tham chiếu có ước tính, ghi rõ tỷ trọng; OBSERVED_ONLY loại chúng.",
  "Chính sách khởi đầu: ít nhất 10 người tham chiếu; trung bình tỷ lệ theo tổng thành công/tổng lần thử.",
  "Thiếu Sprints chuyển toàn bộ trọng số sang Press; thiếu Dist chuyển sang PrgC. Chỉ thực hiện nếu bên nhận đủ dữ liệu.",
  "Giá: hồi quy log theo ngày thật, mốc 6 tháng lấy giá gần nhất trước mốc không quá 180 ngày; độ lệch chuẩn mẫu.",
  "Giữ công thức hợp đồng 2–4 năm của V2 và trần phút; 900 phút chỉ đạt tối đa 65 khi s_min mặc định 70.",
];
