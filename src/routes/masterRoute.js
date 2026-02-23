import express from "express";
import masterController from "../controllers/masterController.js";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";
import { authorize } from "../middlewares/authorize.js";

const router = express.Router();
router.use(authenticateJWT);

router.post("/create", authorize("master.create"), masterController.createMaster);
router.get("/get", authorize("master.view"), masterController.getAllMasters);
router.get("/get-by-id/:id", authorize("master.view"), masterController.getMasterById);
router.put("/update/:id", authorize("master.edit"), masterController.updateMaster);
router.delete("/delete/:id", authorize("master.delete"), masterController.deleteMaster);
router.post("/assets/create", authorize("master.create"), masterController.createMasterAsset);
router.get("/assets/get", authorize("master.view"), masterController.getAllMasterAssets);
router.get("/assets/get-by-id/:id", authorize("master.view"), masterController.getMasterAssetById);
router.put("/assets/update/:id", authorize("master.edit"), masterController.updateMasterAsset);
router.delete("/assets/delete/:id", authorize("master.delete"), masterController.deleteMasterAsset);


export default router;

