import { prisma } from "../../config/prisma";
import { Prisma } from "../../generated/prisma/client";
import type { DataReliability, PlayerRegistrationStatus } from "../../generated/prisma/client";
import { ApiError, ownerWhere, requireFound } from "../../utils/api-handler";
import { InputError } from "../../utils/api-validation";
import { writeAudit } from "../audit-log.service";
import type { AuditContext } from "../audit-log.service";

export type ValuationInput = {
  playerId: number; valuedAt: Date; marketValue: Prisma.Decimal; source: string; reliability?: DataReliability;
};
export const listValuations = (playerId: number | undefined, skip: number, take: number) => prisma.$transaction([
  prisma.playerMarketValueHistory.findMany({ where: playerId === undefined ? {} : { playerId }, skip, take, orderBy: [{ valuedAt: "desc" }, { id: "desc" }] }),
  prisma.playerMarketValueHistory.count({ where: playerId === undefined ? {} : { playerId } }),
]);
export const findValuation = (id: number) => prisma.playerMarketValueHistory.findUnique({ where: { id } });
export const createValuation = (data: ValuationInput, context: AuditContext) => prisma.$transaction(async tx => {
  const row = await tx.playerMarketValueHistory.create({ data });
  await writeAudit(tx, context, "PlayerMarketValueHistory", row.id, "CREATE", undefined, row);
  return row;
});
export const updateValuation = (id: number, data: Partial<Omit<ValuationInput, "playerId">>, context: AuditContext) => prisma.$transaction(async tx => {
  const old = await tx.playerMarketValueHistory.findUniqueOrThrow({ where: { id } });
  // A correction cannot claim that a valuation was already recorded before its valuation date.
  if (data.valuedAt && data.valuedAt.toISOString().slice(0, 10) > old.recordedAt.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" })) {
    throw new InputError("valuedAt không được sau ngày ghi nhận ban đầu. Hãy tạo lần định giá mới.");
  }
  const row = await tx.playerMarketValueHistory.update({ where: { id }, data });
  await writeAudit(tx, context, "PlayerMarketValueHistory", id, "UPDATE", old, row);
  return row;
}, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
export const removeValuation = (id: number, context: AuditContext) => prisma.$transaction(async tx => {
  const old = await tx.playerMarketValueHistory.delete({ where: { id } });
  await writeAudit(tx, context, "PlayerMarketValueHistory", id, "DELETE", old);
});

export type EstimateInput = {
  playerId: number; requirementId: number; estimatedFee?: Prisma.Decimal | null;
  expectedSalaryPerYear?: Prisma.Decimal | null; feeSource?: string | null; salarySource?: string | null;
};
type EstimatePatch = Partial<Omit<EstimateInput, "playerId" | "requirementId">>;
const validateEstimate = (data: EstimatePatch) => {
  if (data.estimatedFee == null && data.expectedSalaryPerYear == null) throw new InputError("Cần biết ít nhất phí hoặc lương dự kiến.");
  for (const [amount, source] of [[data.estimatedFee, data.feeSource], [data.expectedSalaryPerYear, data.salarySource]] as const) {
    if ((amount != null) !== (source != null)) throw new InputError("Khoản ước tính phải có nguồn đi kèm; khi bỏ khoản đó cần bỏ cả nguồn.");
  }
};
export const listEstimates = (filters: { playerId?: number; requirementId?: number }, userId: number | undefined, skip: number, take: number) => {
  const where = { ...filters, ...ownerWhere(userId) };
  return prisma.$transaction([
    prisma.matchingInput.findMany({ where, skip, take, orderBy: { id: "desc" } }), prisma.matchingInput.count({ where }),
  ]);
};
export const findEstimate = (id: number, userId?: number) => prisma.matchingInput.findFirst({ where: { id, ...ownerWhere(userId) } });
export const createEstimate = (data: EstimateInput, userId: number | undefined, context: AuditContext) => prisma.$transaction(async tx => {
  const requirement = requireFound(await tx.clubRequirement.findFirst({ where: { id: data.requirementId, ...ownerWhere(userId) } }));
  validateEstimate(data);
  const row = await tx.matchingInput.create({ data: { ...data, userId: requirement.userId } });
  await writeAudit(tx, context, "MatchingInput", row.id, "CREATE", undefined, row);
  return row;
}, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
export const updateEstimate = (id: number, data: EstimatePatch, userId: number | undefined, context: AuditContext) => prisma.$transaction(async tx => {
  const old = requireFound(await tx.matchingInput.findFirst({ where: { id, ...ownerWhere(userId) } }));
  validateEstimate({ ...old, ...data });
  const row = await tx.matchingInput.update({ where: { id }, data });
  await writeAudit(tx, context, "MatchingInput", id, "UPDATE", old, row);
  return row;
}, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
export const removeEstimate = (id: number, userId: number | undefined, context: AuditContext) => prisma.$transaction(async tx => {
  const old = requireFound(await tx.matchingInput.findFirst({ where: { id, ...ownerWhere(userId) } }));
  await tx.matchingInput.delete({ where: { id } });
  await writeAudit(tx, context, "MatchingInput", id, "DELETE", old);
}, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

export type VerificationInput = {
  injuryHistory?: { coveredFrom: Date; coveredThrough: Date; source: string } | null;
  registration?: { status: Exclude<PlayerRegistrationStatus, "UNKNOWN">; asOf: Date; source: string } | null;
};
export const listVerifications = (playerId: number | undefined, skip: number, take: number) => prisma.$transaction([
  prisma.playerDataVerification.findMany({ where: playerId === undefined ? {} : { playerId }, skip, take, orderBy: { playerId: "asc" } }),
  prisma.playerDataVerification.count({ where: playerId === undefined ? {} : { playerId } }),
]);
export const findVerification = (playerId: number) => prisma.playerDataVerification.findUnique({ where: { playerId } });
export const saveVerification = (playerId: number, data: VerificationInput, context: AuditContext) => prisma.$transaction(async tx => {
  const player = requireFound(await tx.player.findUnique({ where: { id: playerId } }));
  const old = await tx.playerDataVerification.findUnique({ where: { playerId } });
  const update: Omit<Prisma.PlayerDataVerificationUncheckedCreateInput, "playerId"> = {};
  const now = new Date();
  if (Object.hasOwn(data, "injuryHistory")) {
    const injury = data.injuryHistory;
    if (injury && injury.coveredFrom < player.dateOfBirth) throw new InputError("Phạm vi chấn thương không được bắt đầu trước ngày sinh.");
    Object.assign(update, {
      injuryCoveredFrom: injury?.coveredFrom ?? null, injuryCoveredThrough: injury?.coveredThrough ?? null,
      injurySource: injury?.source ?? null, injuryVerifiedAt: injury ? now : null, injuryVerifiedById: injury ? context.actorId : null,
    });
  }
  if (Object.hasOwn(data, "registration")) {
    const registration = data.registration;
    if (registration && registration.asOf < player.dateOfBirth) throw new InputError("Ngày xác nhận trạng thái không được trước ngày sinh.");
    if (registration?.status === "FREE_AGENT" && await tx.contract.findFirst({ where: {
      playerId, status: "ACTIVE", startDate: { lte: registration.asOf }, endDate: { gte: registration.asOf },
    }})) throw new ApiError(409, "Còn hợp đồng ACTIVE tại ngày xác nhận. Hãy kiểm tra hợp đồng trước khi xác nhận tự do.");
    Object.assign(update, {
      registrationStatus: registration?.status ?? "UNKNOWN", registrationAsOf: registration?.asOf ?? null,
      registrationSource: registration?.source ?? null, registrationVerifiedAt: registration ? now : null,
      registrationVerifiedById: registration ? context.actorId : null,
    });
  }
  // Only scalar data assembled by the server enters this upsert.
  const row = await tx.playerDataVerification.upsert({
    where: { playerId }, update,
    create: { playerId, ...update },
  });
  await writeAudit(tx, context, "PlayerDataVerification", playerId, old ? "UPDATE" : "CREATE", old ?? undefined, row);
  return row;
}, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
export const removeVerification = (playerId: number, context: AuditContext) => prisma.$transaction(async tx => {
  const old = await tx.playerDataVerification.delete({ where: { playerId } });
  await writeAudit(tx, context, "PlayerDataVerification", playerId, "DELETE", old);
});
