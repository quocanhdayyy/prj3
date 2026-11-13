import { createHash } from "node:crypto";
import { playerPositions } from "../config/player-positions";

// Shared by API writes and the stage-1 inventory, including rows imported directly.
export const positionMinutesIssue = (minutes: number, value: unknown, source: unknown): string | null => {
  if (value == null) return source == null ? null : "positionMinutesSource chỉ dùng khi có positionMinutes.";
  if (typeof value !== "object" || Array.isArray(value) || !Object.keys(value).length
    || typeof source !== "string" || !source.trim() || source.length > 255) return "Phút theo vị trí phải có map và nguồn xác nhận.";
  let sum = 0;
  for (const [key, count] of Object.entries(value)) {
    if (!playerPositions.includes(key) || typeof count !== "number" || !Number.isInteger(count) || count < 0) return "positionMinutes chỉ nhận 10 mã vị trí và số phút nguyên không âm.";
    sum += count;
  }
  return sum > minutes ? "Tổng phút theo vị trí không được vượt minutesPlayed." : null;
};

export const metricStatsFields = [
  "id", "playerId", "season", "appearances", "minutesPlayed", "goals", "assists",
  "yellowCards", "redCards", "tacklesWon", "interceptions", "keyPasses", "passesCompleted", "passesAttempted",
] as const;

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, canonical(v)]));
  }
  return value;
};

export const metricsInput = (
  player: { id: number; transfermarktId: number | null; name: string; dateOfBirth: Date; position: string; height: number | null },
  stats: object,
  estimate: { method: string; values: unknown } | null,
) => ({
  player: {
    id: player.id, transfermarktId: player.transfermarktId, name: player.name,
    dateOfBirth: player.dateOfBirth.toISOString().slice(0, 10), position: player.position, height: player.height,
  },
  stats: Object.fromEntries(metricStatsFields.map(key => [key, (stats as Record<string, unknown>)[key]])),
  estimate: estimate ? { method: estimate.method, values: estimate.values } : null,
});

export const metricInputHash = (input: unknown) =>
  createHash("sha256").update(JSON.stringify(canonical(input))).digest("hex");
