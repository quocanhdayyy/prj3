import type { Request, Response } from "express";
import { DataReliability } from "../generated/prisma/client";
import { currentUser, ownerScope } from "../middleware/auth.middleware";
import { endpoint, pageQuery, queryId, readDate, requireFound } from "../utils/api-handler";
import { InputError, readId, readInteger, readMoney, readObject, readText } from "../utils/api-validation";
import * as service from "../services/matching/matching-data.service";

const context = (req: Request, res: Response) => ({ actorId: currentUser(res).id, ipAddress: req.ip ?? null });
const pastDate = (value: unknown, field: string) => {
  const date = readDate(value, field);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  if (date.toISOString().slice(0, 10) > today) throw new InputError(`${field} không được nằm trong tương lai.`);
  return date;
};

const parseValuation = (body: unknown, partial: boolean): Partial<service.ValuationInput> => {
  const input = readObject(body, partial ? ["valuedAt", "marketValue", "source", "reliability"] : ["playerId", "valuedAt", "marketValue", "source", "reliability"]);
  const data: Partial<service.ValuationInput> = {};
  if (!partial) data.playerId = readInteger(input.playerId, "playerId", 1);
  if (!partial || Object.hasOwn(input, "valuedAt")) data.valuedAt = pastDate(input.valuedAt, "valuedAt");
  if (!partial || Object.hasOwn(input, "marketValue")) data.marketValue = readMoney(input.marketValue, "marketValue");
  if (!partial || Object.hasOwn(input, "source")) data.source = readText(input.source, "source", 255);
  if (Object.hasOwn(input, "reliability")) {
    if (!Object.values(DataReliability).includes(input.reliability as DataReliability)) throw new InputError("reliability không hợp lệ.");
    data.reliability = input.reliability as DataReliability;
  }
  return data;
};
export const listValuations = endpoint(async (req, res) => {
  const page = pageQuery(req);
  const [data, total] = await service.listValuations(queryId(req, "playerId"), page.skip, page.take);
  res.json({ status: "success", data, meta: { page: page.page, pageSize: page.pageSize, total } });
});
export const valuationDetail = endpoint(async (req, res) => {
  res.json({ status: "success", data: requireFound(await service.findValuation(readId(req.params.id))) });
});
export const createValuation = endpoint(async (req, res) => {
  res.status(201).json({ status: "success", data: await service.createValuation(parseValuation(req.body, false) as service.ValuationInput, context(req, res)) });
});
export const updateValuation = endpoint(async (req, res) => {
  res.json({ status: "success", data: await service.updateValuation(readId(req.params.id), parseValuation(req.body, true), context(req, res)) });
});
export const removeValuation = endpoint(async (req, res) => {
  await service.removeValuation(readId(req.params.id), context(req, res)); res.status(204).send();
});

const parseEstimate = (body: unknown, partial: boolean): Partial<service.EstimateInput> => {
  const fields = ["estimatedFee", "expectedSalaryPerYear", "feeSource", "salarySource"];
  const input = readObject(body, partial ? fields : [...fields, "playerId", "requirementId"]);
  const data: Partial<service.EstimateInput> = {};
  if (!partial) {
    data.playerId = readInteger(input.playerId, "playerId", 1);
    data.requirementId = readInteger(input.requirementId, "requirementId", 1);
  }
  for (const field of ["estimatedFee", "expectedSalaryPerYear"] as const) {
    if (Object.hasOwn(input, field)) data[field] = input[field] === null ? null : readMoney(input[field], field);
  }
  for (const field of ["feeSource", "salarySource"] as const) {
    if (Object.hasOwn(input, field)) data[field] = input[field] === null ? null : readText(input[field], field, 255);
  }
  return data;
};
export const listEstimates = endpoint(async (req, res) => {
  const page = pageQuery(req);
  const playerId = queryId(req, "playerId"); const requirementId = queryId(req, "requirementId");
  const filters = { ...(playerId === undefined ? {} : { playerId }), ...(requirementId === undefined ? {} : { requirementId }) };
  const [data, total] = await service.listEstimates(filters, ownerScope(res), page.skip, page.take);
  res.json({ status: "success", data, meta: { page: page.page, pageSize: page.pageSize, total } });
});
export const estimateDetail = endpoint(async (req, res) => {
  res.json({ status: "success", data: requireFound(await service.findEstimate(readId(req.params.id), ownerScope(res))) });
});
export const createEstimate = endpoint(async (req, res) => {
  res.status(201).json({ status: "success", data: await service.createEstimate(parseEstimate(req.body, false) as service.EstimateInput, ownerScope(res), context(req, res)) });
});
export const updateEstimate = endpoint(async (req, res) => {
  res.json({ status: "success", data: await service.updateEstimate(readId(req.params.id), parseEstimate(req.body, true), ownerScope(res), context(req, res)) });
});
export const removeEstimate = endpoint(async (req, res) => {
  await service.removeEstimate(readId(req.params.id), ownerScope(res), context(req, res)); res.status(204).send();
});

const parseVerification = (body: unknown): service.VerificationInput => {
  const input = readObject(body, ["injuryHistory", "registration"]);
  const data: service.VerificationInput = {};
  if (Object.hasOwn(input, "injuryHistory")) {
    if (input.injuryHistory === null) data.injuryHistory = null;
    else {
      const injury = readObject(input.injuryHistory, ["coveredFrom", "coveredThrough", "source"]);
      const coveredFrom = pastDate(injury.coveredFrom, "coveredFrom");
      const coveredThrough = pastDate(injury.coveredThrough, "coveredThrough");
      if (coveredFrom > coveredThrough) throw new InputError("coveredThrough không được trước coveredFrom.");
      data.injuryHistory = { coveredFrom, coveredThrough, source: readText(injury.source, "source", 255) };
    }
  }
  if (Object.hasOwn(input, "registration")) {
    if (input.registration === null) data.registration = null;
    else {
      const registration = readObject(input.registration, ["status", "asOf", "source"]);
      if (registration.status !== "FREE_AGENT" && registration.status !== "CONTRACTED") throw new InputError("status phải là FREE_AGENT hoặc CONTRACTED; gửi registration: null để về UNKNOWN.");
      data.registration = { status: registration.status, asOf: pastDate(registration.asOf, "asOf"), source: readText(registration.source, "source", 255) };
    }
  }
  return data;
};
export const listVerifications = endpoint(async (req, res) => {
  const page = pageQuery(req);
  const [data, total] = await service.listVerifications(queryId(req, "playerId"), page.skip, page.take);
  res.json({ status: "success", data, meta: { page: page.page, pageSize: page.pageSize, total } });
});
export const verificationDetail = endpoint(async (req, res) => {
  res.json({ status: "success", data: requireFound(await service.findVerification(readId(req.params.playerId))) });
});
export const saveVerification = endpoint(async (req, res) => {
  res.json({ status: "success", data: await service.saveVerification(readId(req.params.playerId), parseVerification(req.body), context(req, res)) });
});
export const removeVerification = endpoint(async (req, res) => {
  await service.removeVerification(readId(req.params.playerId), context(req, res)); res.status(204).send();
});
