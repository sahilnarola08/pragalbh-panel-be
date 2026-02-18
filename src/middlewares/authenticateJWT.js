import jwt from "jsonwebtoken";
import Auth from "../models/auth.js";
import { secret } from "../config/secret.js";
import { sendErrorResponse } from "../util/commonResponses.js";
import * as loginSessionService from "../services/loginSessionService.js";

const tokenSecret = secret?.tokenSecret || process.env.TOKEN_SECRET || "default-secret-key";

export async function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return sendErrorResponse({ status: 401, res, message: "Access token required" });
  }

  try {
    const decoded = jwt.verify(token, tokenSecret);
    if (decoded.sessionId) {
      const exists = await loginSessionService.sessionExists(decoded.sessionId);
      if (!exists) {
        return sendErrorResponse({ status: 401, res, message: "Session revoked or expired" });
      }
      loginSessionService.refreshLastActive(decoded.sessionId).catch(() => {});
    }
    const user = await Auth.findById(decoded.id)
      .select("-password")
      .populate("roleId", "name permissions");
    if (!user) {
      return sendErrorResponse({ status: 401, res, message: "User not found" });
    }
    if (!user.isActive || user.isDeleted) {
      return sendErrorResponse({ status: 403, res, message: "Account deactivated or deleted" });
    }
    req.user = user;
    next();
  } catch {
    return sendErrorResponse({ status: 401, res, message: "Invalid or expired token" });
  }
}
