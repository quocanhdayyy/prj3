import { prisma } from "../../config/prisma";
import { Prisma } from "../../generated/prisma/client";
import { ApiError } from "../../utils/api-handler";
import { writeAudit } from "../audit-log.service";
import type { AuditContext } from "../audit-log.service";
import { validateMatchingConfig } from "./matching-config";
import { validateV3Config, ENGINE_VERSION, SCORING_AVAILABLE } from "./v3/config";
import type { ScoringConfig } from "../../generated/prisma/client";
const validateVersioned = (item: ScoringConfig) => {
  const p = item.parameters;
  if (p && typeof p === "object" && !Array.isArray(p) && Object.hasOwn(p, "engineVersion")) {
    if (p.engineVersion === ENGINE_VERSION) validateV3Config(item); else validateMatchingConfig(item);
  }
};

export type ConfigInput = {
  name: string; version: number; financialWeight: Prisma.Decimal; squadWeight: Prisma.Decimal; riskWeight: Prisma.Decimal;
  criteriaWeights: Prisma.InputJsonObject; parameters: Prisma.InputJsonObject;
};
export const listConfigs = (skip: number, take: number) => prisma.$transaction([
  prisma.scoringConfig.findMany({ skip, take, orderBy: { id: "desc" } }), prisma.scoringConfig.count(),
]);
export const findConfig = (id: number) => prisma.scoringConfig.findUnique({ where: { id } });
export const activeConfig = () => prisma.scoringConfig.findFirst({ where: { isActive: true } });
export const createConfig = (data: ConfigInput, context: AuditContext) => prisma.$transaction(async tx => {
  const item = await tx.scoringConfig.create({ data });
  validateVersioned(item);
  await writeAudit(tx, context, "ScoringConfig", item.id, "CREATE", undefined, item); return item;
});
export const updateConfig = (id: number, data: Partial<ConfigInput>, context: AuditContext) => prisma.$transaction(async tx => {
  const old = await tx.scoringConfig.findUniqueOrThrow({ where: { id } });
  if (await tx.matchResult.count({ where: { configId: id } })) throw new ApiError(409, "Phiên bản đã có kết quả. Hãy tạo phiên bản cấu hình mới.");
  const weights = { ...old, ...data };
  if (!weights.financialWeight.add(weights.squadWeight).add(weights.riskWeight).equals(1)) throw new ApiError(400, "Tổng trọng số ba trụ cột phải bằng 1.");
  const item = await tx.scoringConfig.update({ where: { id }, data });
  validateVersioned(item);
  await writeAudit(tx, context, "ScoringConfig", id, "UPDATE", old, item); return item;
}, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
export const activateConfig = (id: number, context: AuditContext) => prisma.$transaction(async tx => {
  const target = await tx.scoringConfig.findUniqueOrThrow({ where: { id } });
  validateVersioned(target);
  const parameters = target.parameters;
  if (!SCORING_AVAILABLE && parameters && typeof parameters === "object" && !Array.isArray(parameters) && parameters.engineVersion === ENGINE_VERSION) {
    throw new ApiError(409, "V3 hiện mới hoàn thành cấu hình và dữ liệu đầu vào; chưa được kích hoạt chấm điểm.");
  }
  const previous = await tx.scoringConfig.findMany({ where: { isActive: true, id: { not: id } } });
  await tx.scoringConfig.updateMany({ where: { isActive: true, id: { not: id } }, data: { isActive: false } });
  for (const old of previous) await writeAudit(tx, context, "ScoringConfig", old.id, "UPDATE", old, { ...old, isActive: false });
  const item = await tx.scoringConfig.update({ where: { id }, data: { isActive: true } });
  if (!target.isActive) await writeAudit(tx, context, "ScoringConfig", id, "UPDATE", target, item);
  return item;
}, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
export const deleteConfig = (id: number, context: AuditContext) => prisma.$transaction(async tx => {
  const old = await tx.scoringConfig.findUniqueOrThrow({ where: { id } });
  if (old.isActive) throw new ApiError(409, "Không được xóa cấu hình đang hoạt động.");
  if (await tx.matchResult.count({ where: { configId: id } })) throw new ApiError(409, "Không được xóa cấu hình đã có kết quả.");
  await tx.scoringConfig.delete({ where: { id } }); await writeAudit(tx, context, "ScoringConfig", id, "DELETE", old);
}, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
