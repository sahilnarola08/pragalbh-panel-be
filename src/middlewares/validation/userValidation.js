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
    .test('contactNumber', 'Contact number must be at least 5 digits', function(value) {
      // If value is empty, undefined, or null, skip validation
      if (!value || value.trim() === '') {
        return true;
      }
      // If value exists, validate it must be at least 5 digits
      return /^[0-9]{5,}$/.test(value);
    }),

  address: yup
    .string()
    .min(2, 'Address must be at least 2 characters')
    .max(200, 'Address must not exceed 200 characters')
    .matches(/^[a-zA-Z0-9\s,-]+$/, 'Address can only contain letters, numbers, spaces, comma (,), and hyphen (-)'),

    platforms: yup
    .array()
    .of(platformSchema)
    .optional(),

  // Client type as multi-select (array of ObjectId strings)
  clientType: yup
    .array()
    .of(
      yup
        .string()
        .matches(/^[0-9a-fA-F]{24}$/, 'Client type must be a valid ObjectId')
    )
    .min(1, 'At least one client type is required')
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
    .test('contactNumber', 'Contact number must be at least 5 digits', function(value) {
      // If value is empty, undefined, or null, skip validation
      if (!value || value.trim() === '') {
        return true;
      }
      // If value exists, validate it must be at least 5 digits
      return /^[0-9]{5,}$/.test(value);
    }),

  address: yup
    .string()
    .min(2, 'Address must be at least 2 characters')
    .max(200, 'Address must not exceed 200 characters')
    .matches(/^[a-zA-Z0-9\s,-]+$/, 'Address can only contain letters, numbers, spaces, comma (,), and hyphen (-)')
    .optional(),

  platforms: yup
    .array()
    .of(platformSchema)
    .optional(),

  // Optional multi-select client type on update
  clientType: yup
    .array()
    .of(
      yup
        .string()
        .matches(/^[0-9a-fA-F]{24}$/, 'Client type must be a valid ObjectId')
    )
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
    }),
});

// User ID validation schema
const userIdSchema = yup.object().shape({
  id: yup
    .string()
    .required('User ID is required')
    .matches(/^[0-9a-fA-F]{24}$/, 'Invalid user ID format')
});

// Helper function to format field names
const formatFieldName = (fieldName) => {
  if (!fieldName) return 'field';
  
  const fieldMap = {
    firstName: 'first name',
    lastName: 'last name',
    contactNumber: 'contact number',
    clientType: 'client type',
    orderPlatform: 'order platform',
    platformName: 'platform name',
    platformUsername: 'platform username',
    address: 'address',
    company: 'company',
    email: 'email',
    platforms: 'platforms'
  };
  return fieldMap[fieldName] || fieldName;
};

// Helper function to create simple error message
const createSimpleErrorMessage = (errors) => {
  if (!errors || errors.length === 0) {
    return 'Validation failed';
  }
  
  // Filter out errors without valid paths and get unique field names
  // Handle both err.path and err.field (for compatibility)
  const validErrors = errors.filter(err => {
    if (!err) return false;
    return err.path || err.field;
  });
  
  if (validErrors.length === 0) {
    return 'Validation failed';
  }
  
  // Get unique field names (use path first, fallback to field)
  const uniqueFields = [...new Set(validErrors.map(err => err.path || err.field).filter(Boolean))];
  
  if (uniqueFields.length === 0) {
    return 'Validation failed';
  }
  
  if (uniqueFields.length === 1) {
    const fieldName = formatFieldName(uniqueFields[0]);
    return `${fieldName} is invalid`;
  }
  
  // Multiple errors - combine field names
  const fieldNames = uniqueFields.map(field => formatFieldName(field));
  const lastField = fieldNames.pop();
  const fieldsString = fieldNames.length > 0 
    ? `${fieldNames.join(', ')} and ${lastField}` 
    : lastField;
  
  return `${fieldsString} is invalid`;
};

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
    // Map errors to include path property for createSimpleErrorMessage
    // Handle both error.inner (array) and error.errors (object) formats
    let errors = [];
    
    if (error.inner && Array.isArray(error.inner) && error.inner.length > 0) {
      errors = error.inner.map(err => ({
        path: err.path || err.params?.path || err.params?.label,
        field: err.path || err.params?.path || err.params?.label,
        message: err.message
      })).filter(err => err.path); // Filter out errors without paths
    } else if (error.errors && typeof error.errors === 'object') {
      // Handle case where errors might be an object
      errors = Object.keys(error.errors).map(key => ({
        path: key,
        field: key,
        message: error.errors[key]
      }));
    }

    const errorMessage = createSimpleErrorMessage(errors);

    return sendErrorResponse({
      status: 400,
      res,
      message: errorMessage
    });
  }
};

// Validation middleware for user delete
const validateUserDelete = async (req, res, next) => {
  try {
    await userIdSchema.validate({ id: req.params.id }, { abortEarly: false });
    next();
  } catch (error) {
    // Map errors to include path property for createSimpleErrorMessage
    // Handle both error.inner (array) and error.errors (object) formats
    let errors = [];
    
    if (error.inner && Array.isArray(error.inner) && error.inner.length > 0) {
      errors = error.inner.map(err => ({
        path: err.path || err.params?.path || err.params?.label,
        field: err.path || err.params?.path || err.params?.label,
        message: err.message
      })).filter(err => err.path); // Filter out errors without paths
    } else if (error.errors && typeof error.errors === 'object') {
      // Handle case where errors might be an object
      errors = Object.keys(error.errors).map(key => ({
        path: key,
        field: key,
        message: error.errors[key]
      }));
    }

    const errorMessage = createSimpleErrorMessage(errors);

    return sendErrorResponse({
      status: 400,
      res,
      message: errorMessage
    });
  }
};

// Validation middleware function
const validateUserRegistration = async (req, res, next) => {
  try {
    await userRegistrationSchema.validate(req.body, { abortEarly: false });
    next();
  } catch (error) {
    // Map errors to include path property for createSimpleErrorMessage
    // Handle both error.inner (array) and error.errors (object) formats
    let errors = [];
    
    if (error.inner && Array.isArray(error.inner) && error.inner.length > 0) {
      errors = error.inner.map(err => ({
        path: err.path || err.params?.path || err.params?.label,
        field: err.path || err.params?.path || err.params?.label,
        message: err.message
      })).filter(err => err.path); // Filter out errors without paths
    } else if (error.errors && typeof error.errors === 'object') {
      // Handle case where errors might be an object
      errors = Object.keys(error.errors).map(key => ({
        path: key,
        field: key,
        message: error.errors[key]
      }));
    }

    const errorMessage = createSimpleErrorMessage(errors);

    return sendErrorResponse({
      status: 400,
      res,
      message: errorMessage
    });
  }
};

export { validateUserRegistration, validateUserUpdate, validateUserDelete };
