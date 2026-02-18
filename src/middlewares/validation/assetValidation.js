import * as yup from "yup";
import { sendErrorResponse } from "../../util/commonResponses.js";
import { FUNDING_SOURCES, OWNERSHIP_TYPES } from "../../models/asset.js";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const assetIdSchema = yup.object().shape({
  id: yup
    .string()
    .required("Asset ID is required")
    .matches(objectIdRegex, "Invalid asset ID format"),
});

const baseAssetSchema = yup.object().shape({
  name: yup.string().required("Name is required").trim().min(2).max(120),
  typeId: yup
    .string()
    .transform((v) => (v === "" || v === null ? undefined : v))
    .matches(objectIdRegex, "Invalid type")
    .optional(),
  categoryId: yup
    .string()
    .transform((v) => (v === "" || v === null ? undefined : v))
    .matches(objectIdRegex, "Invalid category")
    .optional(),
  ownershipType: yup.string().oneOf(OWNERSHIP_TYPES).required("Ownership type is required"),

  ownerPartnerId: yup
    .string()
    .transform((v) => (v === "" || v === null ? undefined : v))
    .matches(objectIdRegex, "Invalid partner")
    .optional(),
  originalOwnerPartnerId: yup
    .string()
    .transform((v) => (v === "" || v === null ? undefined : v))
    .matches(objectIdRegex, "Invalid partner")
    .optional(),

  contributionDate: yup.date().nullable().optional(),
  contributionValue: yup.number().transform((v) => (Number.isNaN(v) ? undefined : v)).min(0).optional(),
  autoCapitalUpdate: yup.boolean().optional().default(false),

  purchaseDate: yup.date().nullable().optional(),
  purchaseCost: yup.number().transform((v) => (Number.isNaN(v) ? undefined : v)).min(0).optional(),
  currentValue: yup.number().transform((v) => (Number.isNaN(v) ? undefined : v)).min(0).optional(),
  purchaseFundingSource: yup.string().oneOf(FUNDING_SOURCES).optional(),
  purchasedByPartnerId: yup
    .string()
    .transform((v) => (v === "" || v === null ? undefined : v))
    .matches(objectIdRegex, "Invalid partner")
    .optional(),

  status: yup.string().trim().max(50).optional(),
  location: yup.string().trim().max(120).optional(),
  notes: yup.string().trim().max(2000).optional(),
  documents: yup
    .array()
    .of(
      yup.object().shape({
        name: yup.string().trim().max(120).optional(),
        url: yup.string().trim().max(2048).optional(),
      })
    )
    .optional(),
});

const createAssetSchema = baseAssetSchema.test(
  "ownership-requirements",
  "Invalid ownership fields",
  function (value) {
    if (!value) return false;
    const { ownershipType } = value;

    if (ownershipType === "individual") {
      return !!value.ownerPartnerId;
    }
    if (ownershipType === "contributed") {
      return !!value.originalOwnerPartnerId && !!value.contributionDate && typeof value.contributionValue === "number";
    }
    if (ownershipType === "company") {
      return !!value.purchaseDate && typeof value.purchaseCost === "number" && !!value.purchaseFundingSource;
    }
    return true;
  }
);

const updateAssetSchema = yup.object().shape({
  name: yup.string().trim().min(2).max(120).optional(),
  typeId: yup
    .string()
    .transform((v) => (v === "" || v === null ? undefined : v))
    .matches(objectIdRegex, "Invalid type")
    .optional()
    .nullable(),
  categoryId: yup
    .string()
    .transform((v) => (v === "" || v === null ? undefined : v))
    .matches(objectIdRegex, "Invalid category")
    .optional()
    .nullable(),
  status: yup.string().trim().max(50).optional(),
  location: yup.string().trim().max(120).optional(),
  notes: yup.string().trim().max(2000).optional(),
  currentValue: yup.number().transform((v) => (Number.isNaN(v) ? undefined : v)).min(0).optional(),
  documents: yup
    .array()
    .of(
      yup.object().shape({
        name: yup.string().trim().max(120).optional(),
        url: yup.string().trim().max(2048).optional(),
      })
    )
    .optional(),
});

const ownershipChangeSchema = yup.object().shape({
  ownershipType: yup.string().oneOf(OWNERSHIP_TYPES).required(),
  ownerPartnerId: yup
    .string()
    .transform((v) => (v === "" || v === null ? undefined : v))
    .matches(objectIdRegex, "Invalid partner")
    .optional(),
  originalOwnerPartnerId: yup
    .string()
    .transform((v) => (v === "" || v === null ? undefined : v))
    .matches(objectIdRegex, "Invalid partner")
    .optional(),
  contributionDate: yup.date().nullable().optional(),
  contributionValue: yup.number().transform((v) => (Number.isNaN(v) ? undefined : v)).min(0).optional(),
  autoCapitalUpdate: yup.boolean().optional().default(false),

  purchaseDate: yup.date().nullable().optional(),
  purchaseCost: yup.number().transform((v) => (Number.isNaN(v) ? undefined : v)).min(0).optional(),
  purchaseFundingSource: yup.string().oneOf(FUNDING_SOURCES).optional(),
  purchasedByPartnerId: yup
    .string()
    .transform((v) => (v === "" || v === null ? undefined : v))
    .matches(objectIdRegex, "Invalid partner")
    .optional(),
});

const valueUpdateSchema = yup.object().shape({
  currentValue: yup
    .number()
    .required("Current value is required")
    .transform((v) => (Number.isNaN(v) ? undefined : v))
    .min(0, "Value cannot be negative"),
  notes: yup.string().trim().max(500).optional(),
});

const firstError = (err) => err?.inner?.[0]?.message || err?.message || "Validation failed";

export const validateAssetId = async (req, res, next) => {
  try {
    await assetIdSchema.validate({ id: req.params.id }, { abortEarly: false });
    next();
  } catch (err) {
    return sendErrorResponse({ status: 400, res, message: firstError(err) });
  }
};

export const validateCreateAsset = async (req, res, next) => {
  try {
    req.body = await createAssetSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
    next();
  } catch (err) {
    return sendErrorResponse({ status: 400, res, message: firstError(err) });
  }
};

export const validateUpdateAsset = async (req, res, next) => {
  try {
    await assetIdSchema.validate({ id: req.params.id }, { abortEarly: false });
    req.body = await updateAssetSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
    next();
  } catch (err) {
    return sendErrorResponse({ status: 400, res, message: firstError(err) });
  }
};

export const validateOwnershipChange = async (req, res, next) => {
  try {
    await assetIdSchema.validate({ id: req.params.id }, { abortEarly: false });
    req.body = await ownershipChangeSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
    next();
  } catch (err) {
    return sendErrorResponse({ status: 400, res, message: firstError(err) });
  }
};

export const validateValueUpdate = async (req, res, next) => {
  try {
    await assetIdSchema.validate({ id: req.params.id }, { abortEarly: false });
    req.body = await valueUpdateSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
    next();
  } catch (err) {
    return sendErrorResponse({ status: 400, res, message: firstError(err) });
  }
};

