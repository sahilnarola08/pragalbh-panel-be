import express from "express";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";
import { resolveCrmScope } from "../middlewares/resolveCrmScope.js";
import {
  crmAuthContract,
  listCrmClients,
  getCrmClientById,
  updateCrmClient,
  listCrmFollowups,
  createCrmFollowup,
  updateCrmFollowup,
} from "../controllers/crmController.js";

const router = express.Router();

router.use(authenticateJWT);
router.use(resolveCrmScope);

router.get("/auth/contract", crmAuthContract);

router.get("/clients", listCrmClients);
router.get("/clients/:id", getCrmClientById);
router.patch("/clients/:id", updateCrmClient);

router.get("/clients/:customerId/followups", listCrmFollowups);
router.post("/clients/:customerId/followups", createCrmFollowup);
router.patch("/followups/:id", updateCrmFollowup);

export default router;

