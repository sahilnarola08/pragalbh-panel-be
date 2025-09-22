import bcrypt from 'bcryptjs';
import User from '../models/user.js';
import { sendSuccessResponse, sendErrorResponse } from '../util/commonResponses.js';

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
  
      // Check if user already exists by email
      const existingUserByEmail = await User.findOne({ email });
      if (existingUserByEmail) {
        return sendErrorResponse({
          status: 400,
          res,
          message: "Email already exists."
        });
      }
      // Create new user (no password)
      const user = await User.create({
        firstName,
        lastName,
        address,
        contactNumber,
        platforms,
        email,
        clientType,
        company
      });
  
      sendSuccessResponse({ 
        res, 
        data: user, 
        message: "User registered successfully",
        status: 200
      });
  
    } catch (error) {
      next(error);
    }
  };

 // get all users
 const  getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, sortField = 'createdAt', sortOrder = 'desc' } = req.query;
    const offset = (page - 1) * limit;
    const sort = {};
    sort[sortField] = sortOrder === "asc" ? 1 : -1;1

    // Search filter
    const filter = {};
    if (search) {
      filter.$or = [
        { firstName: new RegExp(search, "i") },
        { lastName: new RegExp(search, "i") },
        { email: new RegExp(search, "i") },
        { contactNumber: new RegExp(search, "i") },
        { company: new RegExp(search, "i") }
      ];
    }

    // Fetch users
    const users = await User
      .find({...filter ,isDeleted: false})
      .sort(sort)
      .skip(offset)
      .limit(limit)
      .select("-password -__v -createdAt -updatedAt");


    const totalUsers = await User.countDocuments({...filter ,isDeleted: false});

    return sendSuccessResponse({
      status: 200,
      res,
      data: {
        users,
        totalUsers,
        page: parseInt(page),
        limit: parseInt(limit),
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

    // Check if contact number is being updated and already exists for another user
    if (updateData.contactNumber) {
      const existingUserByContact = await User.findOne({ 
        contactNumber: updateData.contactNumber,
        _id: { $ne: id }
      });
      if (existingUserByContact) {
        return sendErrorResponse({
          status: 400,
          res,
          message: "Contact number already exists for another user."
        });
      }
    }

    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).select("-__v");

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

    // Check if user exists
    const existingUser = await User.findById(id);
    if (!existingUser) {
      return sendErrorResponse({
        status: 404,
        res,
        message: "User not found."
      });
    }

    // Delete user
    await User.updateOne({_id: id}, {$set: {isDeleted: true}});
    

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

    const user = await User.findById(id).select("-__v -createdAt -updatedAt ");
    
    if (!user) {
      return sendErrorResponse({
        status: 404,
        res,
        message: "User not found."
      });
    }

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