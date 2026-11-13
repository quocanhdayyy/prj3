import type { Request, Response, NextFunction } from "express";
import { getAuthenticatedUser } from "../services/auth.service";
import type { UserRole } from "../generated/prisma/client";

export type AuthenticatedUser = {
  id: number; username: string; email: string; role: UserRole; createdAt: Date;
};

export const currentUser = (res: Response): AuthenticatedUser => {
  const user = res.locals.user as AuthenticatedUser | undefined;
  if (!user) throw new Error("requireAuth must run before this controller.");
  return user;
};

export const ownerScope = (res: Response): number | undefined => {
  const user = currentUser(res);
  return user.role === "ADMIN" ? undefined : user.id;
};

export const requireAdmin = (_req: Request, res: Response, next: NextFunction) => {
  if (!res.locals.user) {
    res.status(401).json({ status: "error", message: "Cần đăng nhập." }); return;
  }
  if (currentUser(res).role !== "ADMIN") {
    res.status(403).json({ status: "error", message: "Chức năng này chỉ dành cho Admin." }); return;
  }
  next();
};

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const header = req.get("Authorization");
    const match = header?.match(/^Bearer ([a-f0-9]{64})$/i);
    if (!match?.[1]) {
      res.status(401).json({ status: "error", message: "Cần token đăng nhập hợp lệ." }); return;
    }
    const token = match[1];
    const user = await getAuthenticatedUser(token);
    if (!user) {
      res.status(401).json({ status: "error", message: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn." }); return;
    }
    res.locals.user = user;
    res.locals.accessToken = token;
    next();
  } catch (error) { next(error); }
};

// A bounded, per-process limit for the local backend. Never record credentials.
const attempts = new Map<string, { count: number; expiresAt: number }>();
export const limitLoginAttempts = (req: Request, res: Response, next: NextFunction) => {
  const now = Date.now();
  for (const [key, value] of attempts) if (value.expiresAt <= now) attempts.delete(key);
  const key = req.ip ?? "unknown";
  const entry = attempts.get(key) ?? { count: 0, expiresAt: now + 15 * 60 * 1000 };
  if (entry.count >= 20 || (!attempts.has(key) && attempts.size >= 10000)) {
    res.set("Retry-After", String(Math.max(1, Math.ceil((entry.expiresAt - now) / 1000))));
    res.status(429).json({ status: "error", message: "Quá nhiều lần đăng nhập. Hãy thử lại sau." }); return;
  }
  entry.count += 1; attempts.set(key, entry); next();
};
