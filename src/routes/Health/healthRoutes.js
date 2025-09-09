import express from "express";
const router = express.Router();
import healthController from "../../controllers/healthController.js";

router.get("/test", healthController.createHealth);


export default router;
