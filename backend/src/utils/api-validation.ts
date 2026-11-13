import type { Response, NextFunction } from "express";
import { Prisma } from "../generated/prisma/client";

export class InputError extends Error {}
export const readObject = (body: unknown, allowed: readonly string[]) => {
  if (!body || typeof body !== "object" || Array.isArray(body) || !Object.keys(body).length) {
    throw new InputError("Body phải là một đối tượng JSON không rỗng.");
  }
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some(field => !allowed.includes(field))) throw new InputError("Body chứa trường không được phép.");
  return input;
};
export const readInteger = (value: unknown, field: string, min = 0): number => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > 2147483647) {
    throw new InputError(`${field} phải là số nguyên hợp lệ, tối thiểu ${min}.`);
  }
  return value;
};
export const readId = (value: unknown): number => {
  if (typeof value !== "string" || !/^[0-9]+$/.test(value)) throw new InputError("ID không hợp lệ.");
  return readInteger(Number(value), "ID", 1);
};
export const readText = (value: unknown, field: string, max: number): string => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new InputError(`${field} phải có từ 1 đến ${max} ký tự.`);
  }
  return value.trim();
};
export const readMoney = (value: unknown, field: string): Prisma.Decimal => {
  if ((typeof value !== "number" && typeof value !== "string") || !/^[0-9]{1,13}(\.[0-9]{1,2})?$/.test(String(value))) {
    throw new InputError(`${field} phải không âm, tối đa 13 chữ số nguyên và 2 chữ số thập phân.`);
  }
  return new Prisma.Decimal(String(value));
};
export const handleCrudError = (
  error: unknown, res: Response, next: NextFunction,
  messages: { missing: string; reference: string; duplicate: string },
) => {
  if (error instanceof InputError) { res.status(400).json({ status: "error", message: error.message }); return; }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const errors: Record<string, [number, string]> = {
      P2025: [404, messages.missing], P2003: [409, messages.reference],
      P2002: [409, messages.duplicate], P2034: [409, "Dữ liệu đang được sửa đồng thời. Hãy thử lại."],
      P2004: [400, "Dữ liệu vi phạm ràng buộc database."],
    };
    const result = errors[error.code];
    if (result) { res.status(result[0]).json({ status: "error", message: result[1] }); return; }
  }
  next(error);
};
