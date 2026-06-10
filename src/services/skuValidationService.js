import Sku from "../models/sku.js";
import { isValidSkuCode } from "../constants/skuConstants.js";
import { isValidCategoryCode } from "./skuCategoryService.js";

export async function validateAttributeCodes(attrs = {}) {
  const errors = [];
  const { category } = attrs;

  if (!category) {
    errors.push("Missing required attribute: category");
  } else if (!(await isValidCategoryCode(category))) {
    errors.push(`Invalid category code: ${category}`);
  }

  return errors;
}

export async function checkDuplicateSku(skuCode, excludeId = null) {
  if (!skuCode) return { duplicate: false };
  const query = {
    skuCode: skuCode.trim().toUpperCase(),
    isDeleted: false,
    previewOnly: false,
  };
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  const existing = await Sku.findOne(query).select("_id skuCode").lean();
  return {
    duplicate: Boolean(existing),
    existingId: existing?._id ?? null,
  };
}

export function validateSkuFormat(skuCode) {
  const errors = [];
  if (!skuCode || !String(skuCode).trim()) {
    errors.push("SKU code is required");
    return errors;
  }
  const code = String(skuCode).trim().toUpperCase();
  if (!isValidSkuCode(code)) {
    errors.push(
      "SKU contains invalid characters. Use uppercase letters, numbers, and hyphens only."
    );
  }
  if (code.length > 80) {
    errors.push("SKU code exceeds maximum length (80 characters)");
  }
  return errors;
}

export async function validateSkuForCreate(attrs, skuCode) {
  const errors = [
    ...(await validateAttributeCodes(attrs)),
    ...validateSkuFormat(skuCode),
  ];
  if (!errors.length && skuCode) {
    const dup = await checkDuplicateSku(skuCode);
    if (dup.duplicate) {
      errors.push(`Duplicate SKU: ${skuCode} already exists`);
    }
  }
  return errors;
}
