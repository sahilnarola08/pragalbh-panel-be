import mongoose from "mongoose";
import Sku from "../models/sku.js";
import SkuTemplate from "../models/skuTemplate.js";
import SkuHistory from "../models/skuHistory.js";
import ProductVariant from "../models/productVariant.js";
import SkuClient from "../models/skuClient.js";
import {
  COMPANY_CODE,
  DEFAULT_TEMPLATE_SEGMENTS,
  padSequence,
} from "../constants/skuConstants.js";
import { getNextSequence, buildScopeKey } from "./skuSequenceService.js";
import { validateSkuForCreate, validateAttributeCodes } from "./skuValidationService.js";
import { generateSkuMedia } from "./skuBarcodeService.js";

const SEGMENT_RESOLVERS = {
  COMPANY: (ctx) => ctx.companyCode || COMPANY_CODE,
  CATEGORY: (ctx) => ctx.category,
  METAL: (ctx) => ctx.metal,
  STONE: (ctx) => ctx.stone,
  COLLECTION: (ctx) => ctx.collection,
  VARIANT: (ctx) => ctx.variant,
  CUSTOMER: (ctx) => ctx.clientCode,
  YEAR: () => String(new Date().getFullYear()),
  MONTH: () => String(new Date().getMonth() + 1).padStart(2, "0"),
  SEQUENCE: (ctx) => padSequence(ctx.sequence, ctx.sequencePad),
};

export async function getDefaultTemplate() {
  let template = await SkuTemplate.findOne({
    isDefault: true,
    isActive: true,
    isDeleted: false,
  }).lean();

  if (!template) {
    template = await SkuTemplate.findOneAndUpdate(
      { name: "Pragalbh Default", isDeleted: false },
      {
        $setOnInsert: {
          name: "Pragalbh Default",
          description: "PJ-CATEGORY-SEQUENCE",
          segments: [...DEFAULT_TEMPLATE_SEGMENTS],
          isDefault: true,
          isActive: true,
        },
        $set: {
          description: "PJ-CATEGORY-SEQUENCE",
          segments: [...DEFAULT_TEMPLATE_SEGMENTS],
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
  } else if (template.segments?.includes("METAL")) {
    template = await SkuTemplate.findOneAndUpdate(
      { _id: template._id },
      {
        $set: {
          description: "PJ-CATEGORY-SEQUENCE",
          segments: [...DEFAULT_TEMPLATE_SEGMENTS],
        },
      },
      { new: true }
    ).lean();
  }
  return template;
}

function resolveScopeKey(ctx, template) {
  const parts = ["sku", ctx.companyCode || COMPANY_CODE];

  if (ctx.clientCode) {
    parts.push("client", ctx.clientCode, ctx.category);
    return buildScopeKey(parts);
  }

  if (template.collectionBasedSequence && ctx.collection) {
    parts.push("collection", ctx.collection);
    return buildScopeKey(parts);
  }

  if (template.resetSequenceYearly) {
    parts.push("year", new Date().getFullYear(), ctx.category);
    return buildScopeKey(parts);
  }

  parts.push(ctx.category);
  return buildScopeKey(parts);
}

export function buildSkuPreview(ctx, template, sequence) {
  const sep = template?.separator ?? "-";
  const segments = template?.segments ?? DEFAULT_TEMPLATE_SEGMENTS;
  const sequencePad = template?.sequencePad ?? 5;
  const renderCtx = { ...ctx, sequence, sequencePad };
  const parts = segments
    .map((seg) => {
      const resolver = SEGMENT_RESOLVERS[seg];
      if (!resolver) return null;
      const val = resolver(renderCtx);
      return val ? String(val).toUpperCase() : null;
    })
    .filter(Boolean);
  return parts.join(sep);
}

export async function previewSku(attributes, options = {}) {
  const template = options.templateId
    ? await SkuTemplate.findById(options.templateId).lean()
    : await getDefaultTemplate();

  if (!template) {
    throw new Error("No SKU template available");
  }

  const attrs = normalizeAttributes(attributes);
  const attrErrors = await validateAttributeCodes(attrs);
  if (attrErrors.length && !options.allowPartial) {
    return { valid: false, errors: attrErrors, preview: null };
  }

  const ctx = await enrichContext(attrs, options);
  const scopeKey = resolveScopeKey(ctx, template);
  const seqDoc = await mongoose.connection.db
    .collection("skusequences")
    .findOne({ scopeKey })
    .catch(() => null);
  const nextSeq = (seqDoc?.currentValue ?? 0) + 1;
  const preview = buildSkuPreview(ctx, template, nextSeq);

  return {
    valid: attrErrors.length === 0,
    errors: attrErrors,
    preview,
    nextSequence: nextSeq,
    scopeKey,
    template: { _id: template._id, name: template.name, segments: template.segments },
  };
}

function normalizeAttributes(attrs = {}) {
  const out = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (v != null && String(v).trim()) {
      out[k] = String(v).trim().toUpperCase();
    }
  }
  return out;
}

async function enrichContext(attrs, options = {}) {
  const ctx = { ...normalizeAttributes(attrs), companyCode: COMPANY_CODE };

  if (options.clientId) {
    const client = await SkuClient.findOne({
      _id: options.clientId,
      isDeleted: false,
    }).lean();
    if (client) ctx.clientCode = client.code;
  } else if (options.clientCode) {
    ctx.clientCode = String(options.clientCode).toUpperCase();
  }

  return ctx;
}

export async function generateSku(attributes, options = {}) {
  const {
    persist = true,
    productId = null,
    productName = "",
    parentSkuId = null,
    createdBy = null,
    templateId = null,
    clientId = null,
    clientCode = null,
    jewelryType = null,
    orderChannel = null,
    skipBarcode = false,
    productImagePath = null,
  } = options;

  const template = templateId
    ? await SkuTemplate.findOne({ _id: templateId, isDeleted: false, isActive: true }).lean()
    : await getDefaultTemplate();

  if (!template) {
    throw new Error("SKU template not found");
  }

  const attrs = normalizeAttributes(attributes);
  const ctx = await enrichContext(attrs, { clientId, clientCode });

  const scopeKey = resolveScopeKey(ctx, template);
  const sequence = await getNextSequence(scopeKey, {
    resetYearly: template.resetSequenceYearly,
  });
  ctx.sequence = sequence;

  const skuCode = buildSkuPreview(ctx, template, sequence);
  const validationErrors = await validateSkuForCreate(attrs, skuCode);
  if (validationErrors.length) {
    const err = new Error(validationErrors.join("; "));
    err.validationErrors = validationErrors;
    err.statusCode = 400;
    throw err;
  }

  if (!persist) {
    return {
      skuCode,
      preview: true,
      attributes: attrs,
      sequence,
      templateId: template._id,
    };
  }

  const session = await mongoose.startSession();
  let sku;
  try {
    session.startTransaction();

    const { collection: collectionAttr, ...restAttrs } = attrs;
    const [created] = await Sku.create(
      [
        {
          skuCode,
          ...restAttrs,
          collectionCode: collectionAttr || null,
          sequence,
          productId: productId || null,
          productName: productName || "",
          parentSkuId: parentSkuId || null,
          templateId: template._id,
          clientId: clientId || null,
          clientCode: ctx.clientCode || null,
          jewelryType,
          orderChannel,
          productImagePath: productImagePath || null,
          createdBy,
          modifiedBy: createdBy,
          previewOnly: false,
        },
      ],
      { session }
    );
    sku = created;

    await SkuHistory.create(
      [
        {
          skuId: sku._id,
          action: "created",
          newSkuCode: skuCode,
          changes: { attributes: attrs },
          performedBy: createdBy,
        },
      ],
      { session }
    );

    await session.commitTransaction();
  } catch (e) {
    await session.abortTransaction();
    if (e.code === 11000) {
      const dup = new Error(`Duplicate SKU prevented: ${skuCode}`);
      dup.statusCode = 409;
      throw dup;
    }
    throw e;
  } finally {
    session.endSession();
  }

  if (!skipBarcode) {
    try {
      const media = await generateSkuMedia(skuCode);
      sku.qrCodePath = media.qrCodePath;
      sku.barcodePath = media.barcodePath;
      await sku.save();
    } catch {
      /* non-fatal */
    }
  }

  return sku.toObject ? sku.toObject() : sku;
}

export async function generateVariantSkus(parentSkuId, variantCodes, options = {}) {
  const parent = await Sku.findOne({ _id: parentSkuId, isDeleted: false }).lean();
  if (!parent) {
    throw new Error("Parent SKU not found");
  }

  const codes = variantCodes?.length
    ? variantCodes
    : ["YG", "WG", "RG"];

  const results = [];
  for (const variantCode of codes) {
    const attrs = {
      category: parent.category,
      metal: parent.metal,
      stone: parent.stone,
      collection: parent.collectionCode,
      variant: variantCode,
    };
    const sku = await generateSku(attrs, {
      ...options,
      parentSkuId: parent._id,
      productId: parent.productId,
      productName: parent.productName,
      clientId: parent.clientId,
    });

    await ProductVariant.create({
      parentSkuId: parent._id,
      skuId: sku._id,
      productId: parent.productId,
      variantCode,
      skuCode: sku.skuCode,
    });

    results.push(sku);
  }
  return results;
}

export async function bulkGenerateSku(items, options = {}) {
  const results = { created: [], errors: [] };
  for (let i = 0; i < items.length; i++) {
    try {
      const sku = await generateSku(items[i], options);
      results.created.push(sku);
    } catch (e) {
      results.errors.push({
        index: i,
        input: items[i],
        message: e.message,
        validationErrors: e.validationErrors,
      });
    }
  }
  return results;
}

export async function recordSkuHistory(skuId, action, payload = {}) {
  return SkuHistory.create({
    skuId,
    action,
    oldSkuCode: payload.oldSkuCode ?? null,
    newSkuCode: payload.newSkuCode ?? null,
    changes: payload.changes ?? {},
    performedBy: payload.performedBy ?? null,
  });
}
