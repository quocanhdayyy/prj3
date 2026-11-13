import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import * as controller from "../controllers/shortlist-list.controller";
const router = Router(); router.use(requireAuth);
router.get("/", controller.list); router.get("/:id/items", controller.items); router.get("/:id", controller.detail);
router.post("/", controller.create); router.patch("/:id", controller.update); router.delete("/:id", controller.remove);
export default router;
