import express from "express";
import * as laborPriceController from "../controllers/laborPriceController.js";
import {
  validateCreateLaborPrice,
  validateUpdateLaborPrice,
} from "../middlewares/validation/laborPriceValidation.js";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";
import { authorize } from "../middlewares/authorize.js";

const router = express.Router();
router.use(authenticateJWT);

router.get("/", authorize("coast.view"), laborPriceController.list);
router.get("/active", authorize("coast.view"), laborPriceController.getAllActive);
router.get("/active/:metalType", authorize("coast.view"), laborPriceController.getActiveByMetal);
router.get("/history/:metalType", authorize("coast.view"), laborPriceController.getHistory);
router.post("/", authorize("coast.create"), validateCreateLaborPrice, laborPriceController.create);
router.put("/:id", authorize("coast.edit"), validateUpdateLaborPrice, laborPriceController.update);

export default router;
