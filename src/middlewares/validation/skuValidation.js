import * as yup from "yup";

const attributesSchema = yup.object({
  category: yup.string().trim().uppercase().required("Category is required"),
});

export const validateSkuGenerate = async (req, res, next) => {
  try {
    const schema = yup.object({
      attributes: attributesSchema.required(),
      productId: yup.string().nullable(),
      productName: yup.string().trim().nullable(),
      templateId: yup.string().nullable(),
      clientId: yup.string().nullable(),
      clientCode: yup.string().trim().uppercase().nullable(),
      persist: yup.boolean().default(true),
      jewelryType: yup.string().nullable(),
      orderChannel: yup.string().nullable(),
      productImagePath: yup.string().trim().nullable(),
    });
    req.body = await schema.validate(req.body, { abortEarly: false, stripUnknown: true });
    next();
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.errors?.join(", ") || err.message,
      status: 400,
    });
  }
};

export const validateSkuBulkGenerate = async (req, res, next) => {
  try {
    const schema = yup.object({
      items: yup
        .array()
        .of(
          yup.object({
            category: yup.string().trim().uppercase().required(),
            productName: yup.string().trim().nullable(),
            productImagePath: yup.string().trim().nullable(),
          })
        )
        .min(1)
        .max(5000)
        .required(),
      templateId: yup.string().nullable(),
    });
    req.body = await schema.validate(req.body, { abortEarly: false, stripUnknown: true });
    next();
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.errors?.join(", ") || err.message,
      status: 400,
    });
  }
};

export const validateSkuPreview = async (req, res, next) => {
  try {
    const schema = yup.object({
      attributes: attributesSchema.required(),
      templateId: yup.string().nullable(),
      clientId: yup.string().nullable(),
      clientCode: yup.string().trim().uppercase().nullable(),
    });
    req.body = await schema.validate(req.body, { abortEarly: false, stripUnknown: true });
    next();
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.errors?.join(", ") || err.message,
      status: 400,
    });
  }
};

export const validateSkuAi = async (req, res, next) => {
  try {
    const schema = yup.object({
      description: yup.string().trim().min(3).required(),
      persist: yup.boolean().default(false),
    });
    req.body = await schema.validate(req.body, { abortEarly: false, stripUnknown: true });
    next();
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.errors?.join(", ") || err.message,
      status: 400,
    });
  }
};

export const validateSkuCategory = async (req, res, next) => {
  try {
    const schema = yup.object({
      code: yup.string().trim().uppercase().min(2).max(6).required("Category code is required"),
      label: yup.string().trim().min(1).required("Category label is required"),
    });
    req.body = await schema.validate(req.body, { abortEarly: false, stripUnknown: true });
    next();
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.errors?.join(", ") || err.message,
      status: 400,
    });
  }
};

export const validateSkuTemplate = async (req, res, next) => {
  try {
    const schema = yup.object({
      name: yup.string().trim().required(),
      description: yup.string().trim().nullable(),
      segments: yup.array().of(yup.string().trim().uppercase()).min(2).required(),
      separator: yup.string().max(3).default("-"),
      sequencePad: yup.number().min(1).max(10).default(5),
      resetSequenceYearly: yup.boolean().default(false),
      collectionBasedSequence: yup.boolean().default(false),
      isDefault: yup.boolean().default(false),
    });
    req.body = await schema.validate(req.body, { abortEarly: false, stripUnknown: true });
    next();
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.errors?.join(", ") || err.message,
      status: 400,
    });
  }
};
