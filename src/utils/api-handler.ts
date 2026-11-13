import type { Request, Response, NextFunction, RequestHandler } from "express";
import { Prisma } from "../generated/prisma/client";
import { InputError, readId } from "./api-validation";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const endpoint = (handler: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  async (req: Request, res: Response, next: NextFunction) => {
    try { await handler(req, res); }
    catch (error) {
      if (error instanceof ApiError || error instanceof InputError) {
        res.status(error instanceof ApiError ? error.status : 400).json({ status: "error", message: error.message }); return;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        const messages: Record<string, [number, string]> = {
          P2025: [404, "Không tìm thấy dữ liệu trong phạm vi được phép."],
          P2002: [409, "Dữ liệu bị trùng hoặc xung đột với bản ghi hiện có."],
          P2003: [409, "Tham chiếu không tồn tại, không đúng chủ sở hữu hoặc dữ liệu đang được sử dụng."],
          P2004: [409, "Thao tác vi phạm ràng buộc dữ liệu hoặc phiên bản cấu hình đã được sử dụng."],
          P2034: [409, "Dữ liệu đang thay đổi đồng thời. Hãy thử lại."],
        };
        const response = messages[error.code];
        if (response) { res.status(response[0]).json({ status: "error", message: response[1] }); return; }
      }
      next(error);
    }
  };
export const pageQuery = (req: Request) => {
  const page = req.query.page === undefined ? 1 : readId(req.query.page);
  const pageSize = req.query.pageSize === undefined ? 20 : readId(req.query.pageSize);
  if (pageSize > 100 || (page - 1) * pageSize > 2147483647) throw new InputError("page/pageSize ngoài phạm vi; pageSize tối đa 100.");
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
};
export const queryId = (req: Request, key: string): number | undefined =>
  req.query[key] === undefined ? undefined : readId(req.query[key]);
export const readDate = (value: unknown, field: string) => {
  if (typeof value !== "string" || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) || value.startsWith("0000")) throw new InputError(`${field} phải có định dạng YYYY-MM-DD.`);
  const date = new Date(value + "T00:00:00.000Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new InputError(`${field} không phải ngày hợp lệ.`);
  return date;
};
export const requireFound = <T>(value: T | null): T => {
  if (value === null) throw new ApiError(404, "Không tìm thấy dữ liệu trong phạm vi được phép.");
  return value;
};
export const ownerWhere = (userId?: number) => userId === undefined ? {} : { userId };
