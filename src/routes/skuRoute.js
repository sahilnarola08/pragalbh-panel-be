import express from "express";
import skuController from "../controllers/skuController.js";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";
import { authorize, authorizeAny } from "../middlewares/authorize.js";
import {
  validateSkuGenerate,
  validateSkuBulkGenerate,
  validateSkuPreview,
  validateSkuAi,
  validateSkuTemplate,
  validateSkuCategory,
} from "../middlewares/validation/skuValidation.js";

const router = express.Router();
router.use(authenticateJWT);

router.get("/options", authorizeAny(["sku.view", "sku.create"]), skuController.getSkuOptions);
router.get("/categories", authorizeAny(["sku.view", "sku.create"]), skuController.getSkuCategories);
router.post("/categories", authorizeAny(["sku.create", "sku.manage"]), validateSkuCategory, skuController.createSkuCategoryHandler);
router.put("/categories/:id", authorizeAny(["sku.create", "sku.manage"]), skuController.updateSkuCategoryHandler);
router.delete("/categories/:id", authorizeAny(["sku.create", "sku.manage"]), skuController.deleteSkuCategoryHandler);
router.get("/dashboard", authorize("sku.view"), skuController.getSkuDashboard);
router.get("/search", authorizeAny(["sku.view", "product.view"]), skuController.searchSkus);
router.get("/templates", authorize("sku.view"), skuController.listTemplates);
router.post("/templates", authorize("sku.manage"), validateSkuTemplate, skuController.createTemplate);
router.put("/templates/:id", authorize("sku.manage"), skuController.updateTemplate);
router.get("/clients", authorize("sku.view"), skuController.listSkuClients);
router.post("/clients", authorize("sku.manage"), skuController.createSkuClient);

router.post("/preview", authorizeAny(["sku.view", "sku.create"]), validateSkuPreview, skuController.previewSkuCode);
router.post("/generate", authorize("sku.create"), validateSkuGenerate, skuController.generateSkuCode);
router.post("/bulk-generate", authorize("sku.create"), validateSkuBulkGenerate, skuController.bulkGenerateSkuCodes);
router.post("/ai-generate", authorize("sku.create"), validateSkuAi, skuController.aiGenerateSku);
router.post("/variants", authorize("sku.create"), skuController.generateVariants);

router.get("/:id", authorizeAny(["sku.view", "product.view"]), skuController.getSkuById);
router.get("/:id/download", authorize("sku.view"), skuController.downloadSkuMedia);
router.put("/update/:id", authorize("sku.edit"), skuController.updateSku);
router.delete("/:id", authorize("sku.delete"), skuController.deleteSku);

export default router;
