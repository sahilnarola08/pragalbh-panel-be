import Permission from "../models/permission.js";

export async function listPermissions() {
  return Permission.find().sort({ module: 1, action: 1 }).lean();
}

export async function listPermissionsGroupedByModule() {
  const list = await listPermissions();
  const byModule = {};
  for (const p of list) {
    if (!byModule[p.module]) byModule[p.module] = [];
    byModule[p.module].push(p);
  }
  return byModule;
}

export async function createPermission(data) {
  return Permission.create({
    name: data.name,
    module: data.module,
    action: data.action,
    description: data.description || "",
  });
}
