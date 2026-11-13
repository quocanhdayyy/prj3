import { Router } from "express";
import { loginUser, getCurrentUser, logoutUser } from "../controllers/auth.controller";
import { requireAuth, limitLoginAttempts } from "../middleware/auth.middleware";

const router = Router();
router.post("/login", limitLoginAttempts, loginUser);
router.get("/me", requireAuth, getCurrentUser);
router.post("/logout", requireAuth, logoutUser);
export default router;
