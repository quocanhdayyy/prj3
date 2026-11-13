import { prisma } from "../config/prisma";
import { Prisma, ContractStatus } from "../generated/prisma/client";

export type CreateContractInput = {
  playerId: number;
  clubId: number;
  startDate: Date;
  endDate: Date;
  salaryPerYear: Prisma.Decimal;
  releaseClause?: Prisma.Decimal | null;
  status: ContractStatus;
};
export type UpdateContractInput = Partial<CreateContractInput>;
export class ContractInputError extends Error {}

const checkDates = (start: Date, end: Date) => {
  if (end <= start) throw new ContractInputError("endDate phải sau startDate.");
};

export const getContracts = () =>
  prisma.contract.findMany({ orderBy: { id: "asc" } });
export const getContractById = (id: number) =>
  prisma.contract.findUnique({ where: { id } });
export const createContract = (data: CreateContractInput) => {
  checkDates(data.startDate, data.endDate);
  return prisma.contract.create({ data });
};
export const updateContract = (id: number, data: UpdateContractInput) =>
  prisma.$transaction(async tx => {
    const current = await tx.contract.findUniqueOrThrow({ where: { id } });
    checkDates(data.startDate ?? current.startDate, data.endDate ?? current.endDate);
    return tx.contract.update({ where: { id }, data });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
export const deleteContract = (id: number) =>
  prisma.contract.delete({ where: { id } });
