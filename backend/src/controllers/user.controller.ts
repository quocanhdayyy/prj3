import type { Request, Response, NextFunction } from "express";
import { Prisma, UserRole } from "../generated/prisma/client";
import { getUsers, getUserById, createUser, updateUser, deleteUser } from "../services/user.service";
import type { CreateUserInput, UpdateUserInput } from "../services/user.service";

class UserInputError extends Error {}
const parseId = (value: unknown) => {
  if (typeof value !== "string" || !/^[0-9]+$/.test(value)) throw new UserInputError("ID không hợp lệ.");
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) throw new UserInputError("ID không hợp lệ.");
  return id;
};
const parseInput = (body: unknown, partial: boolean): UpdateUserInput => {
  if (!body || typeof body !== "object" || Array.isArray(body) || !Object.keys(body).length) {
    throw new UserInputError("Body phải là đối tượng JSON không rỗng.");
  }
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some(field => !["username", "email", "password", "role"].includes(field))) {
    throw new UserInputError("Body chứa trường không được phép.");
  }
  const data: UpdateUserInput = {};
  if (!partial || Object.hasOwn(input, "username")) {
    const value = input.username;
    if (typeof value !== "string" || !/^[a-zA-Z0-9_]{3,50}$/.test(value.trim())) {
      throw new UserInputError("username phải có 3–50 ký tự: chữ không dấu, số hoặc dấu gạch dưới.");
    }
    data.username = value.trim().toLowerCase();
  }
  if (!partial || Object.hasOwn(input, "email")) {
    const value = input.email;
    if (typeof value !== "string" || value.trim().length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
      throw new UserInputError("Email không hợp lệ hoặc vượt 100 ký tự.");
    }
    data.email = value.trim().toLowerCase();
  }
  if (!partial || Object.hasOwn(input, "password")) {
    const value = input.password;
    if (typeof value !== "string" || value.length < 8 || value.length > 128 || !value.trim()) {
      throw new UserInputError("Mật khẩu phải có 8–128 ký tự.");
    }
    data.password = value;
  }
  if (Object.hasOwn(input, "role")) {
    if (input.role !== UserRole.SCOUT && input.role !== UserRole.ADMIN) {
      throw new UserInputError("role phải là SCOUT hoặc ADMIN.");
    }
    data.role = input.role;
  }
  return data;
};
const handleError = (error: unknown, res: Response, next: NextFunction) => {
  if (error instanceof UserInputError) { res.status(400).json({ status: "error", message: error.message }); return; }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const errors: Record<string, [number,string]> = {
      P2002: [409, "Username hoặc email đã tồn tại."],
      P2025: [404, "Không tìm thấy người dùng."],
      P2003: [409, "Không thể xóa người dùng đang có dữ liệu liên quan."],
    };
    const result = errors[error.code];
    if (result) { res.status(result[0]).json({ status: "error", message: result[1] }); return; }
  }
  next(error);
};
export const listUsers = async (_req: Request, res: Response, next: NextFunction) => {
  try { res.json({ status: "success", data: await getUsers() }); }
  catch (error) { handleError(error, res, next); }
};
export const getUserDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await getUserById(parseId(req.params.id));
    if (!user) { res.status(404).json({ status: "error", message: "Không tìm thấy người dùng." }); return; }
    res.json({ status: "success", data: user });
  } catch (error) { handleError(error, res, next); }
};
export const addUser = async (req: Request, res: Response, next: NextFunction) => {
  try { res.status(201).json({ status: "success", data: await createUser(parseInput(req.body, false) as CreateUserInput) }); }
  catch (error) { handleError(error, res, next); }
};
export const editUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseId(req.params.id);
    res.json({ status: "success", data: await updateUser(id, parseInput(req.body, true)) });
  } catch (error) { handleError(error, res, next); }
};
export const removeUser = async (req: Request, res: Response, next: NextFunction) => {
  try { await deleteUser(parseId(req.params.id)); res.status(204).send(); }
  catch (error) { handleError(error, res, next); }
};
