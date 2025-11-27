import Auth from '../models/auth.js';
import { sendSuccessResponse, sendErrorResponse } from '../util/commonResponses.js';
import jwt from 'jsonwebtoken';
import { secret } from '../config/secret.js';

// Signup - Register new user
const signup = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Check if user already exists
    const existingUser = await Auth.findOne({ 
      email: email.toLowerCase(),
      isDeleted: false 
    });

    if (existingUser) {
      return sendErrorResponse({
        status: 400,
        res,
        message: "Email already exists"
      });
    }

    // Create new user with default role 1 (admin) - role managed by backend only
    const authUser = await Auth.create({
      email: email.toLowerCase(),
      password
      // role will default to 1 (admin) from schema
    });

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: authUser._id, 
        email: authUser.email,
        role: authUser.role 
      },
      secret.tokenSecret || 'default-secret-key',
      { expiresIn: '7d' }
    );

    // Return user data (password excluded by schema transform)
    sendSuccessResponse({
      res,
      data: {
        user: {
          id: authUser._id,
          email: authUser.email,
          role: authUser.role,
          isActive: authUser.isActive
        },
        token
      },
      message: "register successfull ",
      status: 201
    });

  } catch (error) {
    next(error);
  }
};

// Signin - Login user
const signin = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const authUser = await Auth.findOne({ 
      email: email.toLowerCase(),
      isDeleted: false 
    });

    if (!authUser) {
      return sendErrorResponse({
        status: 401,
        res,
        message: "Invalid email or password"
      });
    }

    // Check if user is active
    if (!authUser.isActive) {
      return sendErrorResponse({
        status: 403,
        res,
        message: "Account is deactivated. Please contact administrator"
      });
    }

    // Compare password
    const isPasswordValid = await authUser.comparePassword(password);

    if (!isPasswordValid) {
      return sendErrorResponse({
        status: 401,
        res,
        message: "Invalid email or password"
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: authUser._id, 
        email: authUser.email,
        role: authUser.role 
      },
      secret.tokenSecret || 'default-secret-key',
      { expiresIn: '7d' }
    );

    // Return user data and token
    sendSuccessResponse({
      res,
      data: {
        user: {
          id: authUser._id,
          email: authUser.email,
          role: authUser.role,
          isActive: authUser.isActive
        },
        token
      },
      message: "Login successful",
      status: 200
    });

  } catch (error) {
    next(error);
  }
};

export default {
  signup,
  signin
};

