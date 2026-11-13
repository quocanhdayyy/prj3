import type { Request, Response, NextFunction } from "express";
import { login, logout } from "../services/auth.service";

export const loginUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.set("Cache-Control", "no-store");
    const body: unknown = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      res.status(400).json({ status: "error", message: "Gửi email và password trong body JSON." }); return;
    }
    const input = body as Record<string, unknown>;
    if (Object.keys(input).some(key => !["email", "password"].includes(key)) ||
      typeof input.email !== "string" || input.email.trim().length > 100 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim()) ||
      typeof input.password !== "string" || !input.password.length || input.password.length > 128) {
      res.status(400).json({ status: "error", message: "Email hoặc định dạng mật khẩu không hợp lệ." }); return;
    }
    const session = await login(input.email.trim().toLowerCase(), input.password);
    if (!session) {
      res.status(401).json({ status: "error", message: "Email hoặc mật khẩu không đúng." }); return;
    }
    res.json({ status: "success", data: session });
  } catch (error) { next(error); }
};
export const getCurrentUser = (_req: Request, res: Response) => {
  res.set("Cache-Control", "no-store");
  res.json({ status: "success", data: res.locals.user });
};
export const logoutUser = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    await logout(res.locals.accessToken as string);
    res.set("Cache-Control", "no-store");
    res.status(204).send();
  } catch (error) { next(error); }
};
