import express from "express";
import authController from "../controllers/authController.js";
import { validateSignup, validateSignin } from "../middlewares/validation/authValidation.js";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";

const router = express.Router();

router.post("/signup", validateSignup, authController.signup);
router.post("/signin", validateSignin, authController.signin);
router.post("/verify-otp", authController.verifyOtp);
router.post("/resend-otp", authController.resendOtp);
router.get("/me", authenticateJWT, authController.me);

export default router;

