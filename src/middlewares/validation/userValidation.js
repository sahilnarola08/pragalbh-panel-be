import * as yup from 'yup';


// Platform schema
const platformSchema = yup.object().shape({
  platformName: yup
    .string()
    .required("Platform name is required")
    .min(2, "Platform name must be at least 2 characters")
    .max(100, "Platform name must not exceed 100 characters"),

  platformUsername: yup
    .string()
    .required("Platform username is required")
    .min(3, "Platform username must be at least 3 characters")
    .max(50, "Platform username must not exceed 50 characters")
    .matches(/^[a-zA-Z0-9_]+$/, "Platform username can only contain letters, numbers, and underscores")
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
    .required('Email is required')
    .email('Please enter a valid email address')
    .max(100, 'Email must not exceed 100 characters'),

  contactNumber: yup
    .string()
    .required('Contact number is required')
    .matches(/^[0-9]{10,15}$/, 'Contact number must be 10-15 digits'),

  address: yup
    .string()
    .required('Address is required')
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
    .required('Company name is required')
    .min(2, 'Company name must be at least 2 characters')
    .max(100, 'Company name must not exceed 100 characters')
    .matches(/^[a-zA-Z0-9\s&.-]+$/, 'Company name can only contain letters, numbers, spaces, &, ., and -'),
});

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

    return res.status(400).json({
      success: false,
      status: 400,
      message: 'Validation failed',
      errors: errors
    });
  }
};

export { validateUserRegistration };
