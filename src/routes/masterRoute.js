import express from "express";
import masterController from "../controllers/masterController.js";

const router = express.Router();

// Create master - accepts single object
router.post("/create", masterController.createMaster);

// Get all masters with filtering, search, and pagination
router.get("/get", masterController.getAllMasters);

export default router;

