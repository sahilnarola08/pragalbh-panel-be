import * as yup from 'yup';
import { sendErrorResponse } from '../../util/commonResponses.js';

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

const validateSupplierSchema = async (req, res, next) => {
     try {
          await supplierSchema.validate(req.body);
          next();
     } catch (error) {
          const errors = error.inner.map(err => ({
               field: err.path,
               message: err.message
          }));

          return res.status(400).json({
               success: false,
               status: 400,
               message: 'Validation failed',
               errors: errors
          });
     }
};
export default validateSupplierSchema;