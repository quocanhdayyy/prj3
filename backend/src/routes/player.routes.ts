import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { Router } from "express";
import {
  listPlayers, getPlayerDetail, addPlayer, editPlayer, removePlayer,
} from "../controllers/player.controller";

const router = Router();
router.use(requireAuth);
router.get("/", listPlayers);
router.get("/:id", getPlayerDetail);
router.post("/", requireAdmin, addPlayer);
router.patch("/:id", requireAdmin, editPlayer);
router.delete("/:id", requireAdmin, removePlayer);

export default router;
