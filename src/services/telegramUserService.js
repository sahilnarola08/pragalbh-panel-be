import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import MessagingIntegration from "../models/messagingIntegration.js";
import { encrypt, decrypt, isEncryptionAvailable } from "../util/crypto.js";

/**
 * Telegram User-API service backed by GramJS (MTProto).
 *
 * Responsibilities:
 *   - One-time login flow (sendCode → verifyCode, with 2FA support).
 *   - Persistent client cache so subsequent sends reuse the same connection.
 *   - Recipient resolution: prefer telegramUsername, fall back to phone via
 *     contacts.ImportContacts.
 *   - Built-in safety rate-limiter: serializes sends per-integration with a
 *     minimum gap (3s) and a hard cap (20 msgs/min). On FLOOD_WAIT_X errors,
 *     the queue is paused for the suggested duration and the send is retried
 *     once. This keeps usage well below Telegram's spam thresholds for
 *     transactional invoices.
 */

const MIN_GAP_MS = 3000;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_WINDOW = 20;
const LOGIN_CACHE_TTL_MS = 10 * 60 * 1000;
const CONNECT_TIMEOUT_MS = 30_000;

/** integrationId -> { client, lastUsedAt } (post-login, send-ready) */
const clientCache = new Map();
/** integrationId -> { client, phoneCodeHash, expiresAt } (transient login state) */
const loginCache = new Map();
/** integrationId -> { queueChain, windowStart, count, nextAvailableAt } */
const rateState = new Map();

const idKey = (integrationId) => String(integrationId);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ensureKey = () => {
  if (!isEncryptionAvailable()) {
    throw new Error(
      "MESSAGING_ENCRYPTION_KEY is not configured. Set it in your .env to use Telegram integrations.",
    );
  }
};

const buildSessionString = (encryptedSession) => {
  if (!encryptedSession) return "";
  try {
    return decrypt(encryptedSession);
  } catch (err) {
    throw new Error(
      `Failed to decrypt Telegram session: ${err.message}. The MESSAGING_ENCRYPTION_KEY may have changed.`,
    );
  }
};

const buildClient = ({ apiId, apiHash, sessionString = "" }) => {
  const session = new StringSession(sessionString || "");
  return new TelegramClient(session, Number(apiId), String(apiHash), {
    connectionRetries: 3,
    requestRetries: 2,
    floodSleepThreshold: 0, // we handle flood waits ourselves
    deviceModel: "Pragalbh Panel",
    systemVersion: "1.0",
    appVersion: "1.0",
    useWSS: true,
  });
};

const getStoredCredentials = (integration) => {
  ensureKey();
  if (!integration?.telegram) {
    throw new Error("Integration has no telegram configuration.");
  }
  const apiId = Number(integration.telegram.apiId);
  if (!apiId) {
    throw new Error("Telegram apiId is not set on this integration.");
  }
  let apiHash;
  try {
    apiHash = decrypt(integration.telegram.apiHash);
  } catch (err) {
    throw new Error(
      `Failed to decrypt Telegram apiHash: ${err.message}. The MESSAGING_ENCRYPTION_KEY may have changed.`,
    );
  }
  if (!apiHash) {
    throw new Error("Telegram apiHash is not set on this integration.");
  }
  return { apiId, apiHash };
};

const evictLoginCache = (integrationId) => {
  const entry = loginCache.get(idKey(integrationId));
  if (!entry) return;
  try {
    if (entry.client?.connected) entry.client.disconnect().catch(() => {});
  } catch {
    /* ignore */
  }
  loginCache.delete(idKey(integrationId));
};

const purgeExpiredLogins = () => {
  const now = Date.now();
  for (const [key, value] of loginCache.entries()) {
    if (value.expiresAt && value.expiresAt < now) {
      try {
        if (value.client?.connected)
          value.client.disconnect().catch(() => {});
      } catch {
        /* ignore */
      }
      loginCache.delete(key);
    }
  }
};

/**
 * Step 1 of login: send a verification code to the admin's phone.
 * Stores a transient client in memory keyed by integrationId; the same client
 * MUST be used for verifyCode to complete sign-in.
 */
export async function sendLoginCode({
  integrationId,
  apiId,
  apiHash,
  phoneNumber,
}) {
  ensureKey();
  if (!integrationId) throw new Error("integrationId is required.");
  if (!apiId || !apiHash) throw new Error("apiId and apiHash are required.");
  if (!phoneNumber) throw new Error("phoneNumber is required.");

  purgeExpiredLogins();
  evictLoginCache(integrationId);

  const client = buildClient({ apiId, apiHash, sessionString: "" });
  await client.connect();

  const result = await client.sendCode(
    { apiId: Number(apiId), apiHash: String(apiHash) },
    String(phoneNumber),
  );

  loginCache.set(idKey(integrationId), {
    client,
    phoneCodeHash: result.phoneCodeHash,
    phoneNumber: String(phoneNumber),
    expiresAt: Date.now() + LOGIN_CACHE_TTL_MS,
  });

  return { phoneCodeHash: result.phoneCodeHash };
}

/**
 * Step 2 of login: complete sign-in with the code (and optionally a 2FA
 * password). Returns the session string; the caller should encrypt + persist
 * it on the integration record.
 */
export async function verifyLoginCode({
  integrationId,
  phoneCode,
  password,
}) {
  ensureKey();
  if (!integrationId) throw new Error("integrationId is required.");
  if (!phoneCode) throw new Error("phoneCode is required.");

  purgeExpiredLogins();
  const entry = loginCache.get(idKey(integrationId));
  if (!entry) {
    throw new Error(
      "Login session expired. Please request a new code (the OTP is valid for ~10 minutes).",
    );
  }

  const { client, phoneCodeHash, phoneNumber } = entry;
  try {
    await client.invoke(
      new Api.auth.SignIn({
        phoneNumber,
        phoneCodeHash,
        phoneCode: String(phoneCode),
      }),
    );
  } catch (err) {
    const msg = String(err?.errorMessage || err?.message || "");
    if (msg.includes("SESSION_PASSWORD_NEEDED")) {
      if (!password) {
        return { passwordNeeded: true };
      }
      await client.signInWithPassword(
        {
          apiId: client.apiId,
          apiHash: client.apiHash,
        },
        {
          password: async () => String(password),
          onError: (e) => {
            throw e;
          },
        },
      );
    } else {
      throw err;
    }
  }

  const sessionString = client.session.save();
  // We keep the client connected and promote it to the live cache so the
  // first send doesn't have to re-login.
  clientCache.set(idKey(integrationId), { client, lastUsedAt: Date.now() });
  loginCache.delete(idKey(integrationId));
  return { sessionString };
}

/** Disconnect + forget the cached client for an integration. */
export async function disconnectClient(integrationId) {
  const entry = clientCache.get(idKey(integrationId));
  if (entry?.client) {
    try {
      if (entry.client.connected) await entry.client.disconnect();
    } catch {
      /* ignore */
    }
  }
  clientCache.delete(idKey(integrationId));
  evictLoginCache(integrationId);
}

const getOrConnectClient = async (integration) => {
  const key = idKey(integration._id);
  const cached = clientCache.get(key);
  if (cached?.client?.connected) {
    cached.lastUsedAt = Date.now();
    return cached.client;
  }

  if (!integration.telegram?.sessionString) {
    throw new Error(
      "Telegram is not connected for this integration. Use the Connect wizard or the CLI script first.",
    );
  }

  const { apiId, apiHash } = getStoredCredentials(integration);
  const sessionString = buildSessionString(integration.telegram.sessionString);

  const client = buildClient({ apiId, apiHash, sessionString });
  const connectPromise = client.connect();
  await Promise.race([
    connectPromise,
    sleep(CONNECT_TIMEOUT_MS).then(() => {
      throw new Error("Timed out connecting to Telegram.");
    }),
  ]);

  // Validate session is still valid (will throw if revoked)
  try {
    await client.getMe();
  } catch (err) {
    const msg = String(err?.errorMessage || err?.message || "");
    if (
      msg.includes("AUTH_KEY_UNREGISTERED") ||
      msg.includes("SESSION_REVOKED") ||
      msg.includes("USER_DEACTIVATED")
    ) {
      try {
        if (client.connected) await client.disconnect();
      } catch {
        /* ignore */
      }
      // Auto-mark the integration as disconnected so the UI re-prompts.
      try {
        await MessagingIntegration.updateOne(
          { _id: integration._id },
          {
            $set: {
              "telegram.connected": false,
              "telegram.sessionString": "",
            },
          },
        );
      } catch {
        /* ignore */
      }
      throw new Error(
        "Telegram session was revoked. Please reconnect this integration.",
      );
    }
    throw err;
  }

  clientCache.set(key, { client, lastUsedAt: Date.now() });
  return client;
};

/**
 * Per-integration rate limiter. Returns a promise that resolves once it is
 * safe to issue the next send. Serializes all sends for one integration.
 */
const acquireRateSlot = async (integrationId) => {
  const key = idKey(integrationId);
  let state = rateState.get(key);
  if (!state) {
    state = {
      queueChain: Promise.resolve(),
      windowStart: 0,
      count: 0,
      lastSendAt: 0,
      nextAvailableAt: 0,
    };
    rateState.set(key, state);
  }

  const slot = state.queueChain.then(async () => {
    const now = Date.now();

    // Hard wait if FLOOD_WAIT set a future availability time.
    if (state.nextAvailableAt > now) {
      await sleep(state.nextAvailableAt - now);
    }

    // Reset window if expired.
    if (now - state.windowStart > RATE_WINDOW_MS) {
      state.windowStart = now;
      state.count = 0;
    }

    // Enforce window cap.
    if (state.count >= RATE_MAX_PER_WINDOW) {
      const waitMs = RATE_WINDOW_MS - (now - state.windowStart);
      if (waitMs > 0) await sleep(waitMs);
      state.windowStart = Date.now();
      state.count = 0;
    }

    // Enforce minimum gap between sends.
    const gap = Date.now() - state.lastSendAt;
    if (gap < MIN_GAP_MS) await sleep(MIN_GAP_MS - gap);

    state.lastSendAt = Date.now();
    state.count += 1;
  });

  state.queueChain = slot.catch(() => undefined);
  return slot;
};

const reportFloodWait = (integrationId, seconds) => {
  const key = idKey(integrationId);
  const state = rateState.get(key);
  if (!state) return;
  state.nextAvailableAt = Date.now() + (Number(seconds) || 0) * 1000;
};

const friendlyError = (err) => {
  const raw = String(err?.errorMessage || err?.message || err);
  if (raw.includes("USERNAME_NOT_OCCUPIED"))
    return "That Telegram username does not exist.";
  if (raw.includes("USERNAME_INVALID"))
    return "Invalid Telegram username format.";
  if (raw.includes("USER_PRIVACY_RESTRICTED"))
    return "This Telegram user's privacy settings prevent receiving messages from you.";
  if (raw.includes("PHONE_NOT_OCCUPIED"))
    return "No Telegram account is registered for that phone number.";
  if (raw.includes("PEER_FLOOD"))
    return "Telegram has temporarily restricted your account for sending too many messages to unknown users. Try again later.";
  if (raw.includes("AUTH_KEY_UNREGISTERED"))
    return "Telegram session was revoked. Please reconnect this integration.";
  if (raw.includes("FLOOD_WAIT_")) {
    const m = raw.match(/FLOOD_WAIT_(\d+)/);
    const s = m ? Number(m[1]) : 0;
    return `Telegram asked us to slow down. Try again in ~${s} seconds.`;
  }
  return raw;
};

const resolveRecipient = async (
  client,
  { telegramUsername, contactNumber },
) => {
  const cleanUsername = String(telegramUsername || "")
    .trim()
    .replace(/^@+/, "");

  if (cleanUsername) {
    try {
      const entity = await client.getEntity(cleanUsername);
      if (entity) return entity;
    } catch (err) {
      const raw = String(err?.errorMessage || err?.message || "");
      if (!raw.includes("USERNAME_NOT_OCCUPIED") && !raw.includes("USERNAME_INVALID")) {
        throw err;
      }
      // fallthrough to phone fallback if username didn't resolve
    }
  }

  const cleanPhone = String(contactNumber || "").replace(/\D/g, "");
  if (cleanPhone.length >= 10) {
    const phoneWithCC =
      cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const result = await client.invoke(
      new Api.contacts.ImportContacts({
        contacts: [
          new Api.InputPhoneContact({
            clientId: Number(`${Date.now() % 1_000_000_000}`),
            phone: phoneWithCC,
            firstName: "Customer",
            lastName: "",
          }),
        ],
      }),
    );
    if (result?.users?.length > 0) {
      return result.users[0];
    }
  }

  throw new Error(
    "Could not resolve a Telegram recipient. Make sure the customer has a valid @username or a Telegram-registered phone number with permissive privacy settings.",
  );
};

/**
 * Send a text message via the integration's user account.
 *
 * @returns { ok, status, body } shape matching sendWhatsAppText for parity.
 */
export async function sendMessage(integration, {
  telegramUsername,
  contactNumber,
  message,
}) {
  if (!integration) {
    return {
      ok: false,
      status: 400,
      body: { message: "No Telegram integration provided." },
    };
  }
  if (!message || !String(message).trim()) {
    return {
      ok: false,
      status: 400,
      body: { message: "Message text is required." },
    };
  }
  if (!telegramUsername && !contactNumber) {
    return {
      ok: false,
      status: 400,
      body: {
        message:
          "Provide either a Telegram username or a phone number for the recipient.",
      },
    };
  }
  if (!integration.telegram?.connected) {
    return {
      ok: false,
      status: 400,
      body: {
        message:
          "This Telegram integration is not connected. Please complete the Connect Telegram flow first.",
      },
    };
  }

  await acquireRateSlot(integration._id);

  const doSend = async () => {
    const client = await getOrConnectClient(integration);
    const recipient = await resolveRecipient(client, {
      telegramUsername,
      contactNumber,
    });
    const sent = await client.sendMessage(recipient, {
      message: String(message),
      parseMode: "markdown",
    });
    return sent;
  };

  try {
    const sent = await doSend();
    return {
      ok: true,
      status: 200,
      body: {
        id: sent?.id || null,
        date: sent?.date || null,
      },
    };
  } catch (err) {
    const raw = String(err?.errorMessage || err?.message || "");
    if (raw.includes("FLOOD_WAIT_")) {
      const m = raw.match(/FLOOD_WAIT_(\d+)/);
      const seconds = m ? Number(m[1]) : 30;
      reportFloodWait(integration._id, seconds);
      // One retry after the wait, then surface the error if it still fails.
      if (seconds <= 60) {
        try {
          await sleep((seconds + 1) * 1000);
          const sent = await doSend();
          return {
            ok: true,
            status: 200,
            body: { id: sent?.id || null, date: sent?.date || null },
          };
        } catch (retryErr) {
          return {
            ok: false,
            status: 429,
            body: { message: friendlyError(retryErr) },
          };
        }
      }
      return {
        ok: false,
        status: 429,
        body: { message: friendlyError(err) },
      };
    }
    return {
      ok: false,
      status: 500,
      body: { message: friendlyError(err) },
    };
  }
}

/** For graceful shutdown: disconnect all cached clients. */
export async function shutdownAllClients() {
  const tasks = [];
  for (const [key, entry] of clientCache.entries()) {
    if (entry?.client?.connected) {
      tasks.push(entry.client.disconnect().catch(() => {}));
    }
    clientCache.delete(key);
  }
  for (const [key, entry] of loginCache.entries()) {
    if (entry?.client?.connected) {
      tasks.push(entry.client.disconnect().catch(() => {}));
    }
    loginCache.delete(key);
  }
  await Promise.all(tasks);
}

/** Helper for callers (controller / CLI): encrypt secrets before persisting. */
export const encryptTelegramSecret = (raw) => (raw ? encrypt(String(raw)) : "");
