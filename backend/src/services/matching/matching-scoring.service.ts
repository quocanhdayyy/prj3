import { Prisma } from "../../generated/prisma/client";
import type { PlayerStats, InjuryHistory, PlayerDataVerification, PlayerMarketValueHistory } from "../../generated/prisma/client";
import type { Band, EngineRules } from "./matching-config";
import { positions } from "./matching-config";
import { normalizePositionCode } from "../../config/player-positions";

export const decimal = (value: Prisma.Decimal | string | number) => new Prisma.Decimal(value);
export const clampScore = (value: Prisma.Decimal) => Prisma.Decimal.max(0, Prisma.Decimal.min(100, value));
export const display = (value: Prisma.Decimal | null, digits = 2) => value === null ? null : value.toDecimalPlaces(digits).toNumber();
export const combine = (values: Record<string, Prisma.Decimal | null>, weights: Record<string, number>): Prisma.Decimal | null => {
  let total = decimal(0);
  for (const [key, weight] of Object.entries(weights)) {
    if (weight === 0) continue;
    const value = values[key]; if (value == null) return null;
    total = total.add(value.mul(weight));
  }
  return total;
};
export const scoreBand = (value: number, bands: Band[]) => {
  const band = [...bands].reverse().find(item => value >= item.min);
  return band ? decimal(band.score) : null;
};
export const normalizePosition = normalizePositionCode;
export const playerAge = (birth: Date, asOf: Date) => {
  if (birth > asOf) return null;
  let age = asOf.getUTCFullYear() - birth.getUTCFullYear();
  if (asOf.getUTCMonth() < birth.getUTCMonth() || (asOf.getUTCMonth() === birth.getUTCMonth() && asOf.getUTCDate() < birth.getUTCDate())) age--;
  return age;
};
export const scorePosition = (primary: string, secondary: string[], requested: string, rules: EngineRules) => {
  const main = normalizePosition(primary); const target = normalizePosition(requested);
  const extras = secondary.map(normalizePosition);
  if (!positions.includes(main) || !positions.includes(target)) return { score: null, basis: "UNSUPPORTED_POSITION" };
  if (main === target) return { score: decimal(rules.positionScores.primary), basis: "PRIMARY" };
  if (extras.includes(target)) return { score: decimal(rules.positionScores.secondary), basis: "SECONDARY" };
  const group = rules.positionGroups.find(items => items.includes(main));
  const targetGroup = rules.positionGroups.find(items => items.includes(target));
  if (!group || !targetGroup) return { score: null, basis: "POSITION_GROUP_NOT_CONFIGURED" };
  return group.includes(target) ? { score: decimal(rules.positionScores.group), basis: "GROUP" }
    : { score: decimal(rules.positionScores.other), basis: "OTHER" };
};
export const scoreBenchmark = (value: Prisma.Decimal, a: number, b: number, anchorScore: number) => {
  if (value.lte(a)) return value.mul(anchorScore).div(a);
  if (value.gte(b)) return decimal(100);
  return decimal(anchorScore).add(value.sub(a).mul(decimal(100).sub(anchorScore)).div(decimal(b).sub(a)));
};
const roleName = (position: string) => ({ LW: "WING", RW: "WING", LB: "FULLBACK", RB: "FULLBACK" } as Record<string, string>)[position] ?? position;
const statFields = ["goals", "assists", "yellowCards", "redCards", "tacklesWon", "interceptions", "keyPasses", "passesCompleted", "passesAttempted"] as const;
export const scoreForm = (stats: PlayerStats | null, position: string, rules: EngineRules) => {
  const role = roleName(normalizePosition(position)); const rule = rules.roles[role];
  const minutes = stats?.minutesPlayed ?? 0;
  const usableMinutes = Number.isInteger(minutes) && minutes > 0;
  const minutesScore = usableMinutes ? scoreBand(minutes, rules.minutes) : null;
  const per90: Record<string, Prisma.Decimal | null> = {};
  for (const field of statFields) {
    const count = stats?.[field];
    per90[field] = usableMinutes && count != null && Number.isInteger(count) && count >= 0 ? decimal(count).mul(90).div(minutes) : null;
  }
  const metricScores: Record<string, Prisma.Decimal | null> = {};
  const weights: Record<string, number> = { minutes: rule?.minutesWeight ?? 0 };
  if (rule) for (const [field, metric] of Object.entries(rule.metrics)) {
    const value = per90[field];
    metricScores[field] = value == null ? null : scoreBenchmark(value, metric.a, metric.b, rules.benchmarkAnchorScore);
    weights[field] = metric.weight;
  }
  const raw = rule && usableMinutes ? combine({ minutes: minutesScore, ...metricScores }, weights) : null;
  const cap = minutesScore === null ? null : Prisma.Decimal.min(100, minutesScore.add(rules.formCapBonus));
  const score = raw === null || cap === null ? null : Prisma.Decimal.min(raw, cap);
  const completed = stats?.passesCompleted; const attempted = stats?.passesAttempted;
  const passAccuracy = completed != null && attempted != null && attempted > 0 && completed >= 0 && completed <= attempted ? decimal(completed).mul(100).div(attempted) : null;
  return { score, role, details: {
    minutesPlayed: stats?.minutesPlayed ?? null, minutesScore: display(minutesScore),
    per90: Object.fromEntries(Object.entries(per90).map(([field, value]) => [field, display(value, 6)])),
    passAccuracy: display(passAccuracy), metricScores: Object.fromEntries(Object.entries(metricScores).map(([field, value]) => [field, display(value)])),
    weights, benchmarks: rule?.metrics ?? null, scoreBeforeCap: display(raw), cap: display(cap), capApplied: raw !== null && cap !== null && raw.gt(cap),
    reason: !stats ? "MISSING_SEASON_STATS" : !rule ? "UNSUPPORTED_ROLE" : !usableMinutes ? "NO_PLAYING_MINUTES" : score === null ? "MISSING_REQUIRED_STATS" : null,
  } };
};

// Clamp day when shifting months/years (e.g. leap day -> last valid day).
export const shiftCalendarMonths = (date: Date, months: number) => {
  const shifted = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0)).getUTCDate();
  shifted.setUTCDate(Math.min(date.getUTCDate(), lastDay)); return shifted;
};
export const scoreInjuryDays = (days: number | null, ongoing: boolean, rules: EngineRules) => {
  const band = days === null ? undefined : rules.injury.find(item => item.max === null || days <= item.max);
  const base = band ? decimal(band.score) : null;
  return { base, score: base === null ? null : ongoing ? Prisma.Decimal.min(base, rules.ongoingInjuryCap) : base };
};
export const scoreInjury = (injuries: InjuryHistory[], verification: PlayerDataVerification | null, asOf: Date, evaluatedAt: Date, rules: EngineRules) => {
  const windowStart = shiftCalendarMonths(asOf, -12 * rules.injuryLookbackYears);
  // Elapsed calendar days [start, recovery), matching the existing injury service.
  const intervals = injuries.map(item => [Math.max(item.startDate.getTime(), windowStart.getTime()), Math.min(item.endDate?.getTime() ?? asOf.getTime(), asOf.getTime())])
    .filter((item): item is [number, number] => item[0] !== undefined && item[1] !== undefined && item[1] > item[0]).sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const interval of intervals) {
    const last = merged[merged.length - 1];
    if (last && interval[0] <= last[1]) last[1] = Math.max(last[1], interval[1]); else merged.push([...interval]);
  }
  const observedDays = merged.reduce((total, [start, end]) => total + (end - start) / 86400000, 0);
  const ongoing = injuries.some(item => item.startDate <= asOf && (item.endDate === null || item.endDate > asOf));
  const covered = !!(verification?.injuryCoveredFrom && verification.injuryCoveredThrough && verification.injuryVerifiedAt && verification.injuryVerifiedById
    && verification.injurySource && verification.injuryCoveredFrom <= windowStart && verification.injuryCoveredThrough >= asOf && verification.injuryVerifiedAt <= evaluatedAt);
  const { base, score } = scoreInjuryDays(covered ? observedDays : null, ongoing, rules);
  return { score, details: { observedDays, daysMissed: covered ? observedDays : null, coverageVerified: covered, ongoing,
    windowStart: windowStart.toISOString().slice(0, 10), windowEnd: asOf.toISOString().slice(0, 10),
    scoreBeforeCap: display(base), cap: ongoing ? rules.ongoingInjuryCap : null, reason: covered ? null : "INJURY_COVERAGE_NOT_VERIFIED" } };
};

export const scoreResaleValues = (current: Prisma.Decimal | null, prior: Prisma.Decimal | null, age: number | null, rules: EngineRules) => {
  const ageScore = age === null ? null : scoreBand(age, rules.resaleAge);
  const change = current !== null && prior !== null && prior.gt(0) ? current.sub(prior).mul(100).div(prior) : null;
  const trendScore = change === null ? null : clampScore(decimal(rules.resale.changeBase).add(change.mul(rules.resale.changeMultiplier)));
  const score = combine({ trend: trendScore, age: ageScore }, { trend: rules.resale.trendWeight, age: rules.resale.ageWeight });
  return { ageScore, change, trendScore, score };
};

export const scoreResale = (history: PlayerMarketValueHistory[], age: number | null, asOf: Date, evaluatedAt: Date, rules: EngineRules, source?: string) => {
  const priorDate = shiftCalendarMonths(asOf, -rules.resale.lookbackMonths);
  const known = history.filter(item => item.recordedAt <= evaluatedAt && item.valuedAt <= asOf && (!source || item.source === source));
  const sources = [...new Set(known.map(item => item.source))];
  const pairs: { now: PlayerMarketValueHistory; old: PlayerMarketValueHistory }[] = [];
  for (const name of sources) {
    const rows = known.filter(item => item.source === name).sort((a, b) => b.valuedAt.getTime() - a.valuedAt.getTime());
    const now = rows[0]; const old = rows.find(item => item.valuedAt <= priorDate);
    // One stale quote cannot masquerade as two different valuation dates.
    if (now && old && old.valuedAt < now.valuedAt) pairs.push({ now, old });
  }
  const pair = pairs.length === 1 ? pairs[0] : undefined;
  const { ageScore, change, trendScore, score } = scoreResaleValues(pair?.now.marketValue ?? null, pair?.old.marketValue ?? null, age, rules);
  return { score, details: {
    ageScore: display(ageScore), changePercent: display(change, 6), trendScore: display(trendScore),
    weights: { trend: rules.resale.trendWeight, age: rules.resale.ageWeight }, source: pair?.now.source ?? null,
    currentId: pair?.now.id ?? null, priorId: pair?.old.id ?? null,
    currentValue: pair?.now.marketValue.toString() ?? null, priorValue: pair?.old.marketValue.toString() ?? null,
    selectionPolicy: "LATEST_ON_OR_BEFORE_TARGETS_V1",
    currentTargetDate: asOf.toISOString().slice(0, 10), priorTargetDate: priorDate.toISOString().slice(0, 10),
    currentDate: pair?.now.valuedAt.toISOString().slice(0, 10) ?? null, priorDate: pair?.old.valuedAt.toISOString().slice(0, 10) ?? null,
    quoteAgeDays: pair ? (asOf.getTime() - pair.now.valuedAt.getTime()) / 86400000 : null,
    comparisonDays: pair ? (pair.now.valuedAt.getTime() - pair.old.valuedAt.getTime()) / 86400000 : null,
    reason: pairs.length > 1 ? "AMBIGUOUS_VALUATION_SOURCES" : !pair ? "MISSING_SAME_SOURCE_VALUATIONS_ON_OR_BEFORE_TARGETS" : change === null ? "PRIOR_VALUE_NOT_POSITIVE" : ageScore === null ? "UNSUPPORTED_AGE" : null,
  } };
};
