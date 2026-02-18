import Auth from '../models/auth.js';
import { sendSuccessResponse, sendErrorResponse } from '../util/commonResponses.js';
import jwt from 'jsonwebtoken';
import { secret } from '../config/secret.js';
import { getEffectivePermissions } from '../services/permissionResolver.js';
import { parseUserAgent } from '../util/parseUserAgent.js';
import * as loginSessionService from '../services/loginSessionService.js';

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

    const authUser = await Auth.create({
      email: email.toLowerCase(),
      password
    });

    // First user in system gets SuperAdmin role so they can access panel and assign roles
    if ((await Auth.countDocuments()) === 1) {
      const Role = (await import("../models/role.js")).default;
      const superAdmin = await Role.findOne({ name: "SuperAdmin" });
      if (superAdmin) {
        authUser.roleId = superAdmin._id;
        await authUser.save();
      }
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

    const permissions = await getEffectivePermissions(authUser._id);
    const userObj = authUser.toJSON ? authUser.toJSON() : { id: authUser._id, email: authUser.email, role: authUser.role, isActive: authUser.isActive, name: authUser.name, roleId: authUser.roleId };
    sendSuccessResponse({
      res,
      data: {
        user: { ...userObj, permissions },
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

    const ip = req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || '';
    const userAgent = req.headers['user-agent'] || '';
    const { browser, deviceType, deviceName } = parseUserAgent(userAgent);
    const session = await loginSessionService.createSession(authUser._id, {
      ip,
      userAgent,
      deviceName,
      deviceType,
      browser,
      location: ''
    });

    const token = jwt.sign(
      {
        id: authUser._id,
        email: authUser.email,
        role: authUser.role,
        sessionId: session._id.toString()
      },
      secret.tokenSecret || 'default-secret-key',
      { expiresIn: '7d' }
    );

    const permissions = await getEffectivePermissions(authUser._id);
    const userObj = authUser.toJSON ? authUser.toJSON() : { id: authUser._id, email: authUser.email, role: authUser.role, isActive: authUser.isActive, name: authUser.name, roleId: authUser.roleId };
    sendSuccessResponse({
      res,
      data: {
        user: { ...userObj, permissions },
        token
      },
      message: "Login successful",
      status: 200
    });

  } catch (error) {
    next(error);
  }
};

const me = async (req, res, next) => {
  try {
    const permissions = await getEffectivePermissions(req.user._id);
    const user = req.user.toJSON ? req.user.toJSON() : { id: req.user._id, email: req.user.email, name: req.user.name, roleId: req.user.roleId, isActive: req.user.isActive };
    sendSuccessResponse({ res, data: { user: { ...user, permissions } }, message: "Profile", status: 200 });
  } catch (e) {
    next(e);
  }
};

export default {
  signup,
  signin,
  me
};

