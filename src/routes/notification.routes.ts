import { Router } from "express";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import * as controller from "../controllers/notification.controller";
const router = Router(); router.use(requireAuth);
router.get("/", controller.list); router.get("/:id", controller.detail);
router.post("/", requireAdmin, controller.create); router.patch("/:id", controller.update); router.delete("/:id", controller.remove);
export default router;
