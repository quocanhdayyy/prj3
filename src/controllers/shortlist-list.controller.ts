import { endpoint, pageQuery, requireFound } from "../utils/api-handler";
import { readObject, readId, readText } from "../utils/api-validation";
import { currentUser, ownerScope } from "../middleware/auth.middleware";
import * as service from "../services/shortlist-list.service";

export const list = endpoint(async (req, res) => {
  const page = pageQuery(req); const [data, total] = await service.listLists(ownerScope(res), page.skip, page.take);
  res.json({ status: "success", data, meta: { page: page.page, pageSize: page.pageSize, total } });
});
export const detail = endpoint(async (req, res) => { res.json({ status: "success", data: requireFound(await service.findList(readId(req.params.id), ownerScope(res))) }); });
export const items = endpoint(async (req, res) => {
  const page = pageQuery(req); const [data, total] = await service.listItems(readId(req.params.id), ownerScope(res), page.skip, page.take);
  res.json({ status: "success", data, meta: { page: page.page, pageSize: page.pageSize, total } });
});
export const create = endpoint(async (req, res) => {
  const input = readObject(req.body, ["name"]);
  const item = await service.createList(readText(input.name, "name", 100), { actorId: currentUser(res).id, ipAddress: req.ip ?? null });
  res.status(201).json({ status: "success", data: item });
});
export const update = endpoint(async (req, res) => {
  const input = readObject(req.body, ["name"]);
  res.json({ status: "success", data: await service.renameList(readId(req.params.id), readText(input.name, "name", 100), ownerScope(res), { actorId: currentUser(res).id, ipAddress: req.ip ?? null }) });
});
export const remove = endpoint(async (req, res) => { await service.deleteList(readId(req.params.id), ownerScope(res), { actorId: currentUser(res).id, ipAddress: req.ip ?? null }); res.status(204).send(); });
