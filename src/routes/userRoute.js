import express from "express";
import userController from "../controllers/userController.js";
import { 
  validateUserRegistration, 
  validateUserUpdate, 
  validateUserDelete 
} from "../middlewares/validation/userValidation.js";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";
import { authorize } from "../middlewares/authorize.js";

const router = express.Router();
router.use(authenticateJWT);

router.post("/registration", authorize("user.create"), validateUserRegistration, userController.register);
router.get("/users-data", authorize("user.view"), userController.getAllUsers);
router.get("/user-data-by-id/:id", authorize("user.view"), validateUserDelete, userController.getUserById);
router.put("/user-update/:id", authorize("user.edit"), validateUserUpdate, userController.updateUser);
router.delete("/user-delete/:id", authorize("user.delete"), validateUserDelete, userController.deleteUser);

export default router;