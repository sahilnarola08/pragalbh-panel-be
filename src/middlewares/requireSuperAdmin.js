export function requireSuperAdmin(req, res, next) {
  // authenticateJWT populates req.user and roleId (with name) for RBAC users
  const roleName = req.user?.roleId?.name;
  const legacySuper = req.user?.role === 1; // legacy flag used in seed service

  if (legacySuper || roleName === "SuperAdmin") return next();

  return res.status(403).json({
    success: false,
    message: "Forbidden",
    status: 403,
    data: null,
  });
}

