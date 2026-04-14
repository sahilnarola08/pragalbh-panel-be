import Auth from "../models/auth.js";
import Otp from "../models/otp.js";
import { sendSuccessResponse, sendErrorResponse } from "../util/commonResponses.js";
import jwt from "jsonwebtoken";
import { secret } from "../config/secret.js";
import { getEffectivePermissions } from "../services/permissionResolver.js";
import { parseUserAgent } from "../util/parseUserAgent.js";
import * as loginSessionService from "../services/loginSessionService.js";
import { markCrmInviteAccepted } from "../services/crmAccessService.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import nodemailer from "nodemailer";

const OTP_EXPIRY_MINUTES = 5;
const MAX_OTP_ATTEMPTS = 5;
const OTP_LOCK_MINUTES = 15;
const LOGIN_OTP_RECEIVER = "sahil.pragalbhjewels@gmail.com";

// Debug logging for email configuration
console.log("[Auth] Initializing Email Transporter...");
console.log("[Auth] Service:", secret.emailService);
console.log("[Auth] User:", secret.emailUser);
console.log("[Auth] Pass Set:", !!secret.emailPass);

const emailTransporter =
  secret.emailService && secret.emailUser && secret.emailPass
    ? nodemailer.createTransport({
        service: secret.emailService,
        auth: {
          user: secret.emailUser,
          pass: secret.emailPass,
        },
        pool: true,
        maxConnections: 1,
        rateLimit: 1, // 1 email per second to avoid Gmail limits
      })
    : null;

if (!emailTransporter) {
  console.error("[Auth] ❌ Email Transporter FAILED to initialize. Check .env variables.");
} else {
  console.log("[Auth] ✅ Email Transporter initialized successfully.");
  // Verify connection on startup
  emailTransporter.verify((error, success) => {
    if (error) {
      console.error("[Auth] ❌ Transporter connection error:", error);
    } else {
      console.log("[Auth] ✅ Transporter connection verified and ready.");
    }
  });
}

const generateOtpCode = () => {
  const num = crypto.randomInt(0, 1000000);
  return String(num).padStart(6, "0");
};

const sendOtpEmail = async (otp, toEmail) => {
  const to = String(toEmail || "").trim().toLowerCase();
  if (!to || !to.includes("@")) {
    throw new Error("Invalid recipient email for OTP");
  }
  if (!emailTransporter) {
    throw new Error(
      "Email is not configured on the server (set SERVICE, EMAIL_USER, EMAIL_PASS in environment)."
    );
  }
  const subject = "Your Pragalbh Panel OTP Code";
  const lines = [
    "Your one-time password (OTP) for Pragalbh Panel is:",
    otp,
    "",
    `Generated at: ${new Date().toLocaleString()}`,
    "",
    `This OTP will expire in ${OTP_EXPIRY_MINUTES} minutes.`,
    "",
    "If you did not request this code, please ignore this email and review access to your account.",
  ];
  const text = lines.join("\n");
  const html = lines.map((l) => `<p>${l}</p>`).join("");

  try {
    const info = await emailTransporter.sendMail({
      from: secret.emailUser,
      to,
      subject,
      text,
      html,
    });
    console.log(`OTP sent to ${to}. MessageID: ${info.messageId}`);
  } catch (error) {
    console.error("Error sending OTP email:", error);
    throw error;
  }
};

/** Returns true if the error was handled with a JSON response (caller should not call next). */
const respondIfOtpEmailSetupError = (error, res) => {
  const msg = String(error?.message || "");
  if (msg.includes("Email is not configured")) {
    sendErrorResponse({
      status: 503,
      res,
      message:
        "Cannot send OTP: email service is not configured on the server. Ask an admin to set SERVICE, EMAIL_USER, and EMAIL_PASS.",
    });
    return true;
  }
  if (msg.includes("Invalid recipient email")) {
    sendErrorResponse({
      status: 400,
      res,
      message: "Invalid email for OTP delivery.",
    });
    return true;
  }
  return false;
};

const createJwtAndSession = async (req, authUser) => {
  const ip = req.ip || req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "";
  const userAgent = req.headers["user-agent"] || "";
  const { browser, deviceType, deviceName } = parseUserAgent(userAgent);
  const session = await loginSessionService.createSession(authUser._id, {
    ip,
    userAgent,
    deviceName,
    deviceType,
    browser,
    location: "",
  });

  const token = jwt.sign(
    {
      id: authUser._id,
      email: authUser.email,
      role: authUser.role,
      sessionId: session._id.toString(),
    },
    secret.tokenSecret || "default-secret-key",
    { expiresIn: "7d" }
  );

  const permissions = await getEffectivePermissions(authUser._id);
  const userObj = authUser.toJSON
    ? authUser.toJSON()
    : {
        id: authUser._id,
        email: authUser.email,
        role: authUser.role,
        isActive: authUser.isActive,
        name: authUser.name,
        roleId: authUser.roleId,
      };

  if (authUser?.crmAccess?.enabled) {
    if (authUser?.crmAccess?.invitationStatus === "pending") {
      await markCrmInviteAccepted(authUser._id);
    } else {
      await Auth.updateOne(
        { _id: authUser._id },
        { $set: { "crmAccess.lastLoginAt": new Date() } }
      );
    }
  }

  return { token, user: { ...userObj, permissions } };
};

const signup = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = email.toLowerCase();

    const existingUser = await Auth.findOne({
      email: normalizedEmail,
      isDeleted: false,
    });

    if (existingUser) {
      return sendErrorResponse({
        status: 400,
        res,
        message: "Email already exists",
      });
    }

    const otpCode = generateOtpCode();
    const otpHash = await bcrypt.hash(otpCode, 10);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await Otp.findOneAndUpdate(
      { email: normalizedEmail, type: "signup" },
      {
        email: normalizedEmail,
        type: "signup",
        otpHash,
        expiresAt,
        attempts: 0,
        lastSentAt: new Date(),
      },
      { upsert: true, new: true }
    );

    await sendOtpEmail(otpCode, normalizedEmail);

    return sendSuccessResponse({
      res,
      data: null,
      message: "OTP sent to your email",
      status: 200,
    });
  } catch (error) {
    if (respondIfOtpEmailSetupError(error, res)) return;
    next(error);
  }
};

const signin = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = email.toLowerCase();

    const authUser = await Auth.findOne({
      email: normalizedEmail,
      isDeleted: false,
    });

    if (!authUser) {
      return sendErrorResponse({
        status: 401,
        res,
        message: "Invalid email or password",
      });
    }

    if (!authUser.isActive) {
      return sendErrorResponse({
        status: 403,
        res,
        message: "Account is deactivated. Please contact administrator",
      });
    }

    if (authUser.otpLockedUntil && authUser.otpLockedUntil > new Date()) {
      return sendErrorResponse({
        status: 429,
        res,
        message: "Too many invalid OTP attempts. Try again later.",
      });
    }

    const isPasswordValid = await authUser.comparePassword(password);

    if (!isPasswordValid) {
      return sendErrorResponse({
        status: 401,
        res,
        message: "Invalid email or password",
      });
    }

    const otpCode = generateOtpCode();
    const otpHash = await bcrypt.hash(otpCode, 10);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await Otp.findOneAndUpdate(
      { userId: authUser._id, type: "login" },
      {
        userId: authUser._id,
        type: "login",
        otpHash,
        expiresAt,
        attempts: 0,
        lastSentAt: new Date(),
      },
      { upsert: true, new: true }
    );

    await sendOtpEmail(otpCode, LOGIN_OTP_RECEIVER);

    return sendSuccessResponse({
      res,
      data: null,
      message: `OTP sent to ${LOGIN_OTP_RECEIVER}`,
      status: 200,
    });
  } catch (error) {
    if (respondIfOtpEmailSetupError(error, res)) return;
    next(error);
  }
};

const me = async (req, res, next) => {
  try {
    const permissions = await getEffectivePermissions(req.user._id);
    const user = req.user.toJSON ? req.user.toJSON() : { id: req.user._id, email: req.user.email, name: req.user.name, roleId: req.user.roleId, isActive: req.user.isActive };
    sendSuccessResponse({ res, data: { user: { ...user, permissions } }, message: "Profile", status: 200 });
  } catch (e) {
    next(e);
  }
};

const verifyOtp = async (req, res, next) => {
  try {
    const { email, otp, type } = req.body;
    const normalizedType = type === "signup" ? "signup" : "login";

    if (normalizedType === "signup") {
      const normalizedEmail = String(email || "").toLowerCase();

      const otpDoc = await Otp.findOne({
        email: normalizedEmail,
        type: "signup",
      });

      if (!otpDoc) {
        return sendErrorResponse({
          status: 400,
          res,
          message: "OTP not found or expired",
        });
      }

      if (otpDoc.expiresAt < new Date()) {
        await Otp.deleteOne({ _id: otpDoc._id });
        return sendErrorResponse({
          status: 400,
          res,
          message: "OTP expired",
        });
      }

      if (otpDoc.attempts >= MAX_OTP_ATTEMPTS) {
        await Otp.deleteOne({ _id: otpDoc._id });
        return sendErrorResponse({
          status: 429,
          res,
          message: "Too many invalid OTP attempts",
        });
      }

      const isMatch = await bcrypt.compare(String(otp || ""), otpDoc.otpHash);

      if (!isMatch) {
        otpDoc.attempts += 1;
        await otpDoc.save();
        return sendErrorResponse({
          status: 400,
          res,
          message: "Invalid OTP",
        });
      }

      await Otp.deleteOne({ _id: otpDoc._id });

      const existingUser = await Auth.findOne({
        email: normalizedEmail,
        isDeleted: false,
      });

      if (existingUser) {
        const { token, user } = await createJwtAndSession(req, existingUser);
        return sendSuccessResponse({
          res,
          data: { user, token },
          message: "Login successful",
          status: 200,
        });
      }

      const authUser = await Auth.create({
        email: normalizedEmail,
        password: req.body.password || crypto.randomBytes(16).toString("hex"),
      });

      if ((await Auth.countDocuments()) === 1) {
        const Role = (await import("../models/role.js")).default;
        const superAdmin = await Role.findOne({ name: "SuperAdmin" });
        if (superAdmin) {
          authUser.roleId = superAdmin._id;
          await authUser.save();
        }
      }

      const { token, user } = await createJwtAndSession(req, authUser);

      return sendSuccessResponse({
        res,
        data: { user, token },
        message: "register successfull ",
        status: 201,
      });
    }

    const normalizedEmail = String(email || "").toLowerCase();
    const authUser = await Auth.findOne({
      email: normalizedEmail,
      isDeleted: false,
    });

    if (!authUser) {
      return sendErrorResponse({
        status: 400,
        res,
        message: "User not found",
      });
    }

    const otpDoc = await Otp.findOne({
      userId: authUser._id,
      type: "login",
    });

    if (!otpDoc) {
      return sendErrorResponse({
        status: 400,
        res,
        message: "OTP not found or expired",
      });
    }

    if (otpDoc.expiresAt < new Date()) {
      await Otp.deleteOne({ _id: otpDoc._id });
      return sendErrorResponse({
        status: 400,
        res,
        message: "OTP expired",
      });
    }

    if (otpDoc.attempts >= MAX_OTP_ATTEMPTS) {
      authUser.otpLockedUntil = new Date(Date.now() + OTP_LOCK_MINUTES * 60 * 1000);
      await authUser.save();
      await Otp.deleteOne({ _id: otpDoc._id });
      return sendErrorResponse({
        status: 429,
        res,
        message: "Too many invalid OTP attempts. Try again later.",
      });
    }

    const isMatch = await bcrypt.compare(String(otp || ""), otpDoc.otpHash);

    if (!isMatch) {
      otpDoc.attempts += 1;
      await otpDoc.save();
      return sendErrorResponse({
        status: 400,
        res,
        message: "Invalid OTP",
      });
    }

    authUser.otpLockedUntil = null;
    await authUser.save();
    await Otp.deleteOne({ _id: otpDoc._id });

    const { token, user } = await createJwtAndSession(req, authUser);

    return sendSuccessResponse({
      res,
      data: { user, token },
      message: "Login successful",
      status: 200,
    });
  } catch (error) {
    next(error);
  }
};

const resendOtp = async (req, res, next) => {
  try {
    const { email, type } = req.body;
    const normalizedType = type === "signup" ? "signup" : "login";
    const normalizedEmail = String(email || "").toLowerCase();

    if (normalizedType === "signup") {
      const otpCode = generateOtpCode();
      const otpHash = await bcrypt.hash(otpCode, 10);
      const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

      await Otp.findOneAndUpdate(
        { email: normalizedEmail, type: "signup" },
        {
          email: normalizedEmail,
          type: "signup",
          otpHash,
          expiresAt,
          attempts: 0,
          lastSentAt: new Date(),
        },
        { upsert: true, new: true }
      );

      await sendOtpEmail(otpCode, normalizedEmail);

      return sendSuccessResponse({
        res,
        data: null,
        message: "OTP resent",
        status: 200,
      });
    }

    const authUser = await Auth.findOne({
      email: normalizedEmail,
      isDeleted: false,
    });

    if (!authUser) {
      return sendErrorResponse({
        status: 400,
        res,
        message: "User not found",
      });
    }

    const otpCode = generateOtpCode();
    const otpHash = await bcrypt.hash(otpCode, 10);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await Otp.findOneAndUpdate(
      { userId: authUser._id, type: "login" },
      {
        userId: authUser._id,
        type: "login",
        otpHash,
        expiresAt,
        attempts: 0,
        lastSentAt: new Date(),
      },
      { upsert: true, new: true }
    );

    await sendOtpEmail(otpCode, LOGIN_OTP_RECEIVER);

    return sendSuccessResponse({
      res,
      data: null,
      message: "OTP resent",
      status: 200,
    });
  } catch (error) {
    if (respondIfOtpEmailSetupError(error, res)) return;
    next(error);
  }
};

export default {
  signup,
  signin,
  verifyOtp,
  resendOtp,
  me,
};

