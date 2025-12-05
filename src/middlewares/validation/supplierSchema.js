import * as yup from 'yup';
import { sendErrorResponse } from '../../util/commonResponses.js';

// Helper function to format field names
const formatFieldName = (fieldName) => {
  if (!fieldName) return 'field';
  
  const fieldMap = {
    firstName: 'first name',
    lastName: 'last name',
    contactNumber: 'contact number',
    advancePayment: 'advance payment',
    bankId: 'bank id',
    address: 'address',
    company: 'company'
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

// Supplier creation validation schema
const supplierSchema = yup.object().shape({
     firstName: yup.string().required("First name is required")
          .min(2, "First name must be at least 2 characters")
          .max(50, "First name must not exceed 50 characters")
          .matches(/^[a-zA-Z\s]+$/, "First name can only contain letters and spaces"),
     lastName: yup.string().required("Last name is required")
          .min(2, "Last name must be at least 2 characters")
          .max(50, "Last name must not exceed 50 characters")
          .matches(/^[a-zA-Z\s]+$/, "Last name can only contain letters and spaces"),
     address: yup.string()
          .required("Address is required")
          .min(2, "Address must be at least 2 characters")
          .max(200, "Address must not exceed 200 characters")
          .matches(/^[a-zA-Z0-9\s,-]+$/, "Address can only contain letters, numbers, spaces, comma (,), and hyphen (-)"),
     contactNumber: yup.string()
          .required("Contact number is required")
          .test('contactNumber', 'Contact number must be at least 5 digits', function(value) {
            if (!value || value.trim() === '') {
              return false;
            }
            return /^[0-9]{5,}$/.test(value);
          }),
     company: yup.string()
          .required("Company is required")
          .min(2, "Company must be at least 2 characters")
          .max(100, "Company must not exceed 100 characters"),
     advancePayment: yup.array().of(
          yup.object().shape({
               bankId: yup.string()
                    .required("Bank ID is required")
                    .matches(/^[0-9a-fA-F]{24}$/, "Bank ID must be a valid ObjectId"),
               amount: yup.number().required("Amount is required").min(0, "Amount must be greater than or equal to 0")
          })
     ).optional(),
});

// Supplier update validation schema (all fields optional)
const supplierUpdateSchema = yup.object().shape({
     firstName: yup.string()
          .min(2, "First name must be at least 2 characters")
          .max(50, "First name must not exceed 50 characters")
          .matches(/^[a-zA-Z\s]+$/, "First name can only contain letters and spaces")
          .optional(),
     lastName: yup.string()
          .min(2, "Last name must be at least 2 characters")
          .max(50, "Last name must not exceed 50 characters")
          .matches(/^[a-zA-Z\s]+$/, "Last name can only contain letters and spaces")
          .optional(),
     address: yup.string()
          .min(2, "Address must be at least 2 characters")
          .max(200, "Address must not exceed 200 characters")
          .matches(/^[a-zA-Z0-9\s,-]+$/, "Address can only contain letters, numbers, spaces, comma (,), and hyphen (-)")
          .optional(),
     contactNumber: yup.string()
          .nullable()
          .transform((value) => (value === '' || value === null || value === undefined ? undefined : value))
          .optional()
          .test('contactNumber', 'Contact number must be at least 5 digits', function(value) {
            if (!value || value.trim() === '') {
              return true;
            }
            return /^[0-9]{5,}$/.test(value);
          }),
     company: yup.string()
          .nullable()
          .transform((value) => (value === '' || value === null || value === undefined ? undefined : value))
          .optional()
          .test('company', 'Company must be at least 2 characters', function(value) {
            if (!value || value.trim() === '') {
              return true;
            }
            return value.trim().length >= 2;
          })
          .test('company', 'Company must not exceed 100 characters', function(value) {
            if (!value || value.trim() === '') {
              return true;
            }
            return value.trim().length <= 100;
          }),
     advancePayment: yup.array().of(
          yup.object().shape({
               bankId: yup.string()
                    .required("Bank ID is required")
                    .matches(/^[0-9a-fA-F]{24}$/, "Bank ID must be a valid ObjectId"),
               amount: yup.number().required("Amount is required").min(0, "Amount must be greater than or equal to 0")
          })
     ).optional(),
});

// Supplier ID validation schema
const supplierIdSchema = yup.object().shape({
     id: yup
          .string()
          .required('Supplier ID is required')
          .matches(/^[0-9a-fA-F]{24}$/, 'Invalid supplier ID format')
});

// Validation middleware for supplier creation
const validateSupplierSchema = async (req, res, next) => {
     try {
          await supplierSchema.validate(req.body, { abortEarly: false });
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

// Validation middleware for supplier update
const validateSupplierUpdate = async (req, res, next) => {
     try {
          // Validate supplier ID in params
          await supplierIdSchema.validate({ id: req.params.id }, { abortEarly: false });

          // Validate body if provided
          if (Object.keys(req.body).length > 0) {
               await supplierUpdateSchema.validate(req.body, { abortEarly: false });
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

// Validation middleware for supplier delete
const validateSupplierDelete = async (req, res, next) => {
     try {
          await supplierIdSchema.validate({ id: req.params.id }, { abortEarly: false });
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

export { validateSupplierSchema, validateSupplierUpdate, validateSupplierDelete };