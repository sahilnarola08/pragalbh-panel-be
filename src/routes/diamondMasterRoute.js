import express from "express";
import * as diamondMasterController from "../controllers/diamondMasterController.js";
import {
  validateCreateDiamondMaster,
  validateUpdateDiamondMaster,
} from "../middlewares/validation/diamondMasterValidation.js";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";
import { authorize } from "../middlewares/authorize.js";

const router = express.Router();
router.use(authenticateJWT);

router.get("/types", authorize("coast.view"), diamondMasterController.getTypes);
router.get("/", authorize("coast.view"), diamondMasterController.list);
router.get("/type/:type", authorize("coast.view"), diamondMasterController.getByType);
router.post("/", authorize("coast.create"), validateCreateDiamondMaster, diamondMasterController.create);
router.put("/:id", authorize("coast.edit"), validateUpdateDiamondMaster, diamondMasterController.update);
router.delete("/:id", authorize("coast.delete"), diamondMasterController.remove);
router.post("/bulk-delete", authorize("coast.delete"), diamondMasterController.bulkDelete);
router.post("/bulk-update", authorize("coast.edit"), diamondMasterController.bulkUpdate);

export default router;
