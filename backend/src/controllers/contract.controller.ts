import type { Request, Response, NextFunction } from "express";
import { Prisma, ContractStatus } from "../generated/prisma/client";
import {
  getContracts, getContractById, createContract, updateContract, deleteContract,
  ContractInputError,
} from "../services/contract.service";
import type { CreateContractInput, UpdateContractInput } from "../services/contract.service";

const parseId = (value: unknown, field = "ID"): number => {
  const number = typeof value === "string" && /^[0-9]+$/.test(value) ? Number(value) : value;
  if (typeof number !== "number" || !Number.isInteger(number) || number < 1 || number > 2147483647) {
    throw new ContractInputError(`${field} phải là số nguyên dương hợp lệ.`);
  }
  return number;
};
const parseDate = (value: unknown, field: string): Date => {
  if (typeof value !== "string" || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) || value.startsWith("0000")) {
    throw new ContractInputError(`${field} phải có định dạng YYYY-MM-DD.`);
  }
  const date = new Date(value + "T00:00:00.000Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new ContractInputError(`${field} không phải ngày hợp lệ.`);
  }
  return date;
};
const parseMoney = (value: unknown, field: string): Prisma.Decimal => {
  if ((typeof value !== "number" && typeof value !== "string") || !/^[0-9]{1,13}(\.[0-9]{1,2})?$/.test(String(value))) {
    throw new ContractInputError(`${field} phải không âm, tối đa 13 chữ số nguyên và 2 chữ số thập phân.`);
  }
  return new Prisma.Decimal(String(value));
};
const parseInput = (body: unknown, partial: boolean): UpdateContractInput => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ContractInputError("Body phải là một đối tượng JSON.");
  }
  const input = body as Record<string, unknown>;
  const required = ["playerId", "clubId", "startDate", "endDate", "salaryPerYear", "status"];
  const allowed = [...required, "releaseClause"];
  const fields = Object.keys(input);
  if (!fields.length || fields.some(field => !allowed.includes(field))) {
    throw new ContractInputError("Body rỗng hoặc chứa trường không được phép.");
  }
  if (!partial && required.some(field => !Object.hasOwn(input, field))) {
    throw new ContractInputError("Thiếu thông tin bắt buộc của hợp đồng.");
  }
  const data: UpdateContractInput = {};
  for (const field of ["playerId", "clubId"] as const) {
    if (Object.hasOwn(input, field)) data[field] = parseId(input[field], field);
  }
  for (const field of ["startDate", "endDate"] as const) {
    if (Object.hasOwn(input, field)) data[field] = parseDate(input[field], field);
  }
  if (Object.hasOwn(input, "salaryPerYear")) data.salaryPerYear = parseMoney(input.salaryPerYear, "salaryPerYear");
  if (Object.hasOwn(input, "releaseClause")) {
    data.releaseClause = input.releaseClause === null ? null : parseMoney(input.releaseClause, "releaseClause");
  }
  if (Object.hasOwn(input, "status")) {
    const status = input.status;
    if (typeof status !== "string" || !Object.values(ContractStatus).some(value => value === status)) {
      throw new ContractInputError("status phải là ACTIVE, EXPIRED hoặc TERMINATED.");
    }
    data.status = status as ContractStatus;
  }
  return data;
};
const handleError = (error: unknown, res: Response, next: NextFunction) => {
  if (error instanceof ContractInputError) {
    res.status(400).json({ status: "error", message: error.message });
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const errors: Record<string, [number, string]> = {
      P2025: [404, "Không tìm thấy hợp đồng."],
      P2003: [400, "Cầu thủ hoặc CLB được tham chiếu không tồn tại."],
      P2002: [409, "Cầu thủ đã có một hợp đồng ACTIVE."],
      P2034: [409, "Hợp đồng đang được cập nhật đồng thời. Hãy thử lại."],
      P2004: [400, "Hợp đồng vi phạm ràng buộc dữ liệu."],
    };
    const result = errors[error.code];
    if (result) {
      res.status(result[0]).json({ status: "error", message: result[1] });
      return;
    }
  }
  next(error);
};
export const listContracts = async (_req: Request, res: Response, next: NextFunction) => {
  try { res.json({ status: "success", data: await getContracts() }); }
  catch (error) { handleError(error, res, next); }
};
export const getContractDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const contract = await getContractById(parseId(req.params.id));
    if (!contract) {
      res.status(404).json({ status: "error", message: "Không tìm thấy hợp đồng." });
      return;
    }
    res.json({ status: "success", data: contract });
  } catch (error) { handleError(error, res, next); }
};
export const addContract = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = parseInput(req.body, false) as CreateContractInput;
    res.status(201).json({ status: "success", data: await createContract(data) });
  } catch (error) { handleError(error, res, next); }
};
export const editContract = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseId(req.params.id);
    const data = parseInput(req.body, true);
    res.json({ status: "success", data: await updateContract(id, data) });
  } catch (error) { handleError(error, res, next); }
};
export const removeContract = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await deleteContract(parseId(req.params.id));
    res.status(204).send();
  } catch (error) { handleError(error, res, next); }
};
