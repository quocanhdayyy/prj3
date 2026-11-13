import { ApiError } from "../utils/api-handler";
import { prisma } from "../config/prisma";

export type CreateShortlistInput = {
  userId: number; playerId: number; shortlistId?: number; priority?: number; requirementId?: number | null; note?: string | null;
};
export type UpdateShortlistInput = Pick<CreateShortlistInput, "requirementId" | "note" | "priority">;
export const getShortlists = (userId?: number) => prisma.shortlistItem.findMany({ where: userId === undefined ? {} : { userId }, orderBy: { id: "asc" } });
export const getShortlistById = (id: number, userId?: number) => prisma.shortlistItem.findUnique({ where: { id, ...(userId === undefined ? {} : { userId }) } });
// Keep /api/shortlists compatible: entries are placed in the user's default list.
export const createShortlist = async (data: CreateShortlistInput) => {
  let shortlistId = data.shortlistId;
  if (shortlistId !== undefined) {
    const list = await prisma.shortlist.findUnique({ where: { id: shortlistId, userId: data.userId } });
    if (!list) throw new ApiError(404, "Không tìm thấy danh sách của bạn.");
  } else {
    const list = await prisma.shortlist.upsert({
      where: { defaultOwnerId: data.userId },
      create: { userId: data.userId, defaultOwnerId: data.userId, name: "Danh sách mặc định" },
      update: {},
    });
    shortlistId = list.id;
  }
  return prisma.shortlistItem.create({ data: { ...data, shortlistId } });
};
export const updateShortlist = (id: number, data: UpdateShortlistInput, userId?: number) => prisma.shortlistItem.update({ where: { id, ...(userId === undefined ? {} : { userId }) }, data });
export const deleteShortlist = (id: number, userId?: number) => prisma.shortlistItem.delete({ where: { id, ...(userId === undefined ? {} : { userId }) } });
