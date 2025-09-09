import express from "express";
import userController from "../controllers/userController.js";
import { validateUserRegistration } from "../middlewares/validation/userValidation.js";

const router = express.Router();

// User registration with validation
router.post("/registration", validateUserRegistration, userController.register);

// get all users
router.get("/users-data", userController.getAllUsers);

export default router;