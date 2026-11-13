import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { prisma } from "../config/prisma";

const scryptAsync = promisify(scrypt);
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const sessionLifetime = 8 * 60 * 60 * 1000;
const publicFields = { id: true, username: true, email: true, role: true, createdAt: true } as const;
const verifyPassword = async (password: string, hash: string | undefined): Promise<boolean> => {
  const parts = hash?.split("$");
  const valid = parts?.length === 3 && parts[0] === "scrypt" && /^[a-f0-9]{32}$/.test(parts[1] ?? "") && /^[a-f0-9]{128}$/.test(parts[2] ?? "");
  // Spend the same password-derivation work for unknown accounts.
  const salt = valid ? parts![1]! : "0".repeat(32);
  const expected = valid ? Buffer.from(parts![2]!, "hex") : Buffer.alloc(64);
  const derived = await scryptAsync(password, salt, 64) as Buffer;
  return timingSafeEqual(derived, expected) && Boolean(valid);
};

export const login = async (email: string, password: string) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!await verifyPassword(password, user?.passwordHash) || !user) return null;
  const accessToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + sessionLifetime);
  await prisma.authSession.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  await prisma.authSession.create({ data: {
    tokenHash: sha256(accessToken), credentialHash: sha256(user.passwordHash), userId: user.id, expiresAt,
  } });
  const { passwordHash: _passwordHash, ...publicUser } = user;
  return { accessToken, tokenType: "Bearer", expiresAt, user: publicUser };
};

export const getAuthenticatedUser = async (token: string) => {
  const session = await prisma.authSession.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now() || session.credentialHash !== sha256(session.user.passwordHash)) {
    await prisma.authSession.deleteMany({ where: { tokenHash: session.tokenHash } });
    return null;
  }
  return prisma.user.findUnique({ where: { id: session.userId }, select: publicFields });
};
export const logout = (token: string) => prisma.authSession.deleteMany({ where: { tokenHash: sha256(token) } });
