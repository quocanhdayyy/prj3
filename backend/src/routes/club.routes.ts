import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { Router } from "express";
import {
  listClubs,
  addClub,
  getClubDetail,
  editClub,
  removeClub,
} from "../controllers/club.controller";
const router = Router();
router.use(requireAuth);

router.get("/", listClubs);
router.post("/", requireAdmin, addClub);
router.get("/:id", getClubDetail);
router.patch("/:id", requireAdmin, editClub); 
router.delete("/:id", requireAdmin, removeClub);

export default router;
