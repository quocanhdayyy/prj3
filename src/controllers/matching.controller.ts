import { matchingTemplate } from "../config/matching-rules";
import { currentUser, ownerScope } from "../middleware/auth.middleware";
import { endpoint } from "../utils/api-handler";
import { InputError, readInteger, readObject, readText } from "../utils/api-validation";
import { evaluateMatching, rankMatching, searchMatching } from "../services/matching/matching-engine.service";
import type { EvaluationInput } from "../services/matching/matching-engine.service";

const parseCommon = (input: Record<string, unknown>): Omit<EvaluationInput, "playerId" | "save"> => {
  const season = readText(input.season, "season", 20);
  if (!/^\d{4}\/\d{4}$/.test(season) || Number(season.slice(5)) !== Number(season.slice(0, 4)) + 1) throw new InputError("season phải dạng YYYY/YYYY liên tiếp, ví dụ 2025/2026.");
  if (input.formRole !== "PRIMARY" && input.formRole !== "REQUIRED") throw new InputError("Chọn formRole PRIMARY (vai trò chính cầu thủ) hoặc REQUIRED (vai trò CLB cần).");
  return { requirementId: readInteger(input.requirementId, "requirementId", 1), season, formRole: input.formRole,
    ...(input.configId === undefined ? {} : { configId: readInteger(input.configId, "configId", 1) }),
    ...(input.valuationSource === undefined ? {} : { valuationSource: readText(input.valuationSource, "valuationSource", 255) }),
  };
};
export const template = endpoint(async (_req, res) => { res.json({ status: "success", data: matchingTemplate() }); });
export const evaluate = endpoint(async (req, res) => {
  const input = readObject(req.body, ["playerId", "requirementId", "season", "formRole", "save", "configId", "valuationSource"]);
  if (input.save !== undefined && typeof input.save !== "boolean") throw new InputError("save phải là boolean.");
  res.set("Cache-Control", "no-store");
  res.json({ status: "success", data: await evaluateMatching({ ...parseCommon(input), playerId: readInteger(input.playerId, "playerId", 1), save: input.save === true }, ownerScope(res), { actorId: currentUser(res).id, ipAddress: req.ip ?? null }) });
});
export const rank = endpoint(async (req, res) => {
  const input = readObject(req.body, ["playerIds", "requirementId", "season", "formRole", "configId", "valuationSource"]);
  if (!Array.isArray(input.playerIds) || !input.playerIds.length || input.playerIds.length > 100) throw new InputError("playerIds phải có từ 1 đến 100 ID.");
  const playerIds = input.playerIds.map(value => readInteger(value, "playerIds", 1));
  if (new Set(playerIds).size !== playerIds.length) throw new InputError("playerIds không được trùng nhau.");
  res.set("Cache-Control", "no-store");
  res.json({ status: "success", data: await rankMatching({ ...parseCommon(input), playerIds }, ownerScope(res), { actorId: currentUser(res).id, ipAddress: req.ip ?? null }) });
});


export const search = endpoint(async (req, res) => {
  const input = readObject(req.body, ["requirementId", "season", "formRole", "configId", "valuationSource", "page", "pageSize"]);
  const page = input.page === undefined ? 1 : readInteger(input.page, "page", 1);
  const pageSize = input.pageSize === undefined ? 20 : readInteger(input.pageSize, "pageSize", 1);
  if (pageSize > 100) throw new InputError("pageSize tối đa 100.");
  res.set("Cache-Control", "no-store");
  res.json({ status: "success", data: await searchMatching({ ...parseCommon(input), page, pageSize }, ownerScope(res), {
    actorId: currentUser(res).id, ipAddress: req.ip ?? null,
  }) });
});
