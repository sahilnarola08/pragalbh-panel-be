import express from "express";
import messagingIntegrationController from "../controllers/messagingIntegrationController.js";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";
import { authorizeAny } from "../middlewares/authorize.js";

const router = express.Router();

router.use(authenticateJWT);

router.get(
  "/",
  authorizeAny(["messaging.view", "messaging.manage", "settings.manage"]),
  messagingIntegrationController.list,
);

router.get(
  "/:id",
  authorizeAny(["messaging.view", "messaging.manage", "settings.manage"]),
  messagingIntegrationController.getById,
);

router.post(
  "/",
  authorizeAny(["messaging.manage", "settings.manage"]),
  messagingIntegrationController.create,
);

router.put(
  "/:id",
  authorizeAny(["messaging.manage", "settings.manage"]),
  messagingIntegrationController.update,
);

router.delete(
  "/:id",
  authorizeAny(["messaging.manage", "settings.manage"]),
  messagingIntegrationController.remove,
);

router.post(
  "/:id/test",
  authorizeAny(["messaging.manage", "settings.manage"]),
  messagingIntegrationController.sendTest,
);

router.post(
  "/:id/telegram/send-code",
  authorizeAny(["messaging.manage", "settings.manage"]),
  messagingIntegrationController.telegramSendCode,
);

router.post(
  "/:id/telegram/verify-code",
  authorizeAny(["messaging.manage", "settings.manage"]),
  messagingIntegrationController.telegramVerifyCode,
);

router.post(
  "/:id/telegram/disconnect",
  authorizeAny(["messaging.manage", "settings.manage"]),
  messagingIntegrationController.telegramDisconnect,
);

export default router;
