import { endpoint, pageQuery, queryId, readDate, requireFound } from "../utils/api-handler";
import { readId, readText, InputError } from "../utils/api-validation";
import { listAuditLogs, findAuditLog } from "../services/audit-log.service";
import type { Prisma } from "../generated/prisma/client";

export const listLogs = endpoint(async (req, res) => {
  const page = pageQuery(req);
  const entityId = queryId(req, "entityId"); const actorId = queryId(req, "actorId");
  const from = req.query.from === undefined ? undefined : readDate(req.query.from, "from");
  const to = req.query.to === undefined ? undefined : readDate(req.query.to, "to");
  if (from && to && from > to) throw new InputError("from phải trước hoặc bằng to.");
  const where: Prisma.AuditLogWhereInput = {
    ...(entityId === undefined ? {} : { entityId }), ...(actorId === undefined ? {} : { actorId }),
    ...(req.query.entityType === undefined ? {} : { entityType: readText(req.query.entityType, "entityType", 100) }),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: new Date(to.getTime() + 86400000) } : {}) } } : {}),
  };
  const [data, total] = await listAuditLogs(where, page.skip, page.take);
  res.json({ status: "success", data, meta: { page: page.page, pageSize: page.pageSize, total } });
});
export const getLog = endpoint(async (req, res) => {
  res.json({ status: "success", data: requireFound(await findAuditLog(readId(req.params.id))) });
});
