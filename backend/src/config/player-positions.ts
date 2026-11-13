import { InputError } from "../utils/api-validation";

export const playerPositions = ["ST", "LW", "RW", "CDM", "CAM", "CM", "CB", "RB", "LB", "GK"];
// Broad project roles, not claims that these tactical roles are identical in real football.
export const positionAliases: Record<string, string> = {
  CF: "ST", SS: "ST", RWB: "RB", LWB: "LB", RCM: "CM", LCM: "CM", LM: "LW", RM: "RW",
};
export const normalizePositionCode = (value: string) => {
  const code = value.trim().toUpperCase();
  return positionAliases[code] ?? code;
};
export const readPosition = (value: unknown, field = "position") => {
  if (typeof value !== "string") throw new InputError(`${field} phải là mã vị trí.`);
  const position = normalizePositionCode(value);
  if (!playerPositions.includes(position)) throw new InputError(`${field} phải thuộc: ${playerPositions.join(", ")}.`);
  return position;
};
