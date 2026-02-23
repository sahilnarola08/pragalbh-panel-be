import Role from "../models/role.js";
import Auth from "../models/auth.js";
import { invalidatePermissionCache } from "./permissionResolver.js";

const SUPER_ADMIN = "SuperAdmin";

export async function listRoles() {
  return Role.find().sort({ name: 1 }).lean();
}

export async function createRole(data, req) {
  const role = await Role.create({
    name: data.name,
    description: data.description || "",
    permissions: data.permissions || [],
    isActive: data.isActive !== false,
  });
  invalidatePermissionCache();
  return role;
}

export async function updateRole(id, data, req) {
  const role = await Role.findById(id);
  if (!role) return null;
  if (role.isSystem && role.name === SUPER_ADMIN) {
    const err = new Error("SuperAdmin role cannot be modified");
    err.status = 403;
    throw err;
  }
  if (data.name !== undefined) role.name = data.name;
  if (data.description !== undefined) role.description = data.description;
  if (data.permissions !== undefined) role.permissions = data.permissions;
  if (data.isActive !== undefined) role.isActive = data.isActive;
  await role.save();
  invalidatePermissionCache();
  return role;
}

export async function deleteRole(id, req) {
  const role = await Role.findById(id);
  if (!role) return null;
  if (role.isSystem && role.name === SUPER_ADMIN) {
    const err = new Error("SuperAdmin role cannot be deleted");
    err.status = 403;
    throw err;
  }
  const assigned = await Auth.countDocuments({ roleId: id });
  if (assigned > 0) {
    const err = new Error("Cannot delete role assigned to users");
    err.status = 400;
    throw err;
  }
  await Role.findByIdAndDelete(id);
  invalidatePermissionCache();
  return { deleted: true };
}

export async function getRoleById(id) {
  return Role.findById(id).lean();
}
