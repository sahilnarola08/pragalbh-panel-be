import bcrypt from 'bcryptjs';
import User from '../models/user.js';
import Master from '../models/master.js';
import { sendSuccessResponse, sendErrorResponse } from '../util/commonResponses.js';
import mongoose from 'mongoose';

// Register new user
const register = async (req, res, next) => {
    try {
      const { 
        firstName, 
        lastName, 
        address, 
        contactNumber, 
        platforms,
        email, 
        clientType,
        company
      } = req.body;
  
      // Validate platforms if provided
      if (platforms && Array.isArray(platforms)) {
        for (const platform of platforms) {
          if (platform.platformName) {
            // Validate ObjectId format
            if (!mongoose.Types.ObjectId.isValid(platform.platformName)) {
              return sendErrorResponse({
                status: 400,
                res,
                message: `Invalid platform name ID format: ${platform.platformName}`
              });
            }

            // Validate platform name exists in Master
            const platformExists = await Master.findOne({
              _id: platform.platformName,
              isDeleted: false
            });

            if (!platformExists) {
              return sendErrorResponse({
                status: 400,
                res,
                message: `Platform name not found or is inactive: ${platform.platformName}`
              });
            }
          }
        }
      }

      // Check if user already exists by email
      const existingUserByEmail = await User.findOne({ email });
      if (existingUserByEmail) {
        return sendErrorResponse({
          status: 400,
          res,
          message: "Email already exists."
        });
      }

      // Convert empty contactNumber to undefined to avoid unique index issues
      const contactNumberValue =
        contactNumber && contactNumber.trim() !== "" ? contactNumber.trim() : undefined;

      // Check if user already exists by contact number (if provided)
      if (contactNumberValue) {
        const existingUserByContact = await User.findOne({ contactNumber: contactNumberValue });
        if (existingUserByContact) {
          return sendErrorResponse({
            status: 400,
            res,
            message: "Contact number already exists.",
          });
        }
      }
      
      // Convert empty company to undefined
      const companyValue = company && company.trim() !== '' ? company.trim() : undefined;

      // Create new user (no password)
      const user = await User.create({
        firstName,
        lastName,
        address,
        contactNumber: contactNumberValue,
        platforms,
        email,
        clientType,
        company: companyValue
      });

      // Populate clientType and platforms in response
      await user.populate({
        path: 'clientType',
        select: '_id name'
      });
      await user.populate({
        path: 'platforms.platformName',
        select: '_id name'
      });

      // ✅ Invalidate cache after user creation
      const { invalidateCache } = await import("../util/cacheHelper.js");
      invalidateCache('user');
      invalidateCache('dashboard');

      // Set cache-control headers to prevent browser caching
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
  
      sendSuccessResponse({
        res,
        data: user,
        message: "User registered successfully",
        status: 200,
      });

    } catch (error) {
      // Handle duplicate key errors more gracefully
      if (error && error.code === 11000) {
        const duplicateField = error.keyPattern
          ? Object.keys(error.keyPattern)[0]
          : null;

        let message = "Duplicate value not allowed.";
        if (duplicateField === "email") {
          message = "Email already exists.";
        } else if (duplicateField === "contactNumber") {
          message = "Contact number already exists.";
        }

        return sendErrorResponse({
          status: 400,
          res,
          message,
        });
      }

      next(error);
    }
  };

 // get all users
 const  getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, sortField = 'createdAt', sortOrder = 'desc', startDate = "", endDate = "" } = req.query;
    
    // Parse page and limit to integers
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const offset = (pageNum - 1) * limitNum;
    
    const sort = {};
    sort[sortField] = sortOrder === "asc" ? 1 : -1;

    // Search filter - always exclude deleted users
    const filter = { isDeleted: false };
    if (search) {
      const orConditions = [
        { firstName: new RegExp(search, "i") },
        { lastName: new RegExp(search, "i") },
        { email: new RegExp(search, "i") },
        { contactNumber: new RegExp(search, "i") },
        { company: new RegExp(search, "i") },
        { clientType: new RegExp(search, "i") }
      ];

      // Use $and to explicitly combine isDeleted: false with $or conditions
      // This ensures isDeleted: false is always enforced
      filter.$and = [
        { isDeleted: false },
        { $or: orConditions }
      ];
      // Remove the top-level isDeleted since it's now in $and
      delete filter.isDeleted;
    }

    // Date range filter
    if (startDate || endDate) {
      // Parse dates - support DD/MM/YYYY format
      const parseDate = (dateString) => {
        if (!dateString || typeof dateString !== 'string') return null;
        
        const trimmed = dateString.trim();
        
        // Try DD/MM/YYYY format first
        const ddmmyyyy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (ddmmyyyy) {
          const day = parseInt(ddmmyyyy[1], 10);
          const month = parseInt(ddmmyyyy[2], 10) - 1; // Month is 0-indexed
          const year = parseInt(ddmmyyyy[3], 10);
          const date = new Date(year, month, day);
          date.setHours(0, 0, 0, 0); // Start of day
          return date;
        }
        
        // Try YYYY-MM-DD format (ISO)
        const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (iso) {
          const year = parseInt(iso[1], 10);
          const month = parseInt(iso[2], 10) - 1;
          const day = parseInt(iso[3], 10);
          const date = new Date(year, month, day);
          date.setHours(0, 0, 0, 0);
          return date;
        }
        
        // Try parsing as ISO string or default Date constructor
        const date = new Date(trimmed);
        if (!isNaN(date.getTime())) {
          date.setHours(0, 0, 0, 0);
          return date;
        }
        
        return null;
      };

      filter.createdAt = {};

      if (startDate) {
        const start = parseDate(startDate);
        if (start) {
          filter.createdAt.$gte = start;
        } else {
          return sendErrorResponse({
            status: 400,
            res,
            message: "Invalid startDate format. Use DD/MM/YYYY or YYYY-MM-DD format.",
          });
        }
      }

      if (endDate) {
        const end = parseDate(endDate);
        if (end) {
          end.setHours(23, 59, 59, 999); // End of day
          filter.createdAt.$lte = end;
        } else {
          return sendErrorResponse({
            status: 400,
            res,
            message: "Invalid endDate format. Use DD/MM/YYYY or YYYY-MM-DD format.",
          });
        }
      }
    }

    // Fetch users with populated clientType and platforms
    const users = await User
      .find(filter)
      .sort(sort)
      .skip(offset)
      .limit(limitNum)
      .select("-password -__v -createdAt -updatedAt")
      .populate({
        path: 'clientType',
        select: '_id name',
        match: { isDeleted: false }
      })
      .populate({
        path: 'platforms.platformName',
        select: '_id name',
        match: { isDeleted: false }
      });


    const totalUsers = await User.countDocuments(filter);

    // Set cache-control headers to prevent browser caching (304 responses)
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    return sendSuccessResponse({
      status: 200,
      res,
      data: {
        users,
        totalUsers,
        page: pageNum,
        limit: limitNum,
      },
      message: "User data retrieved successfully."
    });
  } catch (error) {
    console.error("Error fetching users:", error);  
    return sendErrorResponse({
      status: 500,
      res,
      message: "Internal Server Error",
      error: error.message
    });
  }
}

// Update user by ID
const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Check if user exists
    const existingUser = await User.findById(id);
    if (!existingUser) {
      return sendErrorResponse({
        status: 404,
        res,
        message: "User not found."
      });
    }

    // Check if email is being updated and already exists for another user
    if (updateData.email) {
      const existingUserByEmail = await User.findOne({ 
        email: updateData.email,
        _id: { $ne: id }
      });
      if (existingUserByEmail) {
        return sendErrorResponse({
          status: 400,
          res,
          message: "Email already exists for another user."
        });
      }
    }

    // Handle empty contactNumber - convert to undefined
    if (updateData.contactNumber !== undefined) {
      if (updateData.contactNumber && updateData.contactNumber.trim() !== '') {
        // Check if contact number already exists for another user
        const existingUserByContact = await User.findOne({ 
          contactNumber: updateData.contactNumber.trim(),
          _id: { $ne: id }
        });
        if (existingUserByContact) {
          return sendErrorResponse({
            status: 400,
            res,
            message: "Contact number already exists for another user."
          });
        }
        updateData.contactNumber = updateData.contactNumber.trim();
      } else {
        // Convert empty string to undefined
        updateData.contactNumber = undefined;
      }
    }

    // Handle empty company - convert to undefined
    if (updateData.company !== undefined) {
      if (updateData.company && updateData.company.trim() !== '') {
        updateData.company = updateData.company.trim();
      } else {
        // Convert empty string to undefined
        updateData.company = undefined;
      }
    }

    // Validate platforms if provided
    if (updateData.platforms && Array.isArray(updateData.platforms)) {
      for (const platform of updateData.platforms) {
        if (platform.platformName) {
          // Validate ObjectId format
          if (!mongoose.Types.ObjectId.isValid(platform.platformName)) {
            return sendErrorResponse({
              status: 400,
              res,
              message: `Invalid platform name ID format: ${platform.platformName}`
            });
          }

          // Validate platform name exists in Master
          const platformExists = await Master.findOne({
            _id: platform.platformName,
            isDeleted: false
          });

          if (!platformExists) {
            return sendErrorResponse({
              status: 400,
              res,
              message: `Platform name not found or is inactive: ${platform.platformName}`
            });
          }
        }
      }
    }

    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).select("-__v")
    .populate({
      path: 'clientType',
      select: '_id name'
    })
    .populate({
      path: 'platforms.platformName',
      select: '_id name',
      match: { isDeleted: false }
    });

    // ✅ Invalidate cache after user update
    const { invalidateCache } = await import("../util/cacheHelper.js");
    invalidateCache('user', id);
    invalidateCache('user');
    invalidateCache('dashboard');

    // Set cache-control headers to prevent browser caching
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    sendSuccessResponse({
      res,
      data: updatedUser,
      message: "User updated successfully",
      status: 200
    });

  } catch (error) {
    next(error);
  }
};

// Delete user by ID
const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if user exists and is not already deleted
    const existingUser = await User.findById(id);
    if (!existingUser || existingUser.isDeleted) {
      return sendErrorResponse({
        status: 404,
        res,
        message: "User not found."
      });
    }

    // Soft delete - set isDeleted to true
    await User.findByIdAndUpdate(
      id,
      { isDeleted: true },
      { new: true }
    );

    // ✅ Invalidate cache after user deletion
    const { invalidateCache } = await import("../util/cacheHelper.js");
    invalidateCache('user', id);
    invalidateCache('user');
    invalidateCache('dashboard');

    // Set cache-control headers to prevent browser caching
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    sendSuccessResponse({
      res,
      data: null,
      message: "User deleted successfully",
      status: 200
    });

  } catch (error) {
    next(error);
  }
};

// Get user by ID
const getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id)
      .select("-__v -createdAt -updatedAt")
      .populate({
        path: 'clientType',
        select: '_id name',
        match: { isDeleted: false }
      })
      .populate({
        path: 'platforms.platformName',
        select: '_id name',
        match: { isDeleted: false }
      });
    
    if (!user) {
      return sendErrorResponse({
        status: 404,
        res,
        message: "User not found."
      });
    }

    // Set cache-control headers to prevent browser caching (304 responses)
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    sendSuccessResponse({
      res,
      data: user,
      message: "User retrieved successfully",
      status: 200
    });

  } catch (error) {
    next(error);
  }
};

export default {
    register,
    getAllUsers,
    updateUser,
    deleteUser,
    getUserById,
};