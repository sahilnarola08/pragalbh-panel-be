import express from "express";
import * as coastController from "../controllers/coastController.js";

const router = express.Router();

router.get("/gold-rate", coastController.getGoldRate);
router.get("/silver-rate", coastController.getSilverRate);
router.get("/platinum-rate", coastController.getPlatinumRate);
router.get("/settings", coastController.getSettings);
router.patch("/settings", coastController.updateSettings);
router.get("/metal-labor", coastController.getMetalLabor);
router.get("/diamond-prices", coastController.getDiamondPrices);
router.post("/diamond-prices", coastController.createDiamondPrice);
router.put("/diamond-prices/:id", coastController.updateDiamondPrice);
router.delete("/diamond-prices/:id", coastController.deleteDiamondPrice);
router.get("/origins", coastController.getOrigins);
router.get("/origins/:origin/shapes", coastController.getShapesForOrigin);
router.get("/origins/:origin/shapes/:shape/colors", coastController.getColorsForOriginShape);
router.get("/origins/:origin/shapes/:shape/colors/:color/clarities", coastController.getClaritiesForOriginShapeColor);
router.get(
  "/origins/:origin/shapes/:shape/colors/:color/clarities/:clarity/cut-grades",
  coastController.getCutGradesForOriginShapeColorClarity
);
router.post("/calculate-price", coastController.calculateFinalPrice);
router.post("/diamond-prices/bulk", coastController.bulkUpdateDiamondPrices);

export default router;
