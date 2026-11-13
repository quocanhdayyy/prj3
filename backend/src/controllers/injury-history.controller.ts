import type { Request, Response, NextFunction } from "express";
import { Prisma } from "../generated/prisma/client";
import {
  getInjuries, getInjuryById, createInjury, updateInjury, deleteInjury, InjuryInputError,
} from "../services/injury-history.service";
import type { CreateInjuryInput, UpdateInjuryInput } from "../services/injury-history.service";

const parseId = (value: unknown): number => {
  if (typeof value !== "string" || !/^[0-9]+$/.test(value)) throw new InjuryInputError("ID không hợp lệ.");
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) throw new InjuryInputError("ID không hợp lệ.");
  return id;
};
const parseDate = (value: unknown, field: string): Date => {
  if (typeof value !== "string" || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) || value.startsWith("0000")) {
    throw new InjuryInputError(`${field} phải có định dạng YYYY-MM-DD.`);
  }
  const date = new Date(value + "T00:00:00.000Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== value) {
    throw new InjuryInputError(`${field} không phải ngày hợp lệ.`);
  }
  return date;
};
const parseInput = (body: unknown, partial: boolean): UpdateInjuryInput => {
  if (!body || typeof body !== "object" || Array.isArray(body) || !Object.keys(body).length) {
    throw new InjuryInputError("Body phải là đối tượng JSON không rỗng.");
  }
  const input = body as Record<string, unknown>;
  const allowed = partial ? ["injuryType", "bodyRegion", "startDate", "endDate"] : ["playerId", "injuryType", "bodyRegion", "startDate", "endDate"];
  if (Object.keys(input).some(field => !allowed.includes(field))) {
    throw new InjuryInputError("Body chứa trường không được phép; playerId không thay đổi khi sửa.");
  }
  const data: UpdateInjuryInput = {};
  if (Object.hasOwn(input, "bodyRegion")) {
    if (input.bodyRegion === null) data.bodyRegion = null;
    else if (typeof input.bodyRegion === "string" && input.bodyRegion.trim() && input.bodyRegion.trim().length <= 50) data.bodyRegion = input.bodyRegion.trim().toUpperCase().replace(/\s+/g, "_");
    else throw new InjuryInputError("bodyRegion phải có 1–50 ký tự hoặc null.");
  }
  if (!partial || Object.hasOwn(input, "injuryType")) {
    const value = input.injuryType;
    if (typeof value !== "string" || !value.trim() || value.trim().length > 100) {
      throw new InjuryInputError("injuryType phải có từ 1 đến 100 ký tự.");
    }
    data.injuryType = value.trim();
  }
  if (!partial || Object.hasOwn(input, "startDate")) data.startDate = parseDate(input.startDate, "startDate");
  if (Object.hasOwn(input, "endDate")) data.endDate = input.endDate === null ? null : parseDate(input.endDate, "endDate");
  return data;
};
const handleError = (error: unknown, res: Response, next: NextFunction) => {
  if (error instanceof InjuryInputError) { res.status(400).json({ status: "error", message: error.message }); return; }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const errors: Record<string, [number,string]> = {
      P2003: [400, "Cầu thủ không tồn tại."],
      P2025: [404, "Không tìm thấy lịch sử chấn thương."],
      P2034: [409, "Dữ liệu đang được cập nhật đồng thời. Hãy thử lại."],
      P2004: [400, "Ngày chấn thương không hợp lệ."],
    };
    const result = errors[error.code];
    if (result) { res.status(result[0]).json({ status: "error", message: result[1] }); return; }
  }
  next(error);
};
export const listInjuries = async (_req: Request, res: Response, next: NextFunction) => {
  try { res.json({ status: "success", data: await getInjuries() }); }
  catch (error) { handleError(error, res, next); }
};
export const getInjuryDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const injury = await getInjuryById(parseId(req.params.id));
    if (!injury) { res.status(404).json({ status: "error", message: "Không tìm thấy lịch sử chấn thương." }); return; }
    res.json({ status: "success", data: injury });
  } catch (error) { handleError(error, res, next); }
};
export const addInjury = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = parseInput(req.body, false);
    const playerId: unknown = req.body.playerId;
    if (typeof playerId !== "number" || !Number.isInteger(playerId) || playerId < 1 || playerId > 2147483647) {
      throw new InjuryInputError("playerId phải là số nguyên dương hợp lệ.");
    }
    const data = { ...parsed, playerId } as CreateInjuryInput;
    res.status(201).json({ status: "success", data: await createInjury(data) });
  } catch (error) { handleError(error, res, next); }
};
export const editInjury = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseId(req.params.id);
    res.json({ status: "success", data: await updateInjury(id, parseInput(req.body, true)) });
  } catch (error) { handleError(error, res, next); }
};
export const removeInjury = async (req: Request, res: Response, next: NextFunction) => {
  try { await deleteInjury(parseId(req.params.id)); res.status(204).send(); }
  catch (error) { handleError(error, res, next); }
};
