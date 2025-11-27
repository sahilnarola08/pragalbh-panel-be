import * as yup from 'yup';
import { sendErrorResponse } from '../../util/commonResponses.js';

// Signup validation schema - role is managed by backend, not from frontend
const signupSchema = yup.object().shape({
  email: yup
    .string()
    .required('Email is required')
    .email('Please provide a valid email address')
    .trim()
    .lowercase(),
  password: yup
    .string()
    .required('Password is required')
    .min(6, 'Password must be at least 6 characters long')
});

// Signin validation schema
const signinSchema = yup.object().shape({
  email: yup
    .string()
    .required('Email is required')
    .email('Please provide a valid email address')
    .trim()
    .lowercase(),
  password: yup
    .string()
    .required('Password is required')
});

// Middleware to validate signup
export const validateSignup = async (req, res, next) => {
  try {
    await signupSchema.validate(req.body, { abortEarly: false });
    next();
  } catch (error) {
    const errors = error.inner.map(err => ({
      field: err.path,
      message: err.message
    }));
    
    return sendErrorResponse({
      status: 400,
      res,
      message: "Validation failed",
      error: errors
    });
  }
};

// Middleware to validate signin
export const validateSignin = async (req, res, next) => {
  try {
    await signinSchema.validate(req.body, { abortEarly: false });
    next();
  } catch (error) {
    const errors = error.inner.map(err => ({
      field: err.path,
      message: err.message
    }));
    
    return sendErrorResponse({
      status: 400,
      res,
      message: "Validation failed",
      error: errors
    });
  }
};

