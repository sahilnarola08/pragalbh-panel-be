import express from "express";
import crmAuthController from "../controllers/crmAuthController.js";
import { authenticateCrmAccessToken } from "../middlewares/authenticateCrmAccessToken.js";

const router = express.Router();

router.post("/login", crmAuthController.login);
router.post("/verify-otp", crmAuthController.verifyOtp);
router.post("/refresh", crmAuthController.refresh);
router.post("/logout", authenticateCrmAccessToken, crmAuthController.logout);
router.post("/logout-all", authenticateCrmAccessToken, crmAuthController.logoutAll);
router.get("/me", authenticateCrmAccessToken, crmAuthController.me);
router.get("/sessions", authenticateCrmAccessToken, crmAuthController.listSessions);

export default router;
