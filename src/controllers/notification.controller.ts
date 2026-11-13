import { endpoint, pageQuery, requireFound, ownerWhere } from "../utils/api-handler";
import { readObject, readId, readInteger, readText, InputError } from "../utils/api-validation";
import { ownerScope } from "../middleware/auth.middleware";
import { NotificationType } from "../generated/prisma/client";
import * as service from "../services/notification.service";

export const list = endpoint(async (req, res) => {
  const page = pageQuery(req);
  if (req.query.unread !== undefined && !["true", "false"].includes(req.query.unread as string)) throw new InputError("unread phải là true hoặc false.");
  const [data, total] = await service.listNotifications({ ...ownerWhere(ownerScope(res)), ...(req.query.unread === undefined ? {} : { readAt: req.query.unread === "true" ? null : { not: null } }) }, page.skip, page.take);
  res.json({ status: "success", data, meta: { page: page.page, pageSize: page.pageSize, total } });
});
export const detail = endpoint(async (req, res) => { res.json({ status: "success", data: requireFound(await service.findNotification(readId(req.params.id), ownerScope(res))) }); });
export const create = endpoint(async (req, res) => {
  const input = readObject(req.body, ["userId", "playerId", "type", "title", "content", "eventKey"]);
  if (!Object.values(NotificationType).includes(input.type as NotificationType)) throw new InputError("Loại thông báo không hợp lệ.");
  const data: service.NotificationInput = {
    userId: readInteger(input.userId, "userId", 1), type: input.type as NotificationType,
    title: readText(input.title, "title", 255), content: readText(input.content, "content", 5000), eventKey: readText(input.eventKey, "eventKey", 255),
    ...(input.playerId === undefined ? {} : { playerId: input.playerId === null ? null : readInteger(input.playerId, "playerId", 1) }),
  };
  res.status(201).json({ status: "success", data: await service.createNotification(data) });
});
export const update = endpoint(async (req, res) => {
  const input = readObject(req.body, ["isRead"]);
  if (typeof input.isRead !== "boolean") throw new InputError("isRead phải là boolean.");
  res.json({ status: "success", data: await service.markNotification(readId(req.params.id), input.isRead, ownerScope(res)) });
});
export const remove = endpoint(async (req, res) => { await service.deleteNotification(readId(req.params.id), ownerScope(res)); res.status(204).send(); });
