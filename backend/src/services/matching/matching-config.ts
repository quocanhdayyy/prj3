import { Prisma } from "../../generated/prisma/client";
import type { ScoringConfig } from "../../generated/prisma/client";
import { matchingRules } from "../../config/matching-rules";
import { ApiError } from "../../utils/api-handler";
import { playerPositions } from "../../config/player-positions";

export const positions = playerPositions;
export type Band = { min: number; score: number };
export type RoleRule = { minutesWeight: number; metrics: Record<string, { weight: number; a: number; b: number }> };
export type EngineRules = Omit<typeof matchingRules, "roles"> & { roles: Record<string, RoleRule>; positionGroups: string[][]; completedSeasons: string[] };
export type Weights = { financial: Record<string, number>; squad: Record<string, number>; risk: Record<string, number> };
export type EngineConfig = { id: number; name: string; version: number; pillarWeights: Record<"financial" | "squad" | "risk", number>; weights: Weights; rules: EngineRules };

function invalid(field: string): never { throw new ApiError(409, `Cấu hình Matching chưa hợp lệ tại ${field}. Hãy cấu hình theo GET /api/matching/template.`); }
const object = (value: unknown, field: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid(field);
  return value as Record<string, unknown>;
};
const number = (value: unknown, field: string, min = 0, max = Number.MAX_SAFE_INTEGER): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) return invalid(field);
  return value;
};
const keys = (value: Record<string, unknown>, expected: string[], field: string) => {
  if (Object.keys(value).length !== expected.length || expected.some(key => !Object.hasOwn(value, key))) invalid(field);
};
const unitSum = (values: number[], field: string) => {
  if (!values.reduce((sum, value) => sum.add(value), new Prisma.Decimal(0)).equals(1)) invalid(field);
};
const bands = (value: unknown, field: string) => {
  if (!Array.isArray(value) || !value.length) invalid(field);
  let previous = -1;
  for (const row of value as unknown[]) {
    const item = object(row, field); keys(item, ["min", "score"], field);
    const threshold = number(item.min, `${field}.min`);
    if (!Number.isInteger(threshold) || threshold <= previous) invalid(field);
    previous = threshold; number(item.score, `${field}.score`, 0, 100);
  }
};
export const validateMatchingConfig = (record: ScoringConfig): EngineConfig => {
  const raw = object(record.parameters, "parameters");
  const expectedKeys = [...Object.keys(matchingRules), "positionGroups", "completedSeasons"];
  keys(raw, expectedKeys, "parameters");
  if (raw.engineVersion !== "matching-v1") invalid("engineVersion");
  const weights = object(record.criteriaWeights, "criteriaWeights");
  keys(weights, ["financial", "squad", "risk"], "criteriaWeights");
  for (const [group, fields] of Object.entries({ financial: ["fee", "salary", "contract"], squad: ["position", "age", "form"], risk: ["injury", "resale"] })) {
    const values = object(weights[group], group); keys(values, fields, group);
    unitSum(fields.map(field => number(values[field], `${group}.${field}`, 0, 1)), group);
  }
  const pillarWeights = { financial: record.financialWeight.toNumber(), squad: record.squadWeight.toNumber(), risk: record.riskWeight.toNumber() };
  for (const [key, value] of Object.entries(pillarWeights)) number(value, key, 0, 1);
  unitSum(Object.values(pillarWeights), "pillarWeights");
  const financial = object(raw.financial, "financial"); keys(financial, Object.keys(matchingRules.financial), "financial");
  for (const key of Object.keys(matchingRules.financial)) number(financial[key], `financial.${key}`, key === "feeIntercept" ? 0 : Number.MIN_VALUE);
  const pos = object(raw.positionScores, "positionScores"); keys(pos, ["primary", "secondary", "group", "other"], "positionScores");
  for (const value of Object.values(pos)) number(value, "positionScores", 0, 100);
  if (!(Number(pos.primary) >= Number(pos.secondary) && Number(pos.secondary) >= Number(pos.group) && Number(pos.group) >= Number(pos.other))) invalid("positionScores order");
  for (const field of ["squadAge", "resaleAge", "minutes"]) bands(raw[field], field);
  if ((raw.minutes as Band[])[0]?.min !== 0) invalid("minutes[0].min");
  number(raw.formCapBonus, "formCapBonus", 0, 100); number(raw.benchmarkAnchorScore, "benchmarkAnchorScore", Number.MIN_VALUE, 100);
  const roles = object(raw.roles, "roles"); keys(roles, Object.keys(matchingRules.roles), "roles");
  for (const [role, defaultRule] of Object.entries(matchingRules.roles)) {
    const rule = object(roles[role], role); keys(rule, ["minutesWeight", "metrics"], role);
    const metricRules = object(rule.metrics, `${role}.metrics`); keys(metricRules, Object.keys(defaultRule.metrics), `${role}.metrics`);
    const metricWeights = [number(rule.minutesWeight, `${role}.minutesWeight`, 0, 1)];
    for (const [metric, value] of Object.entries(metricRules)) {
      const item = object(value, `${role}.${metric}`); keys(item, ["weight", "a", "b"], `${role}.${metric}`);
      metricWeights.push(number(item.weight, `${role}.${metric}.weight`, 0, 1));
      const a = number(item.a, `${role}.${metric}.a`, Number.MIN_VALUE);
      if (number(item.b, `${role}.${metric}.b`, Number.MIN_VALUE) <= a) invalid(`${role}.${metric}.b > a`);
    }
    unitSum(metricWeights, role);
  }
  if (!Array.isArray(raw.positionGroups)) invalid("positionGroups");
  const grouped = new Set<string>();
  for (const group of raw.positionGroups as unknown[]) {
    if (!Array.isArray(group) || group.length < 2) invalid("positionGroups");
    for (const position of group as unknown[]) {
      if (typeof position !== "string" || !positions.includes(position) || grouped.has(position)) invalid("positionGroups");
      grouped.add(position);
    }
  }
  if (!Array.isArray(raw.completedSeasons) || (raw.completedSeasons as unknown[]).some(value => typeof value !== "string" || !/^\d{4}\/\d{4}$/.test(value) || Number(value.slice(5)) !== Number(value.slice(0, 4)) + 1)) invalid("completedSeasons");
  if (!Array.isArray(raw.injury) || !raw.injury.length) invalid("injury");
  let last = -1;
  for (const [index, value] of (raw.injury as unknown[]).entries()) {
    const band = object(value, "injury"); keys(band, ["max", "score"], "injury"); number(band.score, "injury.score", 0, 100);
    if (index === (raw.injury as unknown[]).length - 1) { if (band.max !== null) invalid("injury last max"); }
    else { const max = number(band.max, "injury.max"); if (!Number.isInteger(max) || max <= last) invalid("injury.max"); last = max; }
  }
  number(raw.ongoingInjuryCap, "ongoingInjuryCap", 0, 100);
  if (!Number.isInteger(number(raw.injuryLookbackYears, "injuryLookbackYears", 1, 100))) invalid("injuryLookbackYears");
  const resale = object(raw.resale, "resale"); keys(resale, Object.keys(matchingRules.resale), "resale");
  number(resale.changeBase, "resale.changeBase", 0, 100); number(resale.changeMultiplier, "resale.changeMultiplier", Number.MIN_VALUE);
  unitSum([number(resale.trendWeight, "resale.trendWeight", 0, 1), number(resale.ageWeight, "resale.ageWeight", 0, 1)], "resale weights");
  if (!Number.isInteger(number(resale.lookbackMonths, "resale.lookbackMonths", 1, 1200))) invalid("resale.lookbackMonths");
  return { id: record.id, name: record.name, version: record.version, pillarWeights, weights: weights as unknown as Weights, rules: raw as unknown as EngineRules };
};
