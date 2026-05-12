import mongoose from "mongoose";

/**
 * Messaging integration: one configurable channel (e.g. a WhatsApp number, a
 * Telegram bot). The panel can have many — each can be routed to specific
 * order platforms (Amazon, Etsy, …) or marked as the default fallback.
 */
const messagingIntegrationSchema = new mongoose.Schema(
  {
    /** Channel kind. Use this to drive provider-specific behavior. */
    type: {
      type: String,
      enum: ["whatsapp", "telegram", "sms", "email", "other"],
      required: true,
      index: true,
    },
    /** Friendly label visible in admin UI, e.g. "Sales WhatsApp". */
    name: {
      type: String,
      required: true,
      trim: true,
    },
    /** API provider identifier (e.g. "deropo", "twilio", "telegram-bot"). */
    provider: {
      type: String,
      trim: true,
      default: "",
    },
    /** Base URL of the upstream API, e.g. https://api.deropo.com/api */
    apiBase: {
      type: String,
      trim: true,
      default: "",
    },
    /** Access token / API key for the upstream API. */
    accessToken: {
      type: String,
      trim: true,
      default: "",
    },
    /** Optional device identifier (Deropo allows multiple devices per token). */
    deviceId: {
      type: String,
      trim: true,
      default: "",
    },
    /** Optional sender number / username (Telegram chat id, WA phone). */
    senderIdentifier: {
      type: String,
      trim: true,
      default: "",
    },
    /** Optional platforms (master IDs) this integration serves. */
    platforms: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "master" }],
      default: [],
    },
    /** When true, this integration is used when no platform match is found. */
    isDefault: {
      type: Boolean,
      default: false,
      index: true,
    },
    /** When false, integration is skipped during routing. */
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    /** Provider-specific extra config (free-form). */
    extra: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    /**
     * Telegram-specific (MTProto / GramJS user-account) credentials.
     * All sensitive fields are encrypted at rest via util/crypto.js.
     */
    telegram: {
      apiId: { type: Number, default: null },
      apiHash: { type: String, default: "" },
      phoneNumber: { type: String, trim: true, default: "" },
      sessionString: { type: String, default: "" },
      twoFactorPassword: { type: String, default: "" },
      connected: { type: Boolean, default: false },
      lastConnectedAt: { type: Date, default: null },
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true },
);

messagingIntegrationSchema.index({ type: 1, isActive: 1, isDeleted: 1 });
messagingIntegrationSchema.index({ name: "text", description: "text" });

const MessagingIntegration = mongoose.model(
  "MessagingIntegration",
  messagingIntegrationSchema,
);

export default MessagingIntegration;
