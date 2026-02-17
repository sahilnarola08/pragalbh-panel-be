import * as yup from "yup";
import { sendErrorResponse } from "../../util/commonResponses.js";

const types = ["diamondType", "clarity", "color", "cut", "shape"];

const createSchema = yup.object({
  type: yup.string().required("Type is required").oneOf(types, "Invalid type"),
  name: yup.string().required("Name is required").trim(),
  slug: yup.string().required("Slug is required").trim().lowercase(),
  displayOrder: yup.number().integer().min(0).default(0),
  isActive: yup.boolean().default(true),
});

const updateSchema = yup.object({
  name: yup.string().trim(),
  slug: yup.string().trim().lowercase(),
  displayOrder: yup.number().integer().min(0),
  isActive: yup.boolean(),
});

export const validateCreateDiamondMaster = async (req, res, next) => {
  try {
    await createSchema.validate(req.body, { abortEarly: false });
    next();
  } catch (err) {
    const message = err.errors?.join(", ") || err.message;
    return sendErrorResponse({ res, message, status: 400 });
  }
};

export const validateUpdateDiamondMaster = async (req, res, next) => {
  try {
    await updateSchema.validate(req.body, { abortEarly: false });
    next();
  } catch (err) {
    const message = err.errors?.join(", ") || err.message;
    return sendErrorResponse({ res, message, status: 400 });
  }
};
