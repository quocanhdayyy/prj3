import { endpoint, pageQuery, requireFound } from "../utils/api-handler";
import { readObject, readId, readInteger, readText, InputError } from "../utils/api-validation";
import { currentUser } from "../middleware/auth.middleware";
import { Prisma } from "../generated/prisma/client";
import * as service from "../services/matching/scoring-config.service";

const readWeight = (value: unknown): Prisma.Decimal => {
  if ((typeof value !== "number" && typeof value !== "string") || !/^(0(\.[0-9]{1,4})?|1(\.0{1,4})?)$/.test(String(value))) throw new InputError("Trọng số phải từ 0 đến 1, tối đa 4 chữ số thập phân.");
  return new Prisma.Decimal(String(value));
};
const readJsonObject = (value: unknown, field: string): Prisma.InputJsonObject => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InputError(`${field} phải là JSON object.`);
  return value as Prisma.InputJsonObject;
};
const readCriteria = (value: unknown): Prisma.InputJsonObject => {
  const object = readObject(value, ["financial", "squad", "risk"]);
  for (const pillar of ["financial", "squad", "risk"]) {
    const group = object[pillar];
    if (!group || typeof group !== "object" || Array.isArray(group) || !Object.keys(group).length) throw new InputError(`criteriaWeights.${pillar} phải là object trọng số không rỗng.`);
    let total = new Prisma.Decimal(0);
    for (const weight of Object.values(group)) {
      if (typeof weight !== "number") throw new InputError("Trọng số tiêu chí con phải là số.");
      total = total.add(readWeight(weight));
    }
    if (!total.equals(1)) throw new InputError(`Tổng trọng số criteriaWeights.${pillar} phải bằng 1.`);
  }
  return object as Prisma.InputJsonObject;
};
const parse = (body: unknown, partial: boolean): Partial<service.ConfigInput> => {
  const input = readObject(body, ["name", "version", "financialWeight", "squadWeight", "riskWeight", "criteriaWeights", "parameters"]);
  const data: Partial<service.ConfigInput> = {};
  if (!partial || Object.hasOwn(input, "name")) data.name = readText(input.name, "name", 100);
  if (!partial || Object.hasOwn(input, "version")) data.version = readInteger(input.version, "version", 1);
  for (const field of ["financialWeight", "squadWeight", "riskWeight"] as const) if (!partial || Object.hasOwn(input, field)) data[field] = readWeight(input[field]);
  if (!partial && !data.financialWeight!.add(data.squadWeight!).add(data.riskWeight!).equals(1)) throw new InputError("Tổng trọng số ba trụ cột phải bằng 1.");
  if (!partial || Object.hasOwn(input, "criteriaWeights")) data.criteriaWeights = readCriteria(input.criteriaWeights);
  if (!partial || Object.hasOwn(input, "parameters")) data.parameters = readJsonObject(input.parameters, "parameters");
  return data;
};
export const list = endpoint(async (req, res) => {
  const page = pageQuery(req); const [data, total] = await service.listConfigs(page.skip, page.take);
  res.json({ status: "success", data, meta: { page: page.page, pageSize: page.pageSize, total } });
});
export const active = endpoint(async (_req, res) => { res.json({ status: "success", data: requireFound(await service.activeConfig()) }); });
export const detail = endpoint(async (req, res) => { res.json({ status: "success", data: requireFound(await service.findConfig(readId(req.params.id))) }); });
export const create = endpoint(async (req, res) => {
  res.status(201).json({ status: "success", data: await service.createConfig(parse(req.body, false) as service.ConfigInput, { actorId: currentUser(res).id, ipAddress: req.ip ?? null }) });
});
export const update = endpoint(async (req, res) => {
  res.json({ status: "success", data: await service.updateConfig(readId(req.params.id), parse(req.body, true), { actorId: currentUser(res).id, ipAddress: req.ip ?? null }) });
});
export const activate = endpoint(async (req, res) => { res.json({ status: "success", data: await service.activateConfig(readId(req.params.id), { actorId: currentUser(res).id, ipAddress: req.ip ?? null }) }); });
export const remove = endpoint(async (req, res) => { await service.deleteConfig(readId(req.params.id), { actorId: currentUser(res).id, ipAddress: req.ip ?? null }); res.status(204).send(); });
