import { prisma } from "../config/prisma";
import { Prisma } from "../generated/prisma/client";
import { InputError } from "../utils/api-validation";
import { writeAudit } from "./audit-log.service";
import type { AuditContext } from "./audit-log.service";
import { readPosition } from "../config/player-positions";

export type CreatePlayerInput = Pick<Prisma.PlayerCreateInput,
  "name" | "dateOfBirth" | "nationality" | "position" | "marketValue" | "height" | "preferredFoot"
> & { secondaryPositions?: string[] };
export type UpdatePlayerInput = Partial<CreatePlayerInput>;

const validatePositions = (primary: string, secondary: string[]) => {
  if (new Set(secondary).size !== secondary.length) {
    throw new InputError("Vị trí phụ bị trùng sau quy đổi về mã chuẩn.");
  }
  if (secondary.some(position => position === primary.trim().toUpperCase())) {
    throw new InputError("Vị trí phụ không được trùng vị trí chính. Hãy gửi lại cả hai khi đổi vai trò.");
  }
};

export const getPlayers = () =>
  prisma.player.findMany({ orderBy: { id: "asc" } });

export const getPlayerById = (id: number) =>
  prisma.player.findUnique({ where: { id } });

export const createPlayer = (data: CreatePlayerInput, context?: AuditContext) => prisma.$transaction(async tx => {
  const position = readPosition(data.position);
  const secondaryPositions = (data.secondaryPositions ?? []).map(value => readPosition(value, "secondaryPositions"));
  validatePositions(position, secondaryPositions);
  const player = await tx.player.create({ data: { ...data, position, secondaryPositions } });
  if (context) await writeAudit(tx, context, "Player", player.id, "CREATE", undefined, player);
  return player;
});

export const updatePlayer = (id: number, data: UpdatePlayerInput, context?: AuditContext) => prisma.$transaction(async tx => {
  const old = await tx.player.findUniqueOrThrow({ where: { id } });
  const position = readPosition(data.position ?? old.position);
  const secondaryPositions = (data.secondaryPositions ?? old.secondaryPositions).map(value => readPosition(value, "secondaryPositions"));
  validatePositions(position, secondaryPositions);
  const player = await tx.player.update({ where: { id }, data: { ...data, position, secondaryPositions } });
  if (context) await writeAudit(tx, context, "Player", id, "UPDATE", old, player);
  return player;
}, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

export const deletePlayer = (id: number, context?: AuditContext) => prisma.$transaction(async tx => {
  const old = await tx.player.delete({ where: { id } });
  if (context) await writeAudit(tx, context, "Player", id, "DELETE", old);
  return old;
});
