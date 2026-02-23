import express from "express";
import * as coastController from "../controllers/coastController.js";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";
import { authorize } from "../middlewares/authorize.js";

const router = express.Router();
router.use(authenticateJWT);

router.get("/gold-rate", authorize("coast.view"), coastController.getGoldRate);
router.get("/silver-rate", authorize("coast.view"), coastController.getSilverRate);
router.get("/platinum-rate", authorize("coast.view"), coastController.getPlatinumRate);
router.get("/settings", authorize("coast.view"), coastController.getSettings);
router.patch("/settings", authorize("coast.edit"), coastController.updateSettings);
router.get("/metal-labor", authorize("coast.view"), coastController.getMetalLabor);
router.get("/diamond-prices", authorize("coast.view"), coastController.getDiamondPrices);
router.post("/diamond-prices", authorize("coast.create"), coastController.createDiamondPrice);
router.put("/diamond-prices/:id", authorize("coast.edit"), coastController.updateDiamondPrice);
router.delete("/diamond-prices/:id", authorize("coast.delete"), coastController.deleteDiamondPrice);
router.post("/diamond-prices/bulk-delete", authorize("coast.delete"), coastController.bulkDeleteDiamondPrices);
router.get("/origins", authorize("coast.view"), coastController.getOrigins);
router.get("/origins/:origin/shapes", authorize("coast.view"), coastController.getShapesForOrigin);
router.get("/origins/:origin/shapes/:shape/colors", authorize("coast.view"), coastController.getColorsForOriginShape);
router.get("/origins/:origin/shapes/:shape/colors/:color/clarities", authorize("coast.view"), coastController.getClaritiesForOriginShapeColor);
router.get(
  "/origins/:origin/shapes/:shape/colors/:color/clarities/:clarity/cut-grades",
  authorize("coast.view"),
  coastController.getCutGradesForOriginShapeColorClarity
);
router.post("/calculate-price", authorize("coast.view"), coastController.calculateFinalPrice);
router.post("/diamond-prices/bulk", authorize("coast.edit"), coastController.bulkUpdateDiamondPrices);
router.get("/diamond-mm-carat", authorize("coast.view"), coastController.getDiamondMmCaratList);
router.get("/diamond-mm-carat/categories", authorize("coast.view"), coastController.getDiamondMmCaratCategories);
router.get("/diamond-mm-carat/seed", authorize("coast.view"), coastController.seedDiamondMmCarat);
router.post("/diamond-mm-carat/seed", authorize("coast.create"), coastController.seedDiamondMmCarat);

export default router;
