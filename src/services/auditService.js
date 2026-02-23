import AuditLog from "../models/auditLog.js";

function getClientMeta(req) {
  const ip = req?.ip || req?.connection?.remoteAddress || req?.headers?.["x-forwarded-for"]?.split(",")[0] || "";
  const userAgent = req?.headers?.["user-agent"] || "";
  return { ip, userAgent };
}

export async function logAudit(req, action, module, metadata = {}) {
  const { ip, userAgent } = req ? getClientMeta(req) : {};
  await AuditLog.create({
    userId: req?.user?._id,
    action,
    module,
    metadata,
    ip,
    userAgent,
  }).catch(() => {});
}
