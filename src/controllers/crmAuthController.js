import { crmPanelAdapter } from "../services/crmPanelAdapterService.js";
import { crmLocalAuthService } from "../services/crmLocalAuthService.js";
import { getRefreshTokenFromRequest } from "../middlewares/authenticateCrmAccessToken.js";
import CrmSession from "../models/crmSession.js";

const getRequestMeta = (req) => ({
  userAgent: req.headers["user-agent"] || "",
  deviceInfo: req.headers["x-device-info"] || "",
  ipAddress: req.ip || req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "",
});

const unwrapPanelData = (response) => response?.data ?? response;

const login = async (req, res, next) => {
  try {
    const payload = await crmPanelAdapter.signin({
      email: req.body?.email,
      password: req.body?.password,
    });
    return res.status(200).json({
      success: true,
      status: 200,
      message: payload?.message || "OTP sent",
      data: unwrapPanelData(payload),
    });
  } catch (error) {
    next(error);
  }
};

const verifyOtp = async (req, res, next) => {
  try {
    const payload = await crmPanelAdapter.verifyOtp({
      email: req.body?.email,
      otp: req.body?.otp,
      type: "login",
    });
    const verified = unwrapPanelData(payload);
    const panelAccessToken = verified?.token;
    const panelUser = verified?.user;

    if (!panelAccessToken || !panelUser) {
      return res.status(401).json({
        success: false,
        status: 401,
        message: "Panel authentication failed",
        data: null,
      });
    }

    const contract = await crmPanelAdapter.getCrmContract(panelAccessToken);
    const contractData = unwrapPanelData(contract);
    if (!contractData?.enabled) {
      return res.status(403).json({
        success: false,
        status: 403,
        message: "CRM access is not enabled for this user",
        data: contractData || null,
      });
    }

    const { accessToken, refreshToken, session } =
      await crmLocalAuthService.createSessionAndTokens({
        panelUser,
        panelAccessToken,
        ...getRequestMeta(req),
      });

    crmLocalAuthService.setRefreshCookie(res, refreshToken);
    return res.status(200).json({
      success: true,
      status: 200,
      message: "CRM login successful",
      data: {
        accessToken,
        sessionId: String(session._id),
        user: panelUser,
        contract: contractData,
      },
    });
  } catch (error) {
    next(error);
  }
};

const refresh = async (req, res, next) => {
  try {
    const refreshToken = getRefreshTokenFromRequest(req);
    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        status: 401,
        message: "Refresh token not found",
        data: null,
      });
    }

    const rotated = await crmLocalAuthService.rotateRefreshToken(refreshToken);
    const panelAccessToken = await crmLocalAuthService.getSessionPanelToken(rotated.session._id);
    const me = await crmPanelAdapter.getAuthMe(panelAccessToken);
    const meData = unwrapPanelData(me);

    crmLocalAuthService.setRefreshCookie(res, rotated.refreshToken);
    return res.status(200).json({
      success: true,
      status: 200,
      message: "Token refreshed",
      data: {
        accessToken: rotated.accessToken,
        user: meData?.user || null,
      },
    });
  } catch (error) {
    next(error);
  }
};

const me = async (req, res, next) => {
  try {
    const sessionId = req.crmAuth?.sid;
    const panelAccessToken = await crmLocalAuthService.getSessionPanelToken(sessionId);
    const [profile, contract] = await Promise.all([
      crmPanelAdapter.getAuthMe(panelAccessToken),
      crmPanelAdapter.getCrmContract(panelAccessToken),
    ]);

    return res.status(200).json({
      success: true,
      status: 200,
      message: "CRM profile",
      data: {
        user: unwrapPanelData(profile)?.user || null,
        contract: unwrapPanelData(contract) || null,
      },
    });
  } catch (error) {
    next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    const sessionId = req.crmAuth?.sid;
    await crmLocalAuthService.revokeSessionById(sessionId, "logout");
    crmLocalAuthService.clearRefreshCookie(res);
    return res.status(200).json({
      success: true,
      status: 200,
      message: "Logged out",
      data: null,
    });
  } catch (error) {
    next(error);
  }
};

const logoutAll = async (req, res, next) => {
  try {
    const userId = req.crmAuth?.uid;
    await crmLocalAuthService.revokeAllSessionsForUser(userId, "logout-all");
    crmLocalAuthService.clearRefreshCookie(res);
    return res.status(200).json({
      success: true,
      status: 200,
      message: "Logged out from all sessions",
      data: null,
    });
  } catch (error) {
    next(error);
  }
};

const listSessions = async (req, res, next) => {
  try {
    const sessions = await CrmSession.find({
      userId: req.crmAuth?.uid,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    })
      .sort({ lastActivityAt: -1 })
      .select("_id deviceInfo userAgent ipAddress lastActivityAt createdAt expiresAt");

    return res.status(200).json({
      success: true,
      status: 200,
      message: "Active sessions",
      data: sessions.map((s) => ({
        id: String(s._id),
        deviceInfo: s.deviceInfo,
        userAgent: s.userAgent,
        ipAddress: s.ipAddress,
        lastActivityAt: s.lastActivityAt,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
      })),
    });
  } catch (error) {
    next(error);
  }
};

export default {
  login,
  verifyOtp,
  refresh,
  me,
  logout,
  logoutAll,
  listSessions,
};
