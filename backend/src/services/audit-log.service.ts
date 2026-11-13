import { prisma } from "../config/prisma";
import type { Prisma, AuditAction } from "../generated/prisma/client";

export type AuditContext = { actorId: number; ipAddress: string | null };
const snapshot = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
export const writeAudit = (
  tx: Prisma.TransactionClient, context: AuditContext, entityType: string, entityId: number,
  action: AuditAction, oldValue?: unknown, newValue?: unknown,
) => tx.auditLog.create({ data: {
  ...context, entityType, entityId, action,
  ...(oldValue === undefined ? {} : { oldValue: snapshot(oldValue) }),
  ...(newValue === undefined ? {} : { newValue: snapshot(newValue) }),
} });
export const listAuditLogs = (where: Prisma.AuditLogWhereInput, skip: number, take: number) =>
  prisma.$transaction([
    prisma.auditLog.findMany({ where, skip, take, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
    prisma.auditLog.count({ where }),
  ]);
export const findAuditLog = (id: number) => prisma.auditLog.findUnique({ where: { id } });
