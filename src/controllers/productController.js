import Product from "../models/product.js";
import { sendSuccessResponse, sendErrorResponse } from "../util/commonResponses.js";

export const createProduct = async (req, res) => {
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
