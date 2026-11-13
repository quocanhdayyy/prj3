import { prisma } from "../config/prisma";
import { Prisma } from "../generated/prisma/client";
import { InputError } from "../utils/api-validation";
import { readPosition } from "../config/player-positions";

export type CreateRequirementInput = {
  clubId: number; userId: number; minAge: number; maxAge: number;
  salaryLimit: Prisma.Decimal; position: string; priority: number; budget: Prisma.Decimal;
};
export type UpdateRequirementInput = Partial<Omit<CreateRequirementInput, "userId">>;
const checkAges = (min: number, max: number) => {
  if (min > max) throw new InputError("minAge không được vượt maxAge.");
};
export const getRequirements = (userId?: number) => prisma.clubRequirement.findMany({ where: userId === undefined ? {} : { userId }, orderBy: { id: "asc" } });
export const getRequirementById = (id: number, userId?: number) => prisma.clubRequirement.findUnique({ where: { id, ...(userId === undefined ? {} : { userId }) } });
export const createRequirement = (data: CreateRequirementInput) => {
  checkAges(data.minAge, data.maxAge);
  return prisma.clubRequirement.create({ data: { ...data, position: readPosition(data.position) } });
};
export const updateRequirement = (id: number, data: UpdateRequirementInput, userId?: number) =>
  prisma.$transaction(async tx => {
    const current = await tx.clubRequirement.findUniqueOrThrow({ where: { id, ...(userId === undefined ? {} : { userId }) } });
    checkAges(data.minAge ?? current.minAge, data.maxAge ?? current.maxAge);
    return tx.clubRequirement.update({ where: { id, ...(userId === undefined ? {} : { userId }) }, data: { ...data, position: readPosition(data.position ?? current.position) } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
export const deleteRequirement = (id: number, userId?: number) => prisma.clubRequirement.delete({ where: { id, ...(userId === undefined ? {} : { userId }) } });
