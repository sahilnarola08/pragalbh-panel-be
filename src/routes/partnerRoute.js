import express from "express";
import partnerController from "../controllers/partnerController.js";
import {
  validatePartnerId,
  validateCreatePartner,
  validateUpdatePartner,
  validateInvest,
  validateWithdraw,
  validateAdjust,
} from "../middlewares/validation/partnerValidation.js";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";
import { authorize } from "../middlewares/authorize.js";

const router = express.Router();
router.use(authenticateJWT);

router.get("/", authorize("partners.view"), partnerController.listPartners);
router.post("/", authorize("partners.create"), validateCreatePartner, partnerController.createPartner);
router.get("/:id", authorize("partners.view"), validatePartnerId, partnerController.getPartnerById);
router.put("/:id", authorize("partners.edit"), validateUpdatePartner, partnerController.updatePartner);

router.post("/:id/invest", authorize("partners.invest"), validateInvest, partnerController.invest);
router.post("/:id/withdraw", authorize("partners.withdraw"), validateWithdraw, partnerController.withdraw);
router.post("/:id/adjust", authorize("partners.edit"), validateAdjust, partnerController.adjust);

router.get("/:id/transactions", authorize("partners.view"), validatePartnerId, partnerController.getTransactions);
router.put("/:id/transactions/:transactionId/soft-delete", authorize("partners.delete"), validatePartnerId, partnerController.softDeleteTransaction);
router.get("/:id/summary", authorize("partners.view"), validatePartnerId, partnerController.getSummary);

export default router;
