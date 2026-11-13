import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { prisma } from "../config/prisma";
import type { UserRole } from "../generated/prisma/client";

const scryptAsync = promisify(scrypt);
const publicFields = { id: true, username: true, email: true, role: true, createdAt: true } as const;
export type CreateUserInput = { username: string; email: string; password: string; role?: UserRole };
export type UpdateUserInput = Partial<CreateUserInput>;

const hashPassword = async (password: string) => {
  const salt = randomBytes(16).toString("hex");
  const key = await scryptAsync(password, salt, 64) as Buffer;
  return `scrypt$${salt}$${key.toString("hex")}`;
};
export const getUsers = () => prisma.user.findMany({ select: publicFields, orderBy: { id: "asc" } });
export const getUserById = (id: number) => prisma.user.findUnique({ where: { id }, select: publicFields });
export const createUser = async ({ password, ...data }: CreateUserInput) =>
  prisma.user.create({ data: { ...data, passwordHash: await hashPassword(password) }, select: publicFields });
export const updateUser = async (id: number, { password, ...data }: UpdateUserInput) =>
  prisma.user.update({
    where: { id },
    data: { ...data, ...(password === undefined ? {} : { passwordHash: await hashPassword(password) }) },
    select: publicFields,
  });
export const deleteUser = (id: number) => prisma.user.delete({ where: { id }, select: publicFields });
