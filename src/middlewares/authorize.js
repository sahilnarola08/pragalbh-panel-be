import AuditLog from "../models/auditLog.js";
import { getEffectivePermissions } from "../services/permissionResolver.js";

function getClientMeta(req) {
  const ip = req.ip || req.connection?.remoteAddress || req.headers?.["x-forwarded-for"]?.split(",")[0] || "";
  const userAgent = req.headers?.["user-agent"] || "";
  return { ip, userAgent };
}

export function authorize(permissionName) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized", status: 401, data: null });
    }
    const perms = await getEffectivePermissions(req.user._id);
    if (!perms.includes(permissionName)) {
      const { ip, userAgent } = getClientMeta(req);
      await AuditLog.create({
        userId: req.user._id,
        action: "UNAUTHORIZED_ACCESS",
        module: permissionName,
        metadata: { path: req.path, method: req.method },
        ip,
        userAgent,
      }).catch(() => {});
      return res.status(403).json({ success: false, message: "Forbidden", status: 403, data: null });
    }
    next();
  };
}

/** Allow if user has any of the given permissions */
export function authorizeAny(permissionNames) {
  const list = Array.isArray(permissionNames) ? permissionNames : [permissionNames];
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized", status: 401, data: null });
    }
    const perms = await getEffectivePermissions(req.user._id);
    const hasAny = list.some((p) => perms.includes(p));
    if (!hasAny) {
      const { ip, userAgent } = getClientMeta(req);
      await AuditLog.create({
        userId: req.user._id,
        action: "UNAUTHORIZED_ACCESS",
        module: list.join(","),
        metadata: { path: req.path, method: req.method },
        ip,
        userAgent,
      }).catch(() => {});
      return res.status(403).json({ success: false, message: "Forbidden", status: 403, data: null });
    }
    next();
  };
}
