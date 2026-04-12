import express from "express";
import stockController from "../controllers/stockController.js";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";
import { authorize } from "../middlewares/authorize.js";

const router = express.Router();
router.use(authenticateJWT);

router.get("/", authorize("stocks.view"), stockController.listStocks);
router.get("/:id", authorize("stocks.view"), stockController.getStockById);
router.post("/", authorize("stocks.create"), stockController.createStock);
router.put("/:id", authorize("stocks.edit"), stockController.updateStock);
router.delete("/:id", authorize("stocks.delete"), stockController.deleteStock);

export default router;
