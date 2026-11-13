import { requireAuth, requireAdmin } from "../middleware/auth.middleware";
import { Router } from "express";
import { listUsers, getUserDetail, addUser, editUser, removeUser } from "../controllers/user.controller";

// User management is reserved for administrators.
const router = Router();
router.use(requireAuth, requireAdmin);
router.get("/", listUsers);
router.get("/:id", getUserDetail);
router.post("/", addUser);
router.patch("/:id", editUser);
router.delete("/:id", removeUser);
export default router;
