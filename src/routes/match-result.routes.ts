import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import * as controller from "../controllers/match-result.controller";
const router = Router(); router.use(requireAuth);
router.get("/", controller.list); router.get("/:id", controller.detail); router.delete("/:id", controller.remove);
// Results are created internally by Matching Engine, not client-supplied scores.
router.all(["/", "/:id"], (req, res) => {
  res.set("Allow", req.path === "/" ? "GET" : "GET, DELETE").status(405).json({ status: "error", message: "Kết quả được tạo bởi Matching Engine, không nhập hoặc sửa điểm thủ công." });
});
export default router;
