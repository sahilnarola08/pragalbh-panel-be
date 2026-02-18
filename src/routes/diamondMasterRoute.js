import express from "express";
import * as diamondMasterController from "../controllers/diamondMasterController.js";
import {
  validateCreateDiamondMaster,
  validateUpdateDiamondMaster,
} from "../middlewares/validation/diamondMasterValidation.js";

const router = express.Router();

router.get("/types", diamondMasterController.getTypes);
router.get("/", diamondMasterController.list);
router.get("/type/:type", diamondMasterController.getByType);
router.post("/", validateCreateDiamondMaster, diamondMasterController.create);
router.put("/:id", validateUpdateDiamondMaster, diamondMasterController.update);
router.delete("/:id", diamondMasterController.remove);
router.post("/bulk-delete", diamondMasterController.bulkDelete);
router.post("/bulk-update", diamondMasterController.bulkUpdate);

export default router;
