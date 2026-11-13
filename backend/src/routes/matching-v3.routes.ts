import { Router } from "express";
import { templateV3 } from "../controllers/matching-v3.controller";
const router = Router();
router.get("/template", templateV3);
export default router;
