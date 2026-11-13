import type { Request, Response, NextFunction } from "express";
import { Prisma } from "../generated/prisma/client";
import {
  getPlayerStats, getPlayerStatsById, createPlayerStats,
  updatePlayerStats, deletePlayerStats, StatsInputError,
} from "../services/player-stats.service";
import type { CreatePlayerStatsInput, UpdatePlayerStatsInput } from "../services/player-stats.service";

const required = ["appearances", "minutesPlayed", "goals", "assists", "yellowCards", "redCards"] as const;
const optional = ["tacklesWon", "interceptions", "keyPasses", "passesCompleted", "passesAttempted"] as const;
const parseCount = (value: unknown, field: string): number => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 2147483647) {
    throw new StatsInputError(`${field} phải là số nguyên không âm hợp lệ.`);
  }
  return value;
};
const parseId = (value: unknown): number => {
  if (typeof value !== "string" || !/^[0-9]+$/.test(value)) throw new StatsInputError("ID không hợp lệ.");
  const id = parseCount(Number(value), "ID");
  if (id === 0) throw new StatsInputError("ID phải lớn hơn 0.");
  return id;
};
const parseBody = (body: unknown): Record<string, unknown> => {
  if (!body || typeof body !== "object" || Array.isArray(body) || !Object.keys(body).length) {
    throw new StatsInputError("Body phải là một đối tượng JSON không rỗng.");
  }
  return body as Record<string, unknown>;
};
const parseCounts = (input: Record<string, unknown>, partial: boolean): UpdatePlayerStatsInput => {
  const data: UpdatePlayerStatsInput = {};
  for (const field of required) {
    if (!partial || Object.hasOwn(input, field)) data[field] = parseCount(input[field], field);
  }
  for (const field of optional) {
    if (!partial || Object.hasOwn(input, field)) {
      data[field] = input[field] == null ? null : parseCount(input[field], field);
    }
  }
  if (Object.hasOwn(input, "positionMinutes")) {
    if (input.positionMinutes === null) data.positionMinutes = Prisma.DbNull;
    else if (typeof input.positionMinutes === "object" && input.positionMinutes && !Array.isArray(input.positionMinutes)) data.positionMinutes = input.positionMinutes as Prisma.InputJsonObject;
    else throw new StatsInputError("positionMinutes phải là object hoặc null.");
  }
  if (Object.hasOwn(input, "positionMinutesSource")) {
    if (input.positionMinutesSource === null) data.positionMinutesSource = null;
    else if (typeof input.positionMinutesSource === "string" && input.positionMinutesSource.trim() && input.positionMinutesSource.trim().length <= 255) data.positionMinutesSource = input.positionMinutesSource.trim();
    else throw new StatsInputError("positionMinutesSource phải có 1–255 ký tự hoặc null.");
  }
  return data;
};
const checkFields = (input: Record<string, unknown>, partial: boolean) => {
  const extra = ["positionMinutes", "positionMinutesSource"];
  const allowed: readonly string[] = partial ? [...required, ...optional, ...extra] : ["playerId", "season", ...required, ...optional, ...extra];
  if (Object.keys(input).some(field => !allowed.includes(field))) {
    throw new StatsInputError(partial ? "Chỉ gửi các chỉ số cần sửa; playerId và season giữ nguyên." : "Body chứa trường không được phép.");
  }
};
const handleError = (error: unknown, res: Response, next: NextFunction) => {
  if (error instanceof StatsInputError) {
    res.status(400).json({ status: "error", message: error.message }); return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const errors: Record<string, [number, string]> = {
      P2002: [409, "Cầu thủ đã có thống kê cho mùa này."],
      P2003: [400, "Cầu thủ không tồn tại."],
      P2025: [404, "Không tìm thấy thống kê."],
      P2034: [409, "Thống kê đang được sửa đồng thời. Hãy thử lại."],
    };
    const result = errors[error.code];
    if (result) { res.status(result[0]).json({ status: "error", message: result[1] }); return; }
  }
  next(error);
};
export const listPlayerStats = async (_req: Request, res: Response, next: NextFunction) => {
  try { res.json({ status: "success", data: await getPlayerStats() }); }
  catch (error) { handleError(error, res, next); }
};
export const getPlayerStatsDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await getPlayerStatsById(parseId(req.params.id));
    if (!stats) { res.status(404).json({ status: "error", message: "Không tìm thấy thống kê." }); return; }
    res.json({ status: "success", data: stats });
  } catch (error) { handleError(error, res, next); }
};
export const addPlayerStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = parseBody(req.body); checkFields(input, false);
    const playerId = parseCount(input.playerId, "playerId");
    if (playerId === 0) throw new StatsInputError("playerId phải lớn hơn 0.");
    const season = input.season;
    if (typeof season !== "string" || !/^[0-9]{4}\/[0-9]{4}$/.test(season) || Number(season.slice(0,4)) < 1 || Number(season.slice(5)) !== Number(season.slice(0,4)) + 1) {
      throw new StatsInputError("season phải có dạng YYYY/YYYY với hai năm liên tiếp.");
    }
    const data = { ...parseCounts(input, false), playerId, season } as CreatePlayerStatsInput;
    res.status(201).json({ status: "success", data: await createPlayerStats(data) });
  } catch (error) { handleError(error, res, next); }
};
export const editPlayerStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseId(req.params.id);
    const input = parseBody(req.body); checkFields(input, true);
    res.json({ status: "success", data: await updatePlayerStats(id, parseCounts(input, true)) });
  } catch (error) { handleError(error, res, next); }
};
export const removePlayerStats = async (req: Request, res: Response, next: NextFunction) => {
  try { await deletePlayerStats(parseId(req.params.id)); res.status(204).send(); }
  catch (error) { handleError(error, res, next); }
};
