import LoginSession from "../models/loginSession.js";
import mongoose from "mongoose";

export async function createSession(userId, { ip, userAgent, deviceName, deviceType, browser, location }) {
  const session = await LoginSession.create({
    userId,
    ip: ip || "",
    userAgent: userAgent || "",
    deviceName: deviceName || "",
    deviceType: deviceType || "",
    browser: browser || "",
    location: location || "",
    lastActiveAt: new Date(),
  });
  return session;
}

export async function getSessionById(sessionId) {
  if (!mongoose.Types.ObjectId.isValid(sessionId)) return null;
  return LoginSession.findById(sessionId);
}

export async function sessionExists(sessionId) {
  if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) return false;
  const count = await LoginSession.countDocuments({ _id: sessionId });
  return count > 0;
}

export async function refreshLastActive(sessionId) {
  if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) return;
  await LoginSession.updateOne({ _id: sessionId }, { lastActiveAt: new Date() });
}

export async function listAllSessions() {
  return LoginSession.find()
    .sort({ lastActiveAt: -1 })
    .populate("userId", "name email")
    .lean();
}

export async function listSessionsByUser(userId) {
  if (!mongoose.Types.ObjectId.isValid(userId)) return [];
  return LoginSession.find({ userId })
    .sort({ lastActiveAt: -1 })
    .populate("userId", "name email")
    .lean();
}

export async function deleteSession(sessionId) {
  if (!mongoose.Types.ObjectId.isValid(sessionId)) return null;
  const session = await LoginSession.findByIdAndDelete(sessionId);
  return session;
}
