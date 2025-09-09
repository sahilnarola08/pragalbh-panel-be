import Product from "../models/product.js";
import { sendSuccessResponse, sendErrorResponse } from "../util/commonResponses.js";
// create product contrtoller
 const createProduct = async (req, res) => {
  try {
    const { category, productName } = req.body;

    // check if product already exists in same category
    const existing = await Product.findOne({ category, productName });
    if (existing) {
      return sendErrorResponse({
        res,
        message: "Product already exists in this category",
        status: 400
      });
    }

    const newProduct = await Product.create({ category, productName });

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

    // Search filter
    const filter = {};
    if (search) {
      filter.$or = [
        { category: new RegExp(search, "i") },
        { productName: new RegExp(search, "i") },
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

export default {
  createProduct,
  getAllProducts,
};