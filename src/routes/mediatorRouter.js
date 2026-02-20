import express from "express";
import mediatorController from "../controllers/mediatorController.js";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";
import { authorize } from "../middlewares/authorize.js";

const router = express.Router();
router.use(authenticateJWT);

router.post("/", authorize("income.view"), mediatorController.create);
router.get("/", authorize("income.view"), mediatorController.getAll);
router.get("/:id", authorize("income.view"), mediatorController.getById);
router.put("/:id", authorize("income.edit"), mediatorController.update);
router.delete("/:id", authorize("income.delete"), mediatorController.remove);

export default router;
