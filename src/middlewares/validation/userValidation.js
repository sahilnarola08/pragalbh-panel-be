import * as yup from 'yup';
import { sendErrorResponse } from '../../util/commonResponses.js';

// Platform schema
const platformSchema = yup.object().shape({
  platformName: yup
    .string()
    .required("Platform name is required")
    .matches(/^[0-9a-fA-F]{24}$/, "Platform name must be a valid ObjectId"),

  platformUsername: yup
    .string()
    .min(3, "Platform username must be at least 3 characters")
    .max(50, "Platform username must not exceed 50 characters")
});

// User registration validation schema (NO password here)
const userRegistrationSchema = yup.object().shape({
  firstName: yup
    .string()
    .required('First name is required')
    .min(2, 'First name must be at least 2 characters')
    .max(50, 'First name must not exceed 50 characters')
    .matches(/^[a-zA-Z\s]+$/, 'First name can only contain letters and spaces'),

  lastName: yup
    .string()
    .required('Last name is required')
    .min(2, 'Last name must be at least 2 characters')
    .max(50, 'Last name must not exceed 50 characters')
    .matches(/^[a-zA-Z\s]+$/, 'Last name can only contain letters and spaces'),

  email: yup
    .string()
    .email('Please enter a valid email address')
    .max(100, 'Email must not exceed 100 characters'),

  contactNumber: yup
    .string()
    .nullable()
    .transform((value) => (value === '' || value === null || value === undefined ? undefined : value))
    .optional()
    .test('contactNumber', 'Contact number must be 10-15 digits', function(value) {
      // If value is empty, undefined, or null, skip validation
      if (!value || value.trim() === '') {
        return true;
      }
      // If value exists, validate it must be 10-15 digits
      return /^[0-9]{10,15}$/.test(value);
    }),

  address: yup
    .string()
    .min(10, 'Address must be at least 10 characters')
    .max(200, 'Address must not exceed 200 characters'),

    platforms: yup
    .array()
    .of(platformSchema)
    .optional(),

  clientType: yup
    .string()
    .required('Client type is required'),

  company: yup
    .string()
    .nullable()
    .transform((value) => (value === '' || value === null || value === undefined ? undefined : value))
    .optional()
    .test('company', 'Company name must be at least 2 characters', function(value) {
      // If value is empty, undefined, or null, skip validation
      if (!value || value.trim() === '') {
        return true;
      }
      // If value exists, validate minimum length
      return value.trim().length >= 2;
    })
    .test('company', 'Company name must not exceed 100 characters', function(value) {
      // If value is empty, undefined, or null, skip validation
      if (!value || value.trim() === '') {
        return true;
      }
      // If value exists, validate maximum length
      return value.trim().length <= 100;
    })
    .test('company', 'Company name can only contain letters, numbers, spaces, &, ., and -', function(value) {
      // If value is empty, undefined, or null, skip validation
      if (!value || value.trim() === '') {
        return true;
      }
      // If value exists, validate format
      return /^[a-zA-Z0-9\s&.-]+$/.test(value);
    }),
});

// User update validation schema (all fields optional)
const userUpdateSchema = yup.object().shape({
  firstName: yup
    .string()
    .min(2, 'First name must be at least 2 characters')
    .max(50, 'First name must not exceed 50 characters')
    .matches(/^[a-zA-Z\s]+$/, 'First name can only contain letters and spaces')
    .optional(),

  lastName: yup
    .string()
    .min(2, 'Last name must be at least 2 characters')
    .max(50, 'Last name must not exceed 50 characters')
    .matches(/^[a-zA-Z\s]+$/, 'Last name can only contain letters and spaces')
    .optional(),

  email: yup
    .string()
    .email('Please enter a valid email address')
    .max(100, 'Email must not exceed 100 characters')
    .optional(),

  contactNumber: yup
    .string()
    .nullable()
    .transform((value) => (value === '' || value === null || value === undefined ? undefined : value))
    .optional()
    .test('contactNumber', 'Contact number must be 10-15 digits', function(value) {
      // If value is empty, undefined, or null, skip validation
      if (!value || value.trim() === '') {
        return true;
      }
      // If value exists, validate it must be 10-15 digits
      return /^[0-9]{10,15}$/.test(value);
    }),

  address: yup
    .string()
    .min(10, 'Address must be at least 10 characters')
    .max(200, 'Address must not exceed 200 characters')
    .optional(),

  platforms: yup
    .array()
    .of(platformSchema)
    .optional(),

  clientType: yup
    .string()
    .optional(),

  company: yup
    .string()
    .nullable()
    .transform((value) => (value === '' || value === null || value === undefined ? undefined : value))
    .optional()
    .test('company', 'Company name must be at least 2 characters', function(value) {
      // If value is empty, undefined, or null, skip validation
      if (!value || value.trim() === '') {
        return true;
      }
      // If value exists, validate minimum length
      return value.trim().length >= 2;
    })
    .test('company', 'Company name must not exceed 100 characters', function(value) {
      // If value is empty, undefined, or null, skip validation
      if (!value || value.trim() === '') {
        return true;
      }
      // If value exists, validate maximum length
      return value.trim().length <= 100;
    })
    .test('company', 'Company name can only contain letters, numbers, spaces, &, ., and -', function(value) {
      // If value is empty, undefined, or null, skip validation
      if (!value || value.trim() === '') {
        return true;
      }
      // If value exists, validate format
      return /^[a-zA-Z0-9\s&.-]+$/.test(value);
    }),
});

// User ID validation schema
const userIdSchema = yup.object().shape({
  id: yup
    .string()
    .required('User ID is required')
    .matches(/^[0-9a-fA-F]{24}$/, 'Invalid user ID format')
});

// Validation middleware for user update
const validateUserUpdate = async (req, res, next) => {
  try {
    // Validate user ID in params
    await userIdSchema.validate({ id: req.params.id }, { abortEarly: false });
    
    // Validate body if provided
    if (Object.keys(req.body).length > 0) {
      await userUpdateSchema.validate(req.body, { abortEarly: false });
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

// Validation middleware for user delete
const validateUserDelete = async (req, res, next) => {
  try {
    await userIdSchema.validate({ id: req.params.id }, { abortEarly: false });
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

// Validation middleware function
const validateUserRegistration = async (req, res, next) => {
  try {
    await userRegistrationSchema.validate(req.body, { abortEarly: false });
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

export { validateUserRegistration, validateUserUpdate, validateUserDelete };
