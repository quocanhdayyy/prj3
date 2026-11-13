import { Router } from "express";
import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { listLogs, getLog } from "../controllers/audit-log.controller";
const router = Router();
router.use(requireAuth, requireAdmin);
router.get("/", listLogs);
router.get("/:id", getLog);
router.all(["/", "/:id"], (_req, res) => {
  res.set("Allow", "GET").status(405).json({ status: "error", message: "Audit Log chỉ được đọc, không tạo/sửa/xóa qua API." });
});
export default router;
