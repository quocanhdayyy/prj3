import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { Router } from "express";
import {
  listPlayerStats, getPlayerStatsDetail, addPlayerStats,
  editPlayerStats, removePlayerStats,
} from "../controllers/player-stats.controller";

const router = Router();
router.use(requireAuth);
router.get("/", listPlayerStats);
router.get("/:id", getPlayerStatsDetail);
router.post("/", requireAdmin, addPlayerStats);
router.patch("/:id", requireAdmin, editPlayerStats);
router.delete("/:id", requireAdmin, removePlayerStats);
export default router;
