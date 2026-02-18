import express from "express";
import * as pricingProductController from "../controllers/pricingProductController.js";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";
import { authorize } from "../middlewares/authorize.js";

const router = express.Router();
router.use(authenticateJWT);

router.get("/", authorize("coast.view"), pricingProductController.list);
router.post("/", authorize("coast.create"), pricingProductController.create);
router.put("/:id", authorize("coast.edit"), pricingProductController.update);
router.delete("/:id", authorize("coast.delete"), pricingProductController.remove);
router.post("/bulk-delete", authorize("coast.delete"), pricingProductController.bulkDelete);

export default router;
