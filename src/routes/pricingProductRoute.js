import express from "express";
import * as pricingProductController from "../controllers/pricingProductController.js";

const router = express.Router();

router.get("/", pricingProductController.list);
router.post("/", pricingProductController.create);
router.put("/:id", pricingProductController.update);
router.delete("/:id", pricingProductController.remove);

export default router;
