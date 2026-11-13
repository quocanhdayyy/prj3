import { currentUser, ownerScope } from "../middleware/auth.middleware";
import type { Request, Response, NextFunction } from "express";
import { getRequirements, getRequirementById, createRequirement, updateRequirement, deleteRequirement } from "../services/club-requirement.service";
import type { CreateRequirementInput, UpdateRequirementInput } from "../services/club-requirement.service";
import { readObject, readInteger, readId, readText, readMoney, handleCrudError } from "../utils/api-validation";

const parseInput = (body: unknown, partial: boolean): UpdateRequirementInput => {
  const fields = ["clubId", "minAge", "maxAge", "salaryLimit", "position", "priority", "budget"];
  const input = readObject(body, fields);
  const data: UpdateRequirementInput = {};
  for (const field of ["clubId", "minAge", "maxAge", "priority"] as const) {
    if (!partial || Object.hasOwn(input, field)) data[field] = readInteger(input[field], field, field === "clubId" || field === "priority" ? 1 : 0);
  }
  for (const field of ["salaryLimit", "budget"] as const) {
    if (!partial || Object.hasOwn(input, field)) data[field] = readMoney(input[field], field);
  }
  if (!partial || Object.hasOwn(input, "position")) data.position = readText(input.position, "position", 50);
  return data;
};
const errorHandler = (error: unknown, res: Response, next: NextFunction) => handleCrudError(error, res, next, {
  missing: "Không tìm thấy nhu cầu CLB.", reference: "CLB/người dùng không tồn tại hoặc nhu cầu đang được Shortlist tham chiếu.", duplicate: "Dữ liệu nhu cầu bị trùng.",
});
export const listRequirements = async (_req: Request, res: Response, next: NextFunction) => {
  try { res.json({ status: "success", data: await getRequirements(ownerScope(res)) }); } catch (error) { errorHandler(error,res,next); }
};
export const getRequirementDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await getRequirementById(readId(req.params.id), ownerScope(res));
    if (!item) { res.status(404).json({ status: "error", message: "Không tìm thấy nhu cầu CLB." }); return; }
    res.json({ status: "success", data: item });
  } catch (error) { errorHandler(error,res,next); }
};
export const addRequirement = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = parseInput(req.body, false);
    const userId = currentUser(res).id;
    res.status(201).json({ status: "success", data: await createRequirement({ ...parsed, userId } as CreateRequirementInput) });
  } catch (error) { errorHandler(error,res,next); }
};
export const editRequirement = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = readId(req.params.id);
    res.json({ status: "success", data: await updateRequirement(id, parseInput(req.body, true), ownerScope(res)) });
  } catch (error) { errorHandler(error,res,next); }
};
export const removeRequirement = async (req: Request, res: Response, next: NextFunction) => {
  try { await deleteRequirement(readId(req.params.id), ownerScope(res)); res.status(204).send(); } catch (error) { errorHandler(error,res,next); }
};
