#!/usr/bin/env node
/**
 * Interactive Telegram login CLI (fallback when the in-panel OTP wizard is
 * not usable, e.g. behind a proxy, or for first-time bootstrap).
 *
 * Usage:
 *   npm run telegram:login
 *
 * Flow:
 *   1. Connects to Mongo using your normal .env.
 *   2. Lists existing telegram MessagingIntegrations, or lets you create one.
 *   3. Asks for apiId / apiHash / phone (skipped if already on the record).
 *   4. Sends the verification code via Telegram, prompts for the code.
 *   5. Prompts for 2FA password if Telegram requires it.
 *   6. Encrypts + saves the session string on the integration record so
 *      backend can send messages without re-logging in.
 *
 * NOTE: MESSAGING_ENCRYPTION_KEY must be set in .env BEFORE running this.
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import readline from "node:readline";
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import MessagingIntegration from "../models/messagingIntegration.js";
import { encrypt, decrypt, isEncryptionAvailable } from "../util/crypto.js";

dotenv.config({ quiet: true });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const ask = (q, { mask = false } = {}) =>
  new Promise((resolve) => {
    if (!mask) {
      rl.question(q, (a) => resolve((a || "").trim()));
      return;
    }
    // Best-effort masked input (terminal may still echo on Windows).
    const stdin = process.stdin;
    const onData = (char) => {
      const c = char.toString();
      if (c === "\n" || c === "\r" || c === "\u0004") {
        process.stdout.write("\n");
        stdin.removeListener("data", onData);
      } else {
        process.stdout.write("*");
      }
    };
    stdin.on("data", onData);
    rl.question(q, (a) => {
      stdin.removeListener("data", onData);
      resolve((a || "").trim());
    });
  });

const exitWith = async (msg, code = 0) => {
  if (msg) console.log(msg);
  try {
    rl.close();
  } catch {
    /* ignore */
  }
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(code);
};

async function pickOrCreateIntegration() {
  const list = await MessagingIntegration.find({
    type: "telegram",
    isDeleted: false,
  })
    .select("_id name telegram.phoneNumber telegram.connected isActive")
    .lean();

  console.log("\nExisting Telegram integrations:");
  if (list.length === 0) {
    console.log("  (none)");
  } else {
    list.forEach((it, idx) => {
      console.log(
        `  [${idx + 1}] ${it.name}  phone=${it.telegram?.phoneNumber || "—"}  connected=${
          it.telegram?.connected ? "yes" : "no"
        }`,
      );
    });
  }
  console.log(`  [n] Create a new integration`);

  const choice = await ask("Select [number/n]: ");
  if (choice.toLowerCase() === "n" || !choice) {
    const name = await ask("Name (e.g. 'Sales Telegram'): ");
    if (!name) await exitWith("Name is required.", 1);
    const created = await MessagingIntegration.create({
      type: "telegram",
      name,
      provider: "mtproto",
    });
    console.log(`Created new integration ${created._id}.`);
    return created;
  }
  const idx = Number(choice) - 1;
  if (Number.isNaN(idx) || !list[idx]) {
    await exitWith("Invalid selection.", 1);
  }
  return MessagingIntegration.findById(list[idx]._id);
}

async function run() {
  const mongoUri =
    process.env.MONGO_URL ||
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    process.env.DATABASE_URL;
  if (!mongoUri) {
    await exitWith(
      "Mongo URI is required. Set MONGO_URL / MONGODB_URI / MONGO_URI / DATABASE_URL in your .env.",
      1,
    );
  }
  if (!isEncryptionAvailable()) {
    await exitWith(
      "MESSAGING_ENCRYPTION_KEY is not set in .env. Generate one with: openssl rand -hex 32",
      1,
    );
  }
  await mongoose.connect(mongoUri);

  const integration = await pickOrCreateIntegration();
  integration.telegram = integration.telegram || {};

  let apiId = integration.telegram.apiId;
  if (!apiId) {
    const raw = await ask("apiId (number, from https://my.telegram.org): ");
    apiId = Number(raw);
    if (!Number.isFinite(apiId) || apiId <= 0) {
      await exitWith("apiId must be a positive integer.", 1);
    }
    integration.telegram.apiId = apiId;
  }

  let apiHash = "";
  if (integration.telegram.apiHash) {
    try {
      apiHash = decrypt(integration.telegram.apiHash);
    } catch (err) {
      console.warn(
        `Could not decrypt stored apiHash (${err.message}). You'll be asked to enter it again.`,
      );
    }
  }
  if (!apiHash) {
    apiHash = await ask("apiHash (string, from https://my.telegram.org): ", {
      mask: true,
    });
    if (!apiHash) await exitWith("apiHash is required.", 1);
    integration.telegram.apiHash = encrypt(apiHash);
  }

  let phoneNumber = integration.telegram.phoneNumber;
  if (!phoneNumber) {
    phoneNumber = await ask(
      "Phone number (with country code, e.g. +919876543210): ",
    );
    if (!phoneNumber) await exitWith("Phone number is required.", 1);
    integration.telegram.phoneNumber = phoneNumber;
  }

  integration.markModified("telegram");
  await integration.save();

  console.log(`\nConnecting to Telegram as ${phoneNumber}...`);
  const session = new StringSession("");
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 3,
    deviceModel: "Pragalbh Panel CLI",
    systemVersion: "1.0",
    appVersion: "1.0",
    useWSS: true,
  });

  try {
    await client.start({
      phoneNumber: async () => phoneNumber,
      phoneCode: async () => ask("Enter the code Telegram just sent: "),
      password: async (hint) =>
        ask(
          `Two-factor password${hint ? ` (hint: ${hint})` : ""}: `,
          { mask: true },
        ),
      onError: (err) => {
        console.error("Telegram auth error:", err?.message || err);
      },
    });

    const sessionString = client.session.save();
    integration.telegram.sessionString = encrypt(sessionString);
    integration.telegram.connected = true;
    integration.telegram.lastConnectedAt = new Date();
    integration.markModified("telegram");
    await integration.save();

    console.log("\n✓ Telegram login successful. Session saved to the integration record.");
    console.log(
      "  You can now send messages from the panel using this integration.",
    );
  } catch (err) {
    console.error("\nLogin failed:", err?.message || err);
    process.exitCode = 1;
  } finally {
    try {
      await client.disconnect();
    } catch {
      /* ignore */
    }
    await exitWith("");
  }
}

run().catch(async (err) => {
  console.error("Unexpected error:", err);
  await exitWith("", 1);
});
