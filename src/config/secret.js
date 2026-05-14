export const secret = {
  port: process.env.PORT,
  nodeEnv: process.env.NODE_ENV,
  mongoUri: process.env.MONGO_URI,
  tokenSecret: process.env.TOKEN_SECRET,
  jwtSecretForVerify: process.env.JWT_SECRET_FOR_VERIFY,
  emailService: process.env.SERVICE,
  emailUser: process.env.EMAIL_USER,
  emailPass: process.env.EMAIL_PASS,
  emailPort: process.env.EMAIL_PORT,
  stripeKey: process.env.STRIPE_KEY,
  storeUrl: process.env.STORE_URL,
  adminUrl: process.env.ADMIN_URL,
  baseUrl: process.env.BASE_URL,
  razorpayIdKey: process.env.RAZORPAY_ID_KEY,
  razorpaySecretKey: process.env.RAZORPAY_SECRET_KEY,
  adminNotificationRoles: process.env.ADMIN_NOTIFICATION_ROLES,
  /**
   * When false, Dispatch / Updated tracking / Review customer messages (WhatsApp, Telegram, email) are not sent.
   * Set ORDER_LIFECYCLE_NOTIFY_ENABLED=false (or 0) to disable. Unset defaults to enabled.
   */
  orderLifecycleNotifyEnabled: (() => {
    const v = process.env.ORDER_LIFECYCLE_NOTIFY_ENABLED;
    if (v === undefined || v === null || String(v).trim() === "") return true;
    return !/^(0|false|no|off)$/i.test(String(v).trim());
  })(),
};
