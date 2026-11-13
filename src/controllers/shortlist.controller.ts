import { ApiError } from "../utils/api-handler";
import { currentUser, ownerScope } from "../middleware/auth.middleware";
import type { Request, Response, NextFunction } from "express";
import { getShortlists, getShortlistById, createShortlist, updateShortlist, deleteShortlist } from "../services/shortlist.service";
import type { CreateShortlistInput, UpdateShortlistInput } from "../services/shortlist.service";
import { readObject, readInteger, readId, InputError, handleCrudError } from "../utils/api-validation";

const parseInput = (body: unknown, partial: boolean): UpdateShortlistInput => {
  const input = readObject(body, partial ? ["requirementId", "note", "priority"] : ["playerId", "shortlistId", "requirementId", "note", "priority"]);
  const data: UpdateShortlistInput = {};
  if (Object.hasOwn(input,"priority")) data.priority = readInteger(input.priority,"priority",1);
  if (Object.hasOwn(input,"requirementId")) data.requirementId = input.requirementId === null ? null : readInteger(input.requirementId,"requirementId",1);
  if (Object.hasOwn(input,"note")) {
    const value = input.note;
    if (value !== null && (typeof value !== "string" || value.trim().length > 255)) throw new InputError("note phải là chuỗi tối đa 255 ký tự hoặc null.");
    data.note = value === null ? null : (value as string).trim();
  }
  return data;
};
const errorHandler = (error: unknown,res: Response,next: NextFunction) => {
  if (error instanceof ApiError) { res.status(error.status).json({ status:"error",message:error.message }); return; }
  handleCrudError(error,res,next, {
  missing: "Không tìm thấy Shortlist.", reference: "Người dùng/cầu thủ/nhu cầu không tồn tại hoặc nhu cầu không thuộc người dùng này.", duplicate: "Cầu thủ đã được lưu trong Shortlist này.",
});
};
export const listShortlists = async (_req: Request,res: Response,next: NextFunction) => {
  try { res.json({ status:"success",data:await getShortlists(ownerScope(res)) }); } catch(error) { errorHandler(error,res,next); }
};
export const getShortlistDetail = async (req: Request,res: Response,next: NextFunction) => {
  try {
    const item=await getShortlistById(readId(req.params.id), ownerScope(res));
    if(!item) { res.status(404).json({ status:"error",message:"Không tìm thấy Shortlist." }); return; }
    res.json({ status:"success",data:item });
  } catch(error) { errorHandler(error,res,next); }
};
export const addShortlist = async (req: Request,res: Response,next: NextFunction) => {
  try {
    const parsed=parseInput(req.body,false);
    const data:CreateShortlistInput={ ...parsed,...(req.body.shortlistId === undefined ? {} : { shortlistId: readInteger(req.body.shortlistId,"shortlistId",1) }),userId:currentUser(res).id,playerId:readInteger(req.body.playerId,"playerId",1) };
    res.status(201).json({ status:"success",data:await createShortlist(data) });
  } catch(error) { errorHandler(error,res,next); }
};
export const editShortlist = async (req: Request,res: Response,next: NextFunction) => {
  try {
    const id=readId(req.params.id);
    res.json({ status:"success",data:await updateShortlist(id,parseInput(req.body,true),ownerScope(res)) });
  } catch(error) { errorHandler(error,res,next); }
};
export const removeShortlist = async (req: Request,res: Response,next: NextFunction) => {
  try { await deleteShortlist(readId(req.params.id),ownerScope(res));res.status(204).send(); } catch(error) { errorHandler(error,res,next); }
};
