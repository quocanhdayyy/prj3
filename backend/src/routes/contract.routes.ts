import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { Router } from "express";
import { listContracts, getContractDetail, addContract, editContract, removeContract } from "../controllers/contract.controller";

const router = Router();
router.use(requireAuth);
router.get("/", listContracts);
router.get("/:id", getContractDetail);
router.post("/", requireAdmin, addContract);
router.patch("/:id", requireAdmin, editContract);
router.delete("/:id", requireAdmin, removeContract);
export default router;
