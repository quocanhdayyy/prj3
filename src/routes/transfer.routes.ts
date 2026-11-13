import { Router } from "express";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import * as controller from "../controllers/transfer.controller";
const router = Router(); router.use(requireAuth);
router.get("/", controller.list); router.get("/:id", controller.detail);
router.post("/", requireAdmin, controller.create); router.patch("/:id", requireAdmin, controller.update); router.delete("/:id", requireAdmin, controller.remove);
export default router;
