import { prisma } from "../config/prisma";
import { Prisma } from "../generated/prisma/client";
import type { InjuryHistory } from "../generated/prisma/client";

export type CreateInjuryInput = {
  playerId: number;
  injuryType: string;
  bodyRegion?: string | null;
  startDate: Date;
  endDate?: Date | null;
};
export type UpdateInjuryInput = Partial<Omit<CreateInjuryInput, "playerId">>;
export class InjuryInputError extends Error {}

const todayUtc = () => new Date(
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }) + "T00:00:00.000Z",
);
const checkDates = (start: Date, end: Date | null | undefined) => {
  const today = todayUtc();
  if (start > today || (end != null && end > today)) {
    throw new InjuryInputError("Ngày chấn thương hoặc hồi phục không được nằm trong tương lai.");
  }
  if (end != null && end < start) {
    throw new InjuryInputError("endDate không được trước startDate.");
  }
};
const withDaysMissed = (injury: InjuryHistory) => ({
  ...injury,
  // Elapsed calendar days: an injury resolved on its start date has 0 days.
  daysMissed: Math.max(0, Math.floor(((injury.endDate ?? todayUtc()).getTime() - injury.startDate.getTime()) / 86400000)),
});
export const getInjuries = async () =>
  (await prisma.injuryHistory.findMany({ orderBy: { id: "asc" } })).map(withDaysMissed);
export const getInjuryById = async (id: number) => {
  const injury = await prisma.injuryHistory.findUnique({ where: { id } });
  return injury ? withDaysMissed(injury) : null;
};
export const createInjury = async (data: CreateInjuryInput) => {
  checkDates(data.startDate, data.endDate);
  return withDaysMissed(await prisma.injuryHistory.create({ data }));
};
export const updateInjury = async (id: number, data: UpdateInjuryInput) => {
  const injury = await prisma.$transaction(async tx => {
    const current = await tx.injuryHistory.findUniqueOrThrow({ where: { id } });
    const end = Object.hasOwn(data, "endDate") ? data.endDate : current.endDate;
    checkDates(data.startDate ?? current.startDate, end);
    return tx.injuryHistory.update({ where: { id }, data });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return withDaysMissed(injury);
};
export const deleteInjury = (id: number) => prisma.injuryHistory.delete({ where: { id } });
