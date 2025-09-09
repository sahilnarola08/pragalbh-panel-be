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
    const { page = 1, limit = 10, search, sortField = 'createdAt', sortOrder = 'desc' } = req.body;
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
      .find(filter)
      .sort(sort)
      .skip(offset)
      .limit(limit)
      .select("-password -__v -createdAt -updatedAt");


    const totalUsers = await User.countDocuments(filter);

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



export default {
    register,
    getAllUsers,
};