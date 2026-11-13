import { prisma } from "../config/prisma";
import { Prisma } from "../generated/prisma/client";
import { metricsInput, metricInputHash, metricStatsFields, positionMinutesIssue } from "./player-metrics-input";

export type CreatePlayerStatsInput = Omit<Prisma.PlayerStatsUncheckedCreateInput, "id" | "estimate" | "metrics" | "roleSnapshots">;
export type UpdatePlayerStatsInput = Partial<Omit<CreatePlayerStatsInput, "playerId" | "season">>;
export class StatsInputError extends Error {}

const checkPassing = (data: { passesCompleted?: number | null; passesAttempted?: number | null }) => {
  if (data.passesCompleted != null && data.passesAttempted != null && data.passesCompleted > data.passesAttempted) {
    throw new StatsInputError("Chuyền thành công không được vượt tổng đường chuyền.");
  }
};
const checkPositionMinutes = (minutes: number, value: unknown, source: unknown) => {
  const issue = positionMinutesIssue(minutes, value === Prisma.DbNull ? null : value, source);
  if (issue) throw new StatsInputError(issue);
};
const playerInclude = {
  player: { select: { id: true, transfermarktId: true, name: true, dateOfBirth: true, position: true, height: true } },
  estimate: true,
} as const;
const detailInclude = { ...playerInclude, metrics: true } as const;
type StatsWithPlayer = Prisma.PlayerStatsGetPayload<{ include: typeof playerInclude }>;
type Metrics = Prisma.PlayerStatsGetPayload<{ include: typeof detailInclude }>["metrics"];
const withAccuracy = ({ player, metrics, ...stats }: StatsWithPlayer & { metrics?: Metrics }) => ({
  ...stats,
  ...(metrics === undefined ? {} : {
    metrics: metrics ? {
      ...metrics,
      stale: metrics.inputHash !== metricInputHash(metricsInput(player, stats, stats.estimate)),
    } : null,
  }),
  playerName: player.name,
  passAccuracy: stats.passesCompleted != null && stats.passesAttempted != null && stats.passesAttempted > 0
    ? Number((stats.passesCompleted / stats.passesAttempted * 100).toFixed(2))
    : null,
});

export const getPlayerStats = async () =>
  // Provenance is large; return it only for the requested season-stat detail.
  (await prisma.playerStats.findMany({ orderBy: { id: "asc" }, include: playerInclude })).map(withAccuracy);

export const getPlayerStatsById = async (id: number) => {
  const stats = await prisma.playerStats.findUnique({ where: { id }, include: detailInclude });
  return stats ? withAccuracy(stats) : null;
};
export const createPlayerStats = async (data: CreatePlayerStatsInput) => {
  checkPassing(data);
  checkPositionMinutes(data.minutesPlayed, data.positionMinutes, data.positionMinutesSource);
  return withAccuracy(await prisma.playerStats.create({ data, include: detailInclude }));
};
export const updatePlayerStats = async (id: number, data: UpdatePlayerStatsInput) => {
  const stats = await prisma.$transaction(async tx => {
    const current = await tx.playerStats.findUniqueOrThrow({ where: { id } });
    checkPassing({ ...current, ...data });
    checkPositionMinutes(data.minutesPlayed ?? current.minutesPlayed,
      data.positionMinutes === undefined ? current.positionMinutes : data.positionMinutes,
      data.positionMinutesSource === undefined ? current.positionMinutesSource : data.positionMinutesSource);
    // A PATCH that repeats the same values is not a correction.
    const changed = Object.keys(data).filter(key => {
      const value = data[key as keyof UpdatePlayerStatsInput];
      const previous = current[key as keyof typeof current];
      if (key === "positionMinutes") return metricInputHash(value === Prisma.DbNull ? null : value) !== metricInputHash(previous);
      return value !== previous;
    });
    if (changed.some(key => (metricStatsFields as readonly string[]).includes(key))) {
      await tx.playerStatsEstimate.deleteMany({ where: { statsId: id } });
      await tx.playerStatsMetrics.deleteMany({ where: { statsId: id } });
    }
    if (changed.length) await tx.roleScoreSnapshot.deleteMany({ where: { statsId: id } });
    return tx.playerStats.update({ where: { id }, data, include: detailInclude });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return withAccuracy(stats);
};
export const deletePlayerStats = (id: number) =>
  prisma.playerStats.delete({ where: { id } });
