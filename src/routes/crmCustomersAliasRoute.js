import express from "express";
import { authenticateCrmAccessToken } from "../middlewares/authenticateCrmAccessToken.js";
import crmGatewayController from "../controllers/crmGatewayController.js";

const router = express.Router();

router.use(authenticateCrmAccessToken);

router.get("/customers", crmGatewayController.listCustomers);
router.get("/customers/:id", crmGatewayController.getCustomerById);
router.patch("/customers/:id", crmGatewayController.updateCustomer);
router.get("/customers/:customerId/followups", crmGatewayController.listFollowups);
router.post("/customers/:customerId/followups", crmGatewayController.createFollowup);

export default router;
