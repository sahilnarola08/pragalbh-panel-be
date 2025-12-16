import * as yup from 'yup';
import { sendErrorResponse } from '../../util/commonResponses.js';

const imageObjectSchema = yup.object().shape({
  img: yup
    .string()
    .nullable()
    .notRequired()
    .transform((value, originalValue) => {
      // Convert empty strings, null, undefined to empty string for filtering
      const val = originalValue === null || originalValue === undefined ? '' : String(originalValue);
      return val.trim();
    })
    .test('is-url-or-empty', 'Image URL must be a valid URL', function(value) {
      // Allow empty/null/undefined values - these will be filtered out by middleware
      const trimmedValue = value ? String(value).trim() : '';
      if (!trimmedValue || trimmedValue === '') {
        return true;
      }
      // If value exists, validate it's a URL using a simple URL regex check
      try {
        const urlRegex = /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i;
        return urlRegex.test(trimmedValue);
      } catch {
        return false;
      }
    }),
});

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
    .matches(/^[a-zA-Z0-9\s&.\-(),|@#$%^*_+{}":>?<]+$/, 'Product name can only contain letters, numbers, spaces, and special characters: &, ., -, (, ), comma (,), pipe (|), @, #, $, %, ^, *, _, +, {, }, ", :, >, ?, <'),

  imageURLs: yup
    .array()
    .of(imageObjectSchema)
    .max(5, 'Maximum 5 image URLs are allowed')
    .optional()
    .transform((value, originalValue) => {
      // Filter out empty image objects before validation
      if (!originalValue || !Array.isArray(originalValue)) return value;
      return originalValue
        .filter(item => item && item.img && item.img.trim() !== '')
        .map(item => ({ img: item.img.trim() }));
    }),

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
    .matches(/^[a-zA-Z0-9\s&.\-(),|@#$%^*_+{}":>?<]+$/, 'Product name can only contain letters, numbers, spaces, and special characters: &, ., -, (, ), comma (,), pipe (|), @, #, $, %, ^, *, _, +, {, }, ", :, >, ?, <')
    .optional(),

  imageURLs: yup
    .array()
    .of(imageObjectSchema)
    .max(5, 'Maximum 5 image URLs are allowed')
    .optional()
    .transform((value, originalValue) => {
      // Filter out empty image objects before validation
      if (!originalValue || !Array.isArray(originalValue)) return value;
      return originalValue
        .filter(item => item && item.img && item.img.trim() !== '')
        .map(item => ({ img: item.img.trim() }));
    }),

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
    // Clean up imageURLs - filter out empty image objects before validation
    if (req.body.imageURLs && Array.isArray(req.body.imageURLs)) {
      const filtered = req.body.imageURLs
        .filter(item => {
          // Filter out null, undefined, or empty img values
          if (!item) return false;
          if (item.img === null || item.img === undefined) return false;
          if (typeof item.img === 'string' && item.img.trim() === '') return false;
          return true;
        })
        .map(item => ({ img: String(item.img).trim() }));
      
      // If all items were empty, remove the imageURLs field or set to empty array
      if (filtered.length === 0) {
        delete req.body.imageURLs;
      } else {
        req.body.imageURLs = filtered;
      }
    }
    
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
    
    // Clean up imageURLs - filter out empty image objects before validation
    if (req.body.imageURLs && Array.isArray(req.body.imageURLs)) {
      const filtered = req.body.imageURLs
        .filter(item => {
          // Filter out null, undefined, or empty img values
          if (!item) return false;
          if (item.img === null || item.img === undefined) return false;
          if (typeof item.img === 'string' && item.img.trim() === '') return false;
          return true;
        })
        .map(item => ({ img: String(item.img).trim() }));
      
      // If all items were empty, remove the imageURLs field or set to empty array
      if (filtered.length === 0) {
        delete req.body.imageURLs;
      } else {
        req.body.imageURLs = filtered;
      }
    }
    
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