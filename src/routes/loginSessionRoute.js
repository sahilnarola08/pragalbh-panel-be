import express from "express";
import * as loginSessionController from "../controllers/loginSessionController.js";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";
import { authorize } from "../middlewares/authorize.js";

const router = express.Router();
router.use(authenticateJWT);
router.use(authorize("users.manage"));

router.get("/", loginSessionController.listSessions);
router.delete("/:id", loginSessionController.revokeSession);

export default router;
