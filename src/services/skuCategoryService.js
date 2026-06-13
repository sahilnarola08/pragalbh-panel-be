import SkuCategory from "../models/skuCategory.js";
import Sku from "../models/sku.js";
import { SKU_CATEGORIES } from "../constants/skuConstants.js";

export async function ensureDefaultCategories() {
  const count = await SkuCategory.countDocuments({ isDeleted: false });
  if (count > 0) return;

  const docs = Object.entries(SKU_CATEGORIES).map(([code, label]) => ({
    code,
    label,
  }));
  await SkuCategory.insertMany(docs);
}

export async function listSkuCategories() {
  return SkuCategory.find({ isDeleted: false }).sort({ label: 1 }).lean();
}

export async function getCategoriesMap() {
  const items = await listSkuCategories();
  const map = {};
  for (const item of items) {
    map[item.code] = item.label;
  }
  return map;
}

export async function createSkuCategory({ code, label }, userId = null) {
  const normalizedCode = String(code).trim().toUpperCase();
  const normalizedLabel = String(label).trim();

  if (!normalizedCode || !/^[A-Z0-9]{2,6}$/.test(normalizedCode)) {
    const err = new Error("Category code must be 2–6 uppercase letters or numbers");
    err.statusCode = 400;
    throw err;
  }
  if (!normalizedLabel) {
    const err = new Error("Category label is required");
    err.statusCode = 400;
    throw err;
  }

  const existing = await SkuCategory.findOne({
    code: normalizedCode,
    isDeleted: false,
  }).lean();
  if (existing) {
    const err = new Error(`Category code "${normalizedCode}" already exists`);
    err.statusCode = 409;
    throw err;
  }

  return SkuCategory.create({
    code: normalizedCode,
    label: normalizedLabel,
    createdBy: userId,
    modifiedBy: userId,
  });
}

export async function updateSkuCategory(id, { code, label }, userId = null) {
  const category = await SkuCategory.findOne({ _id: id, isDeleted: false });
  if (!category) {
    const err = new Error("Category not found");
    err.statusCode = 404;
    throw err;
  }

  const oldCode = category.code;
  const newCode = code != null ? String(code).trim().toUpperCase() : oldCode;
  const newLabel = label != null ? String(label).trim() : category.label;

  if (!newCode || !/^[A-Z0-9]{2,6}$/.test(newCode)) {
    const err = new Error("Category code must be 2–6 uppercase letters or numbers");
    err.statusCode = 400;
    throw err;
  }
  if (!newLabel) {
    const err = new Error("Category label is required");
    err.statusCode = 400;
    throw err;
  }

  if (newCode !== oldCode) {
    const dup = await SkuCategory.findOne({
      code: newCode,
      isDeleted: false,
      _id: { $ne: id },
    }).lean();
    if (dup) {
      const err = new Error(`Category code "${newCode}" already exists`);
      err.statusCode = 409;
      throw err;
    }
  }

  category.code = newCode;
  category.label = newLabel;
  category.modifiedBy = userId;
  await category.save();
  return category;
}

export async function deleteSkuCategory(id) {
  const category = await SkuCategory.findOne({ _id: id, isDeleted: false });
  if (!category) {
    const err = new Error("Category not found");
    err.statusCode = 404;
    throw err;
  }

  const inUse = await Sku.countDocuments({
    category: category.code,
    isDeleted: false,
    previewOnly: false,
  });
  if (inUse > 0) {
    const err = new Error(
      `Cannot delete "${category.label}" — ${inUse} SKU(s) use this category`
    );
    err.statusCode = 400;
    throw err;
  }

  category.isDeleted = true;
  await category.save();
  return category;
}

export async function isValidCategoryCode(code) {
  if (!code) return false;
  const found = await SkuCategory.findOne({
    code: String(code).trim().toUpperCase(),
    isDeleted: false,
  })
    .select("_id")
    .lean();
  return Boolean(found);
}
