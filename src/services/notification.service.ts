import { prisma } from "../config/prisma";
import type { Prisma, NotificationType } from "../generated/prisma/client";
import { ownerWhere } from "../utils/api-handler";
export type NotificationInput = { userId: number; playerId?: number | null; type: NotificationType; title: string; content: string; eventKey: string };
export const listNotifications = (where: Prisma.NotificationWhereInput, skip: number, take: number) => prisma.$transaction([
  prisma.notification.findMany({ where, skip, take, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }), prisma.notification.count({ where }),
]);
export const findNotification = (id: number, userId?: number) => prisma.notification.findUnique({ where: { id, ...ownerWhere(userId) } });
// Deduplication is enforced by (userId, eventKey) for future Scheduler use too.
export const createNotification = (data: NotificationInput) => prisma.notification.create({ data });
export const markNotification = (id: number, isRead: boolean, userId?: number) => prisma.notification.update({ where: { id, ...ownerWhere(userId) }, data: { readAt: isRead ? new Date() : null } });
export const deleteNotification = (id: number, userId?: number) => prisma.notification.delete({ where: { id, ...ownerWhere(userId) } });
