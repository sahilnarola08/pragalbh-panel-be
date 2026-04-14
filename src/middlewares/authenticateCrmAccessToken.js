import { crmLocalAuthService } from "../services/crmLocalAuthService.js";

const extractBearer = (req) => {
  const auth = req.headers.authorization || "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return "";
};

const extractCookie = (req, key) => {
  const raw = req.headers.cookie || "";
  if (!raw) return "";
  const tokens = raw.split(";").map((c) => c.trim());
  const match = tokens.find((c) => c.startsWith(`${key}=`));
  if (!match) return "";
  return decodeURIComponent(match.split("=").slice(1).join("="));
};

export const authenticateCrmAccessToken = (req, res, next) => {
  try {
    const token = extractBearer(req);
    if (!token) {
      return res.status(401).json({
        success: false,
        status: 401,
        message: "CRM access token required",
        data: null,
      });
    }
    const payload = crmLocalAuthService.verifyAccessToken(token);
    req.crmAuth = payload;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      status: 401,
      message: error.message || "Invalid CRM access token",
      data: null,
    });
  }
};

export const getRefreshTokenFromRequest = (req) =>
  extractCookie(req, crmLocalAuthService.getRefreshCookieName());
