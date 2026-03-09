import Permission from "../models/permission.js";
import Role from "../models/role.js";
import Auth from "../models/auth.js";
import { SYSTEM_PERMISSIONS } from "../data/permissionSeed.js";
import { invalidatePermissionCache } from "./permissionResolver.js";

const SUPER_ADMIN_ROLE = "SuperAdmin";
const SUPER_ADMIN_USERS = [
  {
    name: "Super Admin",
    email: "sahilnarola123@gmail.com",
    password: "Narayan@2003",
  },
  {
    name: "Admin Staging",
    email: "adminstaging@yopmail.com",
    password: "Admin@123",
  },
];

export async function seedPermissions() {
  const existing = await Permission.countDocuments();
  if (existing === 0) {
    await Permission.insertMany(SYSTEM_PERMISSIONS);
    console.log("[RBAC] Permissions seeded.");
    invalidatePermissionCache();
    return;
  }
  for (const p of SYSTEM_PERMISSIONS) {
    const found = await Permission.findOne({ name: p.name });
    if (!found) {
      await Permission.create(p);
      console.log("[RBAC] Permission added:", p.name);
      invalidatePermissionCache();
    }
  }
}

export async function ensureSuperAdminRole() {
  const allNames = SYSTEM_PERMISSIONS.map((p) => p.name);
  let role = await Role.findOne({ name: SUPER_ADMIN_ROLE });
  if (!role) {
    role = await Role.create({
      name: SUPER_ADMIN_ROLE,
      description: "Full system access",
      permissions: allNames,
      isActive: true,
      isSystem: true,
    });
    console.log("[RBAC] SuperAdmin role created.");
  } else {
    const missing = allNames.filter((n) => !role.permissions.includes(n));
    if (missing.length > 0) {
      role.permissions = [...new Set([...role.permissions, ...missing])];
      await role.save();
      console.log("[RBAC] SuperAdmin role updated with", missing.length, "new permissions");
      invalidatePermissionCache();
    }
  }
  await Auth.updateMany(
    { roleId: null, role: 1 },
    { $set: { roleId: role._id } }
  );
  return role;
}

export async function ensureSuperAdminUsers(superAdminRole) {
  for (const u of SUPER_ADMIN_USERS) {
    const email = u.email.toLowerCase();
    let user = await Auth.findOne({ email, isDeleted: false });
    if (!user) {
      user = await Auth.create({
        name: u.name,
        email,
        password: u.password,
        roleId: superAdminRole._id,
        isActive: true,
      });
      console.log("[RBAC] Super Admin user created:", email);
    } else {
      user.roleId = superAdminRole._id;
      user.isActive = true;
      user.name = user.name || u.name;
      user.password = u.password;
      await user.save();
      console.log("[RBAC] Super Admin user updated:", email);
    }
  }
}

export async function runRbacSeed() {
  await seedPermissions();
  const superAdminRole = await ensureSuperAdminRole();
  await ensureSuperAdminUsers(superAdminRole);
}
