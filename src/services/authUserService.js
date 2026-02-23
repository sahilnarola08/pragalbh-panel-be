import Auth from "../models/auth.js";
import Role from "../models/role.js";
import { invalidatePermissionCache } from "./permissionResolver.js";

export async function listUsers() {
  return Auth.find({ isDeleted: false })
    .select("-password")
    .populate("roleId", "name permissions")
    .sort({ createdAt: -1 })
    .lean();
}

export async function createUser(data, req) {
  const existing = await Auth.findOne({ email: data.email.toLowerCase(), isDeleted: false });
  if (existing) {
    const err = new Error("Email already exists");
    err.status = 400;
    throw err;
  }
  const roleId = data.roleId || null;
  const user = await Auth.create({
    name: data.name || "",
    email: data.email.toLowerCase(),
    password: data.password,
    roleId,
    customPermissions: data.customPermissions || [],
    isActive: data.isActive !== false,
  });
  return user;
}

export async function updateUser(id, data, req) {
  const user = await Auth.findById(id);
  if (!user) return null;
  if (data.name !== undefined) user.name = data.name;
  if (data.email !== undefined) user.email = data.email.toLowerCase();
  if (data.password !== undefined && data.password) user.password = data.password;
  if (data.roleId !== undefined) user.roleId = data.roleId || null;
  if (data.customPermissions !== undefined) user.customPermissions = data.customPermissions;
  if (data.isActive !== undefined) user.isActive = data.isActive;
  await user.save();
  invalidatePermissionCache(id);
  return user;
}

export async function setUserRole(id, roleId, req) {
  const user = await Auth.findById(id);
  if (!user) return null;
  user.roleId = roleId || null;
  await user.save();
  invalidatePermissionCache(id);
  return user;
}

export async function setUserPermissions(id, customPermissions, req) {
  const user = await Auth.findById(id);
  if (!user) return null;
  user.customPermissions = customPermissions || [];
  await user.save();
  invalidatePermissionCache(id);
  return user;
}

export async function getUserById(id) {
  return Auth.findById(id).select("-password").populate("roleId", "name permissions").lean();
}
