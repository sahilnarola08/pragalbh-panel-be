import { sendSuccessResponse, sendErrorResponse } from "../util/commonResponses.js";
import * as loginSessionService from "../services/loginSessionService.js";

export async function listSessions(req, res, next) {
  try {
    const { userId } = req.query;
    const list = userId
      ? await loginSessionService.listSessionsByUser(userId)
      : await loginSessionService.listAllSessions();
    sendSuccessResponse({ res, data: list, message: "Sessions fetched", status: 200 });
  } catch (e) {
    next(e);
  }
}

export async function revokeSession(req, res, next) {
  try {
    const session = await loginSessionService.deleteSession(req.params.id);
    if (!session) return sendErrorResponse({ status: 404, res, message: "Session not found" });
    sendSuccessResponse({ res, data: { id: session._id }, message: "Session revoked", status: 200 });
  } catch (e) {
    next(e);
  }
}
