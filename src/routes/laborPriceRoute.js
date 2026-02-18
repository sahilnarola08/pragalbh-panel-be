import express from "express";
import * as laborPriceController from "../controllers/laborPriceController.js";
import {
  validateCreateLaborPrice,
  validateUpdateLaborPrice,
} from "../middlewares/validation/laborPriceValidation.js";

const router = express.Router();

router.get("/", laborPriceController.list);
router.get("/active", laborPriceController.getAllActive);
router.get("/active/:metalType", laborPriceController.getActiveByMetal);
router.get("/history/:metalType", laborPriceController.getHistory);
router.post("/", validateCreateLaborPrice, laborPriceController.create);
router.put("/:id", validateUpdateLaborPrice, laborPriceController.update);

export default router;
