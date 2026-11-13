import { prisma } from "../config/prisma";
import { ownerWhere, ApiError } from "../utils/api-handler";
import { Prisma } from "../generated/prisma/client";
import { writeAudit } from "./audit-log.service";
import type { AuditContext } from "./audit-log.service";

export const listLists = (userId: number | undefined, skip: number, take: number) => prisma.$transaction([
  prisma.shortlist.findMany({ where: ownerWhere(userId), skip, take, orderBy: { id: "asc" }, include: { _count: { select: { items: true } } } }),
  prisma.shortlist.count({ where: ownerWhere(userId) }),
]);
export const findList = (id: number, userId?: number) => prisma.shortlist.findUnique({ where: { id, ...ownerWhere(userId) }, include: { _count: { select: { items: true } } } });
export const listItems = async (id: number, userId: number | undefined, skip: number, take: number) => prisma.$transaction(async tx => {
  if (!await tx.shortlist.findUnique({ where: { id, ...ownerWhere(userId) } })) throw new ApiError(404, "Không tìm thấy danh sách.");
  return Promise.all([
    tx.shortlistItem.findMany({ where: { shortlistId: id }, skip, take, orderBy: [{ priority: "asc" }, { id: "asc" }] }),
    tx.shortlistItem.count({ where: { shortlistId: id } }),
  ]);
});
export const createList = (name: string, context: AuditContext) => prisma.$transaction(async tx => {
  const item = await tx.shortlist.create({ data: { name, userId: context.actorId } });
  await writeAudit(tx, context, "Shortlist", item.id, "CREATE", undefined, item); return item;
});
export const renameList = (id: number, name: string, userId: number | undefined, context: AuditContext) => prisma.$transaction(async tx => {
  const old = await tx.shortlist.findUniqueOrThrow({ where: { id, ...ownerWhere(userId) } });
  const item = await tx.shortlist.update({ where: { id, ...ownerWhere(userId) }, data: { name } });
  await writeAudit(tx, context, "Shortlist", id, "UPDATE", old, item); return item;
});
export const deleteList = (id: number, userId: number | undefined, context: AuditContext) => prisma.$transaction(async tx => {
  const old = await tx.shortlist.findUniqueOrThrow({ where: { id, ...ownerWhere(userId) } });
  if (await tx.shortlistItem.count({ where: { shortlistId: id } })) throw new ApiError(409, "Danh sách còn cầu thủ. Xóa các mục trước khi xóa danh sách.");
  await tx.shortlist.delete({ where: { id, ...ownerWhere(userId) } });
  await writeAudit(tx, context, "Shortlist", id, "DELETE", old);
}, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
