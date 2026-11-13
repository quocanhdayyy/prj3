import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { Router } from "express";
import { listInjuries, getInjuryDetail, addInjury, editInjury, removeInjury } from "../controllers/injury-history.controller";

const router = Router();
router.use(requireAuth);
router.get("/", listInjuries);
router.get("/:id", getInjuryDetail);
router.post("/", requireAdmin, addInjury);
router.patch("/:id", requireAdmin, editInjury);
router.delete("/:id", requireAdmin, removeInjury);
export default router;
