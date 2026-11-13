import { prisma } from "../../config/prisma";
import type { Prisma } from "../../generated/prisma/client";
import { ownerWhere } from "../../utils/api-handler";
export const listMatchResults = (where: Prisma.MatchResultWhereInput, skip: number, take: number) => prisma.$transaction([
  prisma.matchResult.findMany({ where, skip, take, orderBy: [{ evaluatedAt: "desc" }, { id: "desc" }] }), prisma.matchResult.count({ where }),
]);
export const findMatchResult = (id: number, userId?: number) => prisma.matchResult.findUnique({ where: { id, ...ownerWhere(userId) } });
export const deleteMatchResult = (id: number, userId?: number) => prisma.matchResult.delete({ where: { id, ...ownerWhere(userId) } });
