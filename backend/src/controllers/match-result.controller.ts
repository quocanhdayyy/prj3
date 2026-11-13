import { endpoint, pageQuery, queryId, requireFound, ownerWhere } from "../utils/api-handler";
import { readId } from "../utils/api-validation";
import { ownerScope } from "../middleware/auth.middleware";
import * as service from "../services/matching/match-result.service";
export const list = endpoint(async (req, res) => {
  const page = pageQuery(req); const playerId = queryId(req, "playerId"); const requirementId = queryId(req, "requirementId");
  const [data, total] = await service.listMatchResults({ ...ownerWhere(ownerScope(res)), ...(playerId === undefined ? {} : { playerId }), ...(requirementId === undefined ? {} : { requirementId }) }, page.skip, page.take);
  res.json({ status: "success", data, meta: { page: page.page, pageSize: page.pageSize, total } });
});
export const detail = endpoint(async (req, res) => { res.json({ status: "success", data: requireFound(await service.findMatchResult(readId(req.params.id), ownerScope(res))) }); });
export const remove = endpoint(async (req, res) => { await service.deleteMatchResult(readId(req.params.id), ownerScope(res)); res.status(204).send(); });
