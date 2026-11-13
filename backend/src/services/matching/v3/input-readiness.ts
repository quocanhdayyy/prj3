import { metricsInput, metricInputHash, positionMinutesIssue } from "../../player-metrics-input";
import { ENGINE_VERSION, IMPLEMENTATION_STAGE, SCORING_AVAILABLE, matrixVersion, inputMetrics, percentageMetrics, ratioMetrics, positionGroup, leagueNames } from "./config";
import type { Prisma } from "../../../generated/prisma/client";

type StatsRow = Prisma.PlayerStatsGetPayload<{ include: { player: true; estimate: true; metrics: true } }>;
const record = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
export function inspectMetric(key: string, raw: unknown) {
  const m = record(raw);
  if (!Object.keys(m).length) return { status: "MISSING", usable: false, issue: null };
  if (m.status === "MISSING" && m.value === null) return { status: "MISSING", usable: false, issue: null };
  const status = typeof m.status === "string" ? m.status : "INVALID";
  const value = m.value;
  const valid = ["OBSERVED", "DERIVED", "ESTIMATED"].includes(status)
    && typeof value === "number" && Number.isFinite(value)
    && (key === "goalsPreventedPer90" || value >= 0)
    && (percentageMetrics.has(key) ? value <= 100 && m.unit === "PERCENT" : m.unit === "PER_90")
    && typeof m.basis === "string" && m.basis.trim().length > 0;
  if (!valid) return { status, usable: false, issue: "INVALID_VALUE_UNIT_STATUS_OR_BASIS" };
  if (ratioMetrics.has(key)) {
    const successes = m.successes, attempts = m.attempts;
    if (typeof successes !== "number" || typeof attempts !== "number" || !Number.isFinite(successes) || !Number.isFinite(attempts)
      || attempts <= 0 || successes < 0 || successes > attempts
      || Math.abs((value as number) - 100 * successes / attempts) > .00001) return { status, usable: false, issue: "MISSING_OR_INVALID_EVENT_COUNTS" };
  }
  return { status, usable: true, issue: null };
}

// Input inventory only: no percentile, rating, imputation or update is performed here.
export function inspectInputs(rows: StatsRow[], season: string) {
  const totals = { players: rows.length, inScope: 0, outsideScope: 0, outfield: 0, goalkeeper: 0,
    metricsRecords: 0, staleRecords: 0, unknownPosition: 0, completePrototypeInputs: 0, completeObservedInputs: 0,
    prototypeReferenceCandidates: 0, observedReferenceCandidates: 0, positionMinutesRecords: 0, invalidPositionMinutesRecords: 0, zeroMinutePlayers: 0, nullValues: 0, invalidValues: 0 };
  const statuses: Record<string, number> = { OBSERVED: 0, DERIVED: 0, ESTIMATED: 0, MISSING: 0, INVALID: 0 };
  const byMetric: Record<string, { required: number; observed: number; derived: number; estimated: number; missing: number; invalid: number }> = {};
  const issues: { playerId: number; playerName: string; statsId: number; issue: string; metric?: string }[] = [];
  const leagues: Record<string, number> = {};
  const incomplete: { playerId: number; playerName: string; statsId: number; missing: string[] }[] = [];
  for (const row of rows) {
    const group = Object.hasOwn(positionGroup, row.player.position) ? positionGroup[row.player.position] : undefined;
    if (!group) { totals.unknownPosition++; issues.push({ playerId: row.playerId, playerName: row.player.name, statsId: row.id, issue: "UNKNOWN_POSITION" }); }
    const evidence = record(row.metrics?.evidence);
    const memberships = Array.isArray(evidence.leagues) ? evidence.leagues.filter((l): l is string => typeof l === "string" && leagueNames.includes(l)) : [];
    const scope = row.player.transfermarktId !== null && memberships.length > 0;
    if (scope) totals.inScope++; else totals.outsideScope++;
    for (const league of new Set(memberships)) leagues[league] = (leagues[league] ?? 0) + 1;
    if (group === "GK") totals.goalkeeper++; else if (group) totals.outfield++;
    if (row.positionMinutes != null) totals.positionMinutesRecords++;
    const positionIssue = positionMinutesIssue(row.minutesPlayed, row.positionMinutes, row.positionMinutesSource);
    if (positionIssue) {
      totals.invalidPositionMinutesRecords++;
      issues.push({ playerId: row.playerId, playerName: row.player.name, statsId: row.id, issue: `INVALID_POSITION_MINUTES: ${positionIssue}` });
    }
    if (row.minutesPlayed === 0) totals.zeroMinutePlayers++;
    if (row.metrics) totals.metricsRecords++;
    const stale = !!row.metrics && row.metrics.inputHash !== metricInputHash(metricsInput(row.player, row, row.estimate));
    if (stale) { totals.staleRecords++; issues.push({ playerId: row.playerId, playerName: row.player.name, statsId: row.id, issue: "STALE_METRICS" }); }
    const values = record(row.metrics?.values), keys = group === "GK" ? inputMetrics.goalkeeper : inputMetrics.outfield;
    let observedOnly = true; const missing: string[] = [];
    for (const key of keys) {
      const checked = inspectMetric(key, values[key]);
      const bucket = byMetric[key] ??= { required: 0, observed: 0, derived: 0, estimated: 0, missing: 0, invalid: 0 };
      bucket.required++;
      const status = Object.hasOwn(statuses, checked.status) ? checked.status : "INVALID";
      statuses[status] = (statuses[status] ?? 0) + 1;
      if (checked.issue) {
        bucket.invalid++; totals.invalidValues++;
        issues.push({ playerId: row.playerId, playerName: row.player.name, statsId: row.id, metric: key, issue: checked.issue });
      } else if (status === "MISSING") { bucket.missing++; totals.nullValues++; }
      else if (status === "OBSERVED") bucket.observed++;
      else if (status === "DERIVED") bucket.derived++;
      else if (status === "ESTIMATED") bucket.estimated++;
      if (!checked.usable) missing.push(key);
      if (status === "ESTIMATED" || !checked.usable) observedOnly = false;
    }
    if (positionIssue) missing.push("positionMinutes");
    if (row.minutesPlayed <= 0) missing.push("positiveMinutesPlayed");
    const complete = group && row.metrics && !stale && !missing.length;
    if (complete) {
      totals.completePrototypeInputs++;
      if (observedOnly) totals.completeObservedInputs++;
      if (scope && row.minutesPlayed >= 450) { totals.prototypeReferenceCandidates++; if (observedOnly) totals.observedReferenceCandidates++; }
    }
    if (missing.length || stale || !group) incomplete.push({ playerId: row.playerId, playerName: row.player.name, statsId: row.id, missing: [...missing, ...(stale ? ["staleMetrics"] : []), ...(!group ? ["position"] : [])] });
  }
  return { engineVersion: ENGINE_VERSION, implementationStage: IMPLEMENTATION_STAGE, scoringAvailable: SCORING_AVAILABLE, matrixVersion, season,
    totals, statuses, byMetric, leagues, issues, incomplete,
    notes: ["Đủ đầu vào gồm giá trị ước tính; chưa đồng nghĩa đủ dữ liệu quan sát hoặc đủ F/S/R.",
      "Đây là kiểm kê đầu vào, không tính percentile hoặc điểm vai trò.",
      "Một cầu thủ có thể thuộc nhiều giải trong mùa; không cộng các số theo giải thành tổng người duy nhất.",
      "Các bộ đầy đủ không phải tập percentile cuối cùng: giai đoạn 2 còn xét dữ liệu theo từng chỉ số/nhóm vị trí."] };
}
