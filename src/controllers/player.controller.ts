import type { Request, Response, NextFunction } from "express";
import { Prisma } from "../generated/prisma/client";
import {
  getPlayers, getPlayerById, createPlayer, updatePlayer, deletePlayer,
} from "../services/player.service";
import type { CreatePlayerInput, UpdatePlayerInput } from "../services/player.service";
import { InputError } from "../utils/api-validation";
import { currentUser } from "../middleware/auth.middleware";

const parseId = (value: unknown): number => {
  if (typeof value !== "string" || !/^[0-9]+$/.test(value)) {
    throw new InputError("ID phải là số nguyên dương.");
  }
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) {
    throw new InputError("ID nằm ngoài phạm vi hợp lệ.");
  }
  return id;
};

const fields = [
  "name", "dateOfBirth", "nationality", "position",
  "marketValue", "height", "preferredFoot",
] as const;
const allowedFields = [...fields, "secondaryPositions"] as const;

const parseInput = (body: unknown, partial: boolean): UpdatePlayerInput => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new InputError("Body phải là một đối tượng JSON.");
  }
  const input = body as Record<string, unknown>;
  const keys = Object.keys(input);
  if (!keys.length || keys.some(key => !allowedFields.some(field => field === key))) {
    throw new InputError("Body rỗng hoặc chứa trường không được phép.");
  }
  if (!partial && fields.some(field => !Object.hasOwn(input, field))) {
    throw new InputError("Thiếu thông tin bắt buộc của cầu thủ.");
  }
  const data: UpdatePlayerInput = {};
  if (Object.hasOwn(input, "secondaryPositions")) {
    const value = input.secondaryPositions;
    if (!Array.isArray(value) || value.some(position => typeof position !== "string" || !/^[A-Z][A-Z0-9_]{0,49}$/.test(position.trim().toUpperCase()))) {
      throw new InputError("secondaryPositions phải là mảng mã vị trí, ví dụ [\"CM\", \"CDM\"].");
    }
    const positions = (value as string[]).map(position => position.trim().toUpperCase());
    if (new Set(positions).size !== positions.length) throw new InputError("Vị trí phụ không được trùng nhau.");
    data.secondaryPositions = positions;
  }
  for (const [field, max] of [
    ["name", 100], ["nationality", 100], ["position", 50],
  ] as const) {
    if (!Object.hasOwn(input, field)) continue;
    const value = input[field];
    if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
      throw new InputError(`${field} phải có từ 1 đến ${max} ký tự.`);
    }
    data[field] = value.trim();
  }
  if (Object.hasOwn(input, "preferredFoot")) {
    const value = input.preferredFoot;
    if (value !== null && (typeof value !== "string" || !["LEFT", "RIGHT", "BOTH"].includes(value))) {
      throw new InputError("preferredFoot phải là LEFT, RIGHT, BOTH hoặc null nếu chưa biết.");
    }
    data.preferredFoot = value;
  }
  if (Object.hasOwn(input, "height")) {
    const value = input.height;
    if (value !== null && (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 2147483647)) {
      throw new InputError("height phải là số nguyên dương (cm) hoặc null nếu chưa biết.");
    }
    data.height = value;
  }
  if (Object.hasOwn(input, "dateOfBirth")) {
    const value = input.dateOfBirth;
    if (typeof value !== "string" || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) || value.startsWith("0000")) {
      throw new InputError("dateOfBirth phải có định dạng YYYY-MM-DD.");
    }
    const date = new Date(value + "T00:00:00.000Z");
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || value > today) {
      throw new InputError("Ngày sinh không tồn tại hoặc nằm trong tương lai.");
    }
    data.dateOfBirth = date;
  }
  if (Object.hasOwn(input, "marketValue")) {
    const value = input.marketValue;
    if (value === null) data.marketValue = null;
    else {
      if (
        (typeof value !== "string" && typeof value !== "number") ||
        (typeof value === "number" && !Number.isFinite(value)) ||
        !/^[0-9]{1,13}(\.[0-9]{1,2})?$/.test(String(value))
      ) {
        throw new InputError("marketValue phải không âm, tối đa 13 chữ số nguyên và 2 chữ số thập phân, hoặc null nếu chưa biết.");
      }
      data.marketValue = new Prisma.Decimal(String(value));
    }
  }
  return data;
};

const handleError = (error: unknown, res: Response, next: NextFunction) => {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
    res.status(409).json({ status: "error", message: "Không thể xóa cầu thủ đang có dữ liệu liên quan." });
    return;
  }
  if (error instanceof InputError) {
    res.status(400).json({ status: "error", message: error.message });
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
    res.status(404).json({ status: "error", message: "Không tìm thấy cầu thủ." });
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2004", "P2034"].includes(error.code)) {
    res.status(409).json({ status: "error", message: "Dữ liệu vi phạm ràng buộc hoặc đang được sửa đồng thời. Hãy kiểm tra rồi thử lại." });
    return;
  }
  next(error);
};

export const listPlayers = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ status: "success", data: await getPlayers() });
  } catch (error) { handleError(error, res, next); }
};

export const getPlayerDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const player = await getPlayerById(parseId(req.params.id));
    if (!player) {
      res.status(404).json({ status: "error", message: "Không tìm thấy cầu thủ." });
      return;
    }
    res.json({ status: "success", data: player });
  } catch (error) { handleError(error, res, next); }
};

export const addPlayer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = parseInput(req.body, false) as CreatePlayerInput;
    res.status(201).json({ status: "success", data: await createPlayer(data, { actorId: currentUser(res).id, ipAddress: req.ip ?? null }) });
  } catch (error) { handleError(error, res, next); }
};

export const editPlayer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseId(req.params.id);
    const data = parseInput(req.body, true);
    res.json({ status: "success", data: await updatePlayer(id, data, { actorId: currentUser(res).id, ipAddress: req.ip ?? null }) });
  } catch (error) { handleError(error, res, next); }
};

export const removePlayer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await deletePlayer(parseId(req.params.id), { actorId: currentUser(res).id, ipAddress: req.ip ?? null });
    res.status(204).send();
  } catch (error) { handleError(error, res, next); }
};
