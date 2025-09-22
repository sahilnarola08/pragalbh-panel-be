import * as yup from 'yup';
import { sendErrorResponse } from '../../util/commonResponses.js';

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
     address: yup.string().required("Address is required"),
     contactNumber: yup.string().required("Contact number is required")
          .matches(/^[0-9]{10,15}$/, "Contact number must be 10-15 digits"),
     company: yup.string().required("Company is required")
          .min(2, "Company must be at least 2 characters")
          .max(50, "Company must not exceed 50 characters")
          .matches(/^[a-zA-Z\s]+$/, "Company can only contain letters and spaces"),
     advancePayment: yup.number().required("Advance payment is required")
          .min(0, "Advance payment must be greater than 0"),
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
     address: yup.string().optional(),
     contactNumber: yup.string()
          .matches(/^[0-9]{10,15}$/, "Contact number must be 10-15 digits")
          .optional(),
     company: yup.string()
          .min(2, "Company must be at least 2 characters")
          .max(50, "Company must not exceed 50 characters")
          .matches(/^[a-zA-Z\s]+$/, "Company can only contain letters and spaces")
          .optional(),
     advancePayment: yup.number()
          .min(0, "Advance payment must be greater than 0")
          .optional(),
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
          const errors = error.inner
          ? error.inner.map(err => ({ field: err.path, message: err.message }))
          : [{ field: "unknown", message: error.message }]; 

          return sendErrorResponse({
               status: 400,
               res,
               message: 'Validation failed',
               error: { errors }
          });
     }
};

// Validation middleware for supplier delete
const validateSupplierDelete = async (req, res, next) => {
     try {
          await supplierIdSchema.validate({ id: req.params.id }, { abortEarly: false });
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

export { validateSupplierSchema, validateSupplierUpdate, validateSupplierDelete };