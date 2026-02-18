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

const router = express.Router();

router.get("/", partnerController.listPartners);
router.post("/", validateCreatePartner, partnerController.createPartner);
router.get("/:id", validatePartnerId, partnerController.getPartnerById);
router.put("/:id", validateUpdatePartner, partnerController.updatePartner);

router.post("/:id/invest", validateInvest, partnerController.invest);
router.post("/:id/withdraw", validateWithdraw, partnerController.withdraw);
router.post("/:id/adjust", validateAdjust, partnerController.adjust);

router.get("/:id/transactions", validatePartnerId, partnerController.getTransactions);
router.get("/:id/summary", validatePartnerId, partnerController.getSummary);

export default router;
