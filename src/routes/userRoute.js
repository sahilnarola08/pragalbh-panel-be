import express from "express";
import userController from "../controllers/userController.js";
import { 
  validateUserRegistration, 
  validateUserUpdate, 
  validateUserDelete 
} from "../middlewares/validation/userValidation.js";

const router = express.Router();

// User registration with validation
router.post("/registration", validateUserRegistration, userController.register);

// Get all users
router.get("/users-data", userController.getAllUsers);

// Get user by ID
router.get("/user-data-by-id/:id", validateUserDelete, userController.getUserById);

// Update user by ID
router.put("/user-update/:id", validateUserUpdate, userController.updateUser);

// Delete user by ID
router.delete("/user-delete/:id", validateUserDelete, userController.deleteUser);

export default router;