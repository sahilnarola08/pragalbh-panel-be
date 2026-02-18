import * as yup from "yup";
import { sendErrorResponse } from "../../util/commonResponses.js";

const PAYMENT_MODES = ["cash", "bank", "upi", "cheque"];
const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const partnerIdSchema = yup.object().shape({
  id: yup
    .string()
    .required("Partner ID is required")
    .matches(objectIdRegex, "Invalid partner ID format"),
});

const createPartnerSchema = yup.object().shape({
  name: yup
    .string()
    .required("Name is required")
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must not exceed 100 characters"),
  email: yup.string().trim().email("Invalid email").max(100).optional().nullable(),
  phone: yup.string().trim().max(20).optional().nullable(),
  openingBalance: yup
    .number()
    .transform((v) => (Number.isNaN(v) ? undefined : v))
    .min(0, "Opening balance cannot be negative")
    .optional()
    .default(0),
});

const updatePartnerSchema = yup.object().shape({
  name: yup.string().trim().min(2).max(100).optional(),
  email: yup.string().trim().email().max(100).optional().nullable(),
  phone: yup.string().trim().max(20).optional().nullable(),
  isActive: yup.boolean().optional(),
});

const transactionBodySchema = yup.object().shape({
  amount: yup
    .number()
    .required("Amount is required")
    .positive("Amount must be greater than 0")
    .transform((v) => (Number.isNaN(v) ? undefined : v)),
  paymentMode: yup
    .string()
    .oneOf(PAYMENT_MODES, `Payment mode must be one of: ${PAYMENT_MODES.join(", ")}`)
    .optional()
    .default("cash"),
  referenceNumber: yup.string().trim().max(100).optional().nullable(),
  notes: yup.string().trim().max(500).optional().nullable(),
  transactionDate: yup.date().optional().nullable(),
});

const adjustBodySchema = yup.object().shape({
  amount: yup
    .number()
    .required("Amount is required")
    .transform((v) => (Number.isNaN(v) ? undefined : v)),
  notes: yup.string().trim().max(500).optional().nullable(),
  transactionDate: yup.date().optional().nullable(),
});

const getValidationErrors = (error) => {
  if (!error.inner || !error.inner.length) {
    return error.message || "Validation failed";
  }
  const first = error.inner[0];
  return first.message || "Validation failed";
};

const validatePartnerId = async (req, res, next) => {
  try {
    await partnerIdSchema.validate({ id: req.params.id }, { abortEarly: false });
    next();
  } catch (err) {
    return sendErrorResponse({
      status: 400,
      res,
      message: getValidationErrors(err),
    });
  }
};

const validateCreatePartner = async (req, res, next) => {
  try {
    req.body = await createPartnerSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
    next();
  } catch (err) {
    return sendErrorResponse({
      status: 400,
      res,
      message: getValidationErrors(err),
    });
  }
};

const validateUpdatePartner = async (req, res, next) => {
  try {
    await partnerIdSchema.validate({ id: req.params.id }, { abortEarly: false });
    if (Object.keys(req.body).length > 0) {
      req.body = await updatePartnerSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
    }
    next();
  } catch (err) {
    return sendErrorResponse({
      status: 400,
      res,
      message: getValidationErrors(err),
    });
  }
};

const validateInvest = async (req, res, next) => {
  try {
    await partnerIdSchema.validate({ id: req.params.id }, { abortEarly: false });
    req.body = await transactionBodySchema.validate(req.body, { abortEarly: false, stripUnknown: true });
    next();
  } catch (err) {
    return sendErrorResponse({
      status: 400,
      res,
      message: getValidationErrors(err),
    });
  }
};

const validateWithdraw = async (req, res, next) => {
  try {
    await partnerIdSchema.validate({ id: req.params.id }, { abortEarly: false });
    req.body = await transactionBodySchema.validate(req.body, { abortEarly: false, stripUnknown: true });
    next();
  } catch (err) {
    return sendErrorResponse({
      status: 400,
      res,
      message: getValidationErrors(err),
    });
  }
};

const validateAdjust = async (req, res, next) => {
  try {
    await partnerIdSchema.validate({ id: req.params.id }, { abortEarly: false });
    req.body = await adjustBodySchema.validate(req.body, { abortEarly: false, stripUnknown: true });
    next();
  } catch (err) {
    return sendErrorResponse({
      status: 400,
      res,
      message: getValidationErrors(err),
    });
  }
};

export {
  validatePartnerId,
  validateCreatePartner,
  validateUpdatePartner,
  validateInvest,
  validateWithdraw,
  validateAdjust,
};
