import * as yup from 'yup';
import { sendErrorResponse } from '../../util/commonResponses.js';

// Product creation validation schema
const productSchema = yup.object().shape({
  category: yup
    .string()
    .required('Category is required')
    .matches(/^[0-9a-fA-F]{24}$/, 'Category must be a valid ObjectId'),

  productName: yup
    .string()
    .required('Product name is required')
    .min(2, 'Product name must be at least 2 characters')
    .max(100, 'Product name must not exceed 100 characters')
    .matches(/^[a-zA-Z0-9\s&.-]+$/, 'Product name can only contain letters, numbers, spaces, &, ., and -'),

  image: yup
    .string()
    .url('Image must be a valid URL')
    .optional(),
});

// Product update validation schema (all fields optional)
const productUpdateSchema = yup.object().shape({
  category: yup
    .string()
    .matches(/^[0-9a-fA-F]{24}$/, 'Category must be a valid ObjectId')
    .optional(),

  productName: yup
    .string()
    .min(2, 'Product name must be at least 2 characters')
    .max(100, 'Product name must not exceed 100 characters')
    .matches(/^[a-zA-Z0-9\s&.-]+$/, 'Product name can only contain letters, numbers, spaces, &, ., and -')
    .optional(),

  image: yup
    .string()
    .url('Image must be a valid URL')
    .optional(),
});

// Product ID validation schema
const productIdSchema = yup.object().shape({
  id: yup
    .string()
    .required('Product ID is required')
    .matches(/^[0-9a-fA-F]{24}$/, 'Invalid product ID format')
});

// Validation middleware for product creation
const validateProductSchema = async (req, res, next) => {
  try {
    await productSchema.validate(req.body, { abortEarly: false });
    next();
  } catch (error) {
    const errors = error.inner.map(err => ({
      field: err.path,
      message: err.message
    }));

    return sendErrorResponse({
      status: 400,
      res,
      message: 'Validation failed',
      error: { errors }
    });
  }
};

// Validation middleware for product update
const validateProductUpdate = async (req, res, next) => {
  try {
    // Validate product ID in params
    await productIdSchema.validate({ id: req.params.id }, { abortEarly: false });
    
    // Validate body if provided
    if (Object.keys(req.body).length > 0) {
      await productUpdateSchema.validate(req.body, { abortEarly: false });
    }
    
    next();
  } catch (error) {
    const errors = error.inner.map(err => ({
      field: err.path,
      message: err.message
    }));

    return sendErrorResponse({
      status: 400,
      res,
      message: 'Validation failed',
      error: { errors }
    });
  }
};

// Validation middleware for product delete
const validateProductDelete = async (req, res, next) => {
  try {
    await productIdSchema.validate({ id: req.params.id }, { abortEarly: false });
    next();
  } catch (error) {
    const errors = error.inner.map(err => ({
      field: err.path,
      message: err.message
    }));

    return sendErrorResponse({
      status: 400,
      res,
      message: 'Validation failed',
      error: { errors }
    });
  }
};

export default validateProductSchema;
export { validateProductUpdate, validateProductDelete }; 