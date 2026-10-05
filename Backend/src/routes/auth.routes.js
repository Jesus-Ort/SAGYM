import { Router } from "express";
import { login, logout, refreshToken, me } from "../controller/auth.controller.js";
import { requireAuth } from "../middleware/require-auth.js";

const router = Router();

router.post("/login", login);
router.post('/refresh', refreshToken)
router.post('/logout', requireAuth, logout)
router.get('/me', requireAuth, me)

export default router;