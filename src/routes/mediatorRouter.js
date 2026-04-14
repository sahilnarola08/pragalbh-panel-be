import express from "express";
import mediatorController from "../controllers/mediatorController.js";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";
import { authorize, authorizeAny } from "../middlewares/authorize.js";

/** Read mediators for Income module, or when creating/editing orders (mediator pickers). */
const canListMediators = authorizeAny([
  "income.view",
  "orders.create",
  "orders.edit",
]);

const router = express.Router();
router.use(authenticateJWT);

router.post("/", authorize("income.view"), mediatorController.create);
router.get("/", canListMediators, mediatorController.getAll);
router.get("/:id", canListMediators, mediatorController.getById);
router.put("/:id", authorize("income.edit"), mediatorController.update);
router.delete("/:id", authorize("income.delete"), mediatorController.remove);

export default router;
