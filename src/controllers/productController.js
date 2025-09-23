import Product from "../models/product.js";
import { sendSuccessResponse, sendErrorResponse } from "../util/commonResponses.js";

// create product controller
const createProduct = async (req, res) => {
  try {
    const { category, productName, image } = req.body;

    // check if product already exists in same category
    const existing = await Product.findOne({ category, productName });
    if (existing) {
      return sendErrorResponse({
        res,
        message: "Product already exists in this category",
        status: 400
      });
    }

    const newProduct = await Product.create({ category, productName, image });

    return sendSuccessResponse({
      res,
      data: newProduct,
      message: "Product created successfully",
      status: 200
    });
  } catch (err) {
    console.error("Error creating product:", err);
    return sendErrorResponse({
      res,
      message: "Failed to create product",
      status: 500
    });
  }
};

// get all products
const getAllProducts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      sortField = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const offset = (pageNum - 1) * limitNum;

    // Sorting
    const sort = {};
    sort[sortField] = sortOrder === "asc" ? 1 : -1;

    // Search filter - exclude deleted products
    const filter = { isDeleted: { $ne: true } };
    if (search) {
      filter.$and = [
        { isDeleted: { $ne: true } },
        {
          $or: [
            { category: new RegExp(search, "i") },
            { productName: new RegExp(search, "i") },
          ]
        }
      ];
    }

    const products = await Product.find(filter)
      .sort(sort)
      .skip(offset)
      .limit(limitNum);

    const totalProducts = await Product.countDocuments(filter);

    return sendSuccessResponse({
      status: 200,
      res,
      data: {
        products,
        totalCount: totalProducts,
        page: pageNum,
        limit: limitNum,
      },
      message: "Products retrieved successfully.",
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    return sendErrorResponse({
      status: 500,
      res,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

// Update product by ID
const updateProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Check if product exists
    const existingProduct = await Product.findById(id);
    if (!existingProduct) {
      return sendErrorResponse({
        status: 404,
        res,
        message: "Product not found."
      });
    }

    // Check if product with same category and name already exists (excluding current product)
    if (updateData.category && updateData.productName) {
      const existingProductByCategoryAndName = await Product.findOne({ 
        category: updateData.category,
        productName: updateData.productName,
        _id: { $ne: id }
      });
      if (existingProductByCategoryAndName) {
        return sendErrorResponse({
          status: 400,
          res,
          message: "Product with this name already exists in this category."
        });
      }
    }

    // Update product
    const updatedProduct = await Product.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).select("-__v");

    sendSuccessResponse({
      res,
      data: updatedProduct,
      message: "Product updated successfully",
      status: 200
    });

  } catch (error) {
    next(error);
  }
};

// Delete product by ID
const deleteProduct = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if product exists
    const existingProduct = await Product.findById(id);
    if (!existingProduct) {
      return sendErrorResponse({
        status: 404,
        res,
        message: "Product not found."
      });
    }

    // Soft delete - set isDeleted to true
    const deletedProduct = await Product.findByIdAndUpdate(
      id,
      { isDeleted: true },
      { new: true }
    );

    sendSuccessResponse({
      res,
      data: deletedProduct,
      message: "Product deleted successfully",
      status: 200
    });

  } catch (error) {
    next(error);
  }
};

// Get product by ID
const getProductById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const product = await Product.findById(id).select("-__v -createdAt -updatedAt");
    
    if (!product) {
      return sendErrorResponse({
        status: 404,
        res,
        message: "Product not found."
      });
    }

    sendSuccessResponse({
      res,
      data: product,
      message: "Product retrieved successfully",
      status: 200
    });

  } catch (error) {
    next(error);
  }
};

export default {
  createProduct,
  getAllProducts,
  updateProduct,
  deleteProduct,
  getProductById,
};