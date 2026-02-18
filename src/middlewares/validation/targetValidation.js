import * as yup from "yup";
import { sendErrorResponse } from "../../util/commonResponses.js";

const targetTypeEnum = ["weekly", "monthly", "yearly"];

function coerceDate(value, originalValue) {
  if (originalValue == null || originalValue === "") return undefined;
  const d = new Date(originalValue);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export const createTargetSchema = yup.object().shape({
  type: yup
    .string()
    .required("Target type is required")
    .oneOf(targetTypeEnum, "Type must be weekly, monthly, or yearly"),
  salesTargetAmount: yup
    .number()
    .required("Sales target is required")
    .min(0, "Sales target must be 0 or more")
    .transform((v, o) => (o === "" || o == null ? undefined : Number(o))),
  profitTargetAmount: yup
    .number()
    .required("Profit target is required")
    .transform((v, o) => (o === "" || o == null ? undefined : Number(o))),
  startDate: yup
    .date()
    .required("Start date is required")
    .transform(coerceDate),
  endDate: yup
    .date()
    .required("End date is required")
    .transform(coerceDate)
    .min(yup.ref("startDate"), "End date must be after start date"),
});

export const updateTargetSchema = yup.object().shape({
  type: yup
    .string()
    .oneOf(targetTypeEnum, "Type must be weekly, monthly, or yearly")
    .optional(),
  salesTargetAmount: yup.number().min(0).optional(),
  profitTargetAmount: yup.number().optional(),
  startDate: yup.date().optional(),
  endDate: yup.date().optional(),
  isActive: yup.boolean().optional(),
}).test(
  "end-after-start",
  "End date must be after start date",
  function (value) {
    if (value?.startDate && value?.endDate) {
      return new Date(value.endDate) > new Date(value.startDate);
    }
    return true;
  }
);

const validate = (schema) => async (req, res, next) => {
  try {
    const body = req.body ?? {};
    await schema.validate(body, { abortEarly: false, stripUnknown: true });
    next();
  } catch (err) {
    const message = err.errors?.join(", ") || err.message || "Validation failed";
    return sendErrorResponse({ res, status: 400, message });
  }
};

export const validateCreateTarget = validate(createTargetSchema);
export const validateUpdateTarget = validate(updateTargetSchema);

export const validateTargetId = async (req, res, next) => {
  const { id } = req.params;
  if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
    return sendErrorResponse({ res, status: 400, message: "Valid target ID is required" });
  }
  next();
};
