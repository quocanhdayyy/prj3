import { prisma } from "../config/prisma";
import { Prisma } from "../generated/prisma/client";
import type { TransferType, DataReliability } from "../generated/prisma/client";
import { InputError } from "../utils/api-validation";
import { writeAudit } from "./audit-log.service";
import type { AuditContext } from "./audit-log.service";

export type TransferInput = { playerId: number; fromClubId?: number | null; toClubId: number; transferDate: Date; type: TransferType; fee?: Prisma.Decimal | null; reliability?: DataReliability; source?: string | null };
const validate = (item: TransferInput) => {
  if (item.fromClubId != null && item.fromClubId === item.toClubId) throw new InputError("CLB đi và đến phải khác nhau.");
  if (item.type === "FREE" && item.fee != null && !item.fee.isZero()) throw new InputError("Chuyển nhượng tự do không được có phí dương.");
  if (item.fee != null && (!item.source || !item.source.trim() || !item.reliability || item.reliability === "UNKNOWN")) {
    throw new InputError("Có dữ liệu phí thì cần source và reliability khác UNKNOWN.");
  }
};
export const listTransfers = (where: Prisma.TransferWhereInput, skip: number, take: number) => prisma.$transaction([
  prisma.transfer.findMany({ where, skip, take, orderBy: [{ transferDate: "desc" }, { id: "desc" }] }), prisma.transfer.count({ where }),
]);
export const findTransfer = (id: number) => prisma.transfer.findUnique({ where: { id } });
export const createTransfer = (data: TransferInput, context: AuditContext) => prisma.$transaction(async tx => {
  validate(data); const item = await tx.transfer.create({ data });
  await writeAudit(tx, context, "Transfer", item.id, "CREATE", undefined, item); return item;
});
export const updateTransfer = (id: number, data: Partial<TransferInput>, context: AuditContext) => prisma.$transaction(async tx => {
  const old = await tx.transfer.findUniqueOrThrow({ where: { id } }); validate({ ...old, ...data });
  const item = await tx.transfer.update({ where: { id }, data });
  await writeAudit(tx, context, "Transfer", id, "UPDATE", old, item); return item;
}, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
export const removeTransfer = (id: number, context: AuditContext) => prisma.$transaction(async tx => {
  const old = await tx.transfer.delete({ where: { id } }); await writeAudit(tx, context, "Transfer", id, "DELETE", old);
});
