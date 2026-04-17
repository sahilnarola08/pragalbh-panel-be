import express from "express";
import stockController from "../controllers/stockController.js";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";
import { authorize, authorizeAny } from "../middlewares/authorize.js";

const router = express.Router();
router.use(authenticateJWT);

// Stock-to-order conversion path needs stock read for order creators/editors.
router.get("/", authorizeAny(["stocks.view", "orders.create", "orders.edit"]), stockController.listStocks);
router.get("/:id", authorizeAny(["stocks.view", "orders.create", "orders.edit"]), stockController.getStockById);
router.post("/", authorize("stocks.create"), stockController.createStock);
router.put("/:id", authorize("stocks.edit"), stockController.updateStock);
router.delete("/:id", authorize("stocks.delete"), stockController.deleteStock);

export default router;
