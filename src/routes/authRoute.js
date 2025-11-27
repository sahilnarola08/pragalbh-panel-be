import express from "express";
import authController from "../controllers/authController.js";
import { validateSignup, validateSignin } from "../middlewares/validation/authValidation.js";

const router = express.Router();

// Signup route
router.post("/signup", validateSignup, authController.signup);

// Signin route
router.post("/signin", validateSignin, authController.signin);

export default router;

