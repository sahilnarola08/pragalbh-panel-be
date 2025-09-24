import express from "express";
import schedulerController from "../controllers/schedulerController.js";

const router = express.Router();

router.post("/check-over-due/", schedulerController.checkOverDue);

export default router;