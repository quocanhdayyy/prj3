import { endpoint, pageQuery, queryId, readDate, requireFound } from "../utils/api-handler";
import { readObject, readId, readInteger, readMoney, readText, InputError } from "../utils/api-validation";
import { currentUser } from "../middleware/auth.middleware";
import { TransferType, DataReliability } from "../generated/prisma/client";
import * as service from "../services/transfer.service";

const parse = (body: unknown, partial: boolean): Partial<service.TransferInput> => {
  const input = readObject(body, ["playerId", "fromClubId", "toClubId", "transferDate", "type", "fee", "reliability", "source"]);
  const data: Partial<service.TransferInput> = {};
  for (const field of ["playerId", "toClubId"] as const) if (!partial || Object.hasOwn(input, field)) data[field] = readInteger(input[field], field, 1);
  if (Object.hasOwn(input, "fromClubId")) data.fromClubId = input.fromClubId === null ? null : readInteger(input.fromClubId, "fromClubId", 1);
  if (!partial || Object.hasOwn(input, "transferDate")) data.transferDate = readDate(input.transferDate, "transferDate");
  if (!partial || Object.hasOwn(input, "type")) {
    if (!Object.values(TransferType).includes(input.type as TransferType)) throw new InputError("type phải là PERMANENT, LOAN hoặc FREE.");
    data.type = input.type as TransferType;
  }
  if (Object.hasOwn(input, "fee")) data.fee = input.fee === null ? null : readMoney(input.fee, "fee");
  if (Object.hasOwn(input, "reliability")) {
    if (!Object.values(DataReliability).includes(input.reliability as DataReliability)) throw new InputError("reliability không hợp lệ.");
    data.reliability = input.reliability as DataReliability;
  }
  if (Object.hasOwn(input, "source")) data.source = input.source === null ? null : readText(input.source, "source", 2000);
  return data;
};
export const list = endpoint(async (req, res) => {
  const page = pageQuery(req); const playerId = queryId(req, "playerId"); const clubId = queryId(req, "clubId");
  const [data, total] = await service.listTransfers({ ...(playerId === undefined ? {} : { playerId }), ...(clubId === undefined ? {} : { OR: [{ fromClubId: clubId }, { toClubId: clubId }] }) }, page.skip, page.take);
  res.json({ status: "success", data, meta: { page: page.page, pageSize: page.pageSize, total } });
});
export const detail = endpoint(async (req, res) => { res.json({ status: "success", data: requireFound(await service.findTransfer(readId(req.params.id))) }); });
export const create = endpoint(async (req, res) => {
  const data = parse(req.body, false) as service.TransferInput;
  res.status(201).json({ status: "success", data: await service.createTransfer(data, { actorId: currentUser(res).id, ipAddress: req.ip ?? null }) });
});
export const update = endpoint(async (req, res) => {
  res.json({ status: "success", data: await service.updateTransfer(readId(req.params.id), parse(req.body, true), { actorId: currentUser(res).id, ipAddress: req.ip ?? null }) });
});
export const remove = endpoint(async (req, res) => { await service.removeTransfer(readId(req.params.id), { actorId: currentUser(res).id, ipAddress: req.ip ?? null }); res.status(204).send(); });
