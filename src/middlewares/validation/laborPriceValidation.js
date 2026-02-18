import * as yup from "yup";
import { sendErrorResponse } from "../../util/commonResponses.js";

const parseDate = (value, originalValue) =>
  originalValue ? new Date(originalValue) : value;

const createSchema = yup.object({
  metalType: yup
    .string()
    .required("Metal type is required")
    .oneOf(["Alloy", "Silver", "Gold", "Platinum"], "Invalid metal type"),
  pricePerGram: yup.number().required("Price per gram is required").min(0, "Must be >= 0"),
  effectiveFrom: yup
    .date()
    .transform(parseDate)
    .default(() => new Date()),
  notes: yup.string().trim().default(""),
  isActive: yup.boolean().default(true),
});

const updateSchema = yup.object({
  pricePerGram: yup
    .number()
    .transform((v) => (v === "" || v == null ? undefined : Number(v)))
    .min(0, "Must be >= 0"),
  effectiveFrom: yup.date().transform(parseDate),
  notes: yup.string().trim().default(""),
  isActive: yup.boolean().transform((v) => (v === undefined ? undefined : Boolean(v))),
});

export const validateCreateLaborPrice = async (req, res, next) => {
  try {
    await createSchema.validate(req.body, { abortEarly: false });
    next();
  } catch (err) {
    const message = err.errors?.join(", ") || err.message;
    return sendErrorResponse({ res, message, status: 400 });
  }
};

export const validateUpdateLaborPrice = async (req, res, next) => {
  try {
    await updateSchema.validate(req.body, { abortEarly: false });
    next();
  } catch (err) {
    const message = err.errors?.join(", ") || err.message;
    return sendErrorResponse({ res, message, status: 400 });
  }
};
