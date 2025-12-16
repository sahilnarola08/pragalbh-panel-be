import Product from "../models/product.js";
import Master from "../models/master.js";
import { sendSuccessResponse, sendErrorResponse } from "../util/commonResponses.js";
import mongoose from "mongoose";

const DEFAULT_IMAGE_PLACEHOLDER =
  "https://placehold.co/100x100/A0B2C7/FFFFFF?text=Product";

const extractImageURLs = (input, { fallback } = { fallback: false }) => {
  if (input === undefined || input === null) {
    return fallback ? [{ img: DEFAULT_IMAGE_PLACEHOLDER }] : undefined;
  }

  const arrayInput = Array.isArray(input) ? input : [input];

  const normalized = arrayInput
    .map((item) => {
      if (!item) return null;

      if (typeof item === "string") {
        const trimmed = item.trim();
        return trimmed ? { img: trimmed } : null;
      }

      if (typeof item === "object" && item !== null) {
        const candidate =
          item.img ??
          item.url ??
          item.imageUrl ??
          item.relativePath ??
          item.path;

        if (typeof candidate === "string" && candidate.trim()) {
          return { img: candidate.trim() };
        }
      }

      return null;
    })
    .filter(Boolean);

  if (normalized.length) {
    return normalized;
  }

  return fallback ? [{ img: DEFAULT_IMAGE_PLACEHOLDER }] : undefined;
};

// create product controller
const createProduct = async (req, res) => {
  try {
    const { category, productName, imageURLs, image } = req.body;

    // Validate category ObjectId format
    if (!mongoose.Types.ObjectId.isValid(category)) {
      return sendErrorResponse({
        res,
        message: "Invalid category ID format.",
        status: 400,
      });
    }

    // Ensure category exists and is active (not deleted)
    const categoryMaster = await Master.findOne({
      _id: category,
      isDeleted: false,
    }).select("_id name");

    if (!categoryMaster) {
      return sendErrorResponse({
        res,
        message: "Category not found or is inactive.",
        status: 400,
      });
    }

    const trimmedProductName = productName.trim();

    // check if product already exists in same category
    const existing = await Product.findOne({
      category,
      productName: trimmedProductName,
      isDeleted: { $ne: true },
    });
    if (existing) {
      return sendErrorResponse({
        res,
        message: "Product already exists in this category",
        status: 400,
      });
    }

    const normalizedImageURLs = extractImageURLs(
      imageURLs ?? image,
      { fallback: true }
    );

    const newProduct = await Product.create({
      category,
      productName: trimmedProductName,
      imageURLs: normalizedImageURLs,
    });

    await newProduct.populate({
      path: "category",
      select: "_id name",
      match: { isDeleted: false },
    });

    // ✅ Invalidate cache after product creation
    const { invalidateCache } = await import("../util/cacheHelper.js");
    invalidateCache('product');
    invalidateCache('dashboard');

    return sendSuccessResponse({
      res,
      data: newProduct,
      message: "Product created successfully",
      status: 200,
    });
  } catch (err) {
    console.error("Error creating product:", err);
    return sendErrorResponse({
      res,
      message: "Failed to create product",
      status: 500,
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
      startDate = "",
      endDate = ""
    } = req.query;

    // Parse page and limit to integers with proper defaults and validation
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 10);
    const offset = (pageNum - 1) * limitNum;

    // Sorting
    const sort = {};
    sort[sortField] = sortOrder === "asc" ? 1 : -1;

    // Search filter - exclude deleted products
    const filter = { isDeleted: false };
    if (search && search.trim().length > 0) {
      const searchRegex = new RegExp(search.trim(), "i");
      const orConditions = [
        { productName: searchRegex },
      ];

      // If search is a valid ObjectId, include category match
      if (mongoose.Types.ObjectId.isValid(search.trim())) {
        orConditions.push({ category: search.trim() });
      }

      // ✅ Optimize: Search category names in Master collection with lean()
      const matchingCategories = await Master.find({
        name: searchRegex,
        isDeleted: false,
      }).select("_id").lean();

      if (matchingCategories.length > 0) {
        const categoryIds = matchingCategories.map((cat) => cat._id);
        orConditions.push({ category: { $in: categoryIds } });
      }

      filter.$or = orConditions;
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

    // ✅ Optimize: Run count and find in parallel, use lean()
    const [products, totalProducts] = await Promise.all([
      Product.find(filter)
        .sort(sort)
        .skip(offset)
        .limit(limitNum)
        .populate({
          path: "category",
          select: "_id name",
          match: { isDeleted: false },
        })
        .lean(),
      Product.countDocuments(filter)
    ]);

    // Set cache-control headers to prevent browser caching (304 responses)
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

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

    // Check if product exists and is not deleted
    const existingProduct = await Product.findById(id);
    if (!existingProduct || existingProduct.isDeleted) {
      return sendErrorResponse({
        status: 404,
        res,
        message: "Product not found."
      });
    }

    // Validate category if provided
    if (updateData.category !== undefined) {
      if (updateData.category && !mongoose.Types.ObjectId.isValid(updateData.category)) {
        return sendErrorResponse({
          status: 400,
          res,
          message: "Invalid category ID format.",
        });
      }

      if (updateData.category) {
        const categoryMaster = await Master.findOne({
          _id: updateData.category,
          isDeleted: false,
        });

        if (!categoryMaster) {
          return sendErrorResponse({
            status: 400,
            res,
            message: "Category not found or is inactive.",
          });
        }
      }
    }

    // Trim productName if provided
    if (updateData.productName) {
      updateData.productName = updateData.productName.trim();
    }

    if (
      Object.prototype.hasOwnProperty.call(updateData, "imageURLs") ||
      Object.prototype.hasOwnProperty.call(updateData, "image")
    ) {
      const normalizedImageURLs = extractImageURLs(
        updateData.imageURLs ?? updateData.image,
        { fallback: true }
      );
      updateData.imageURLs = normalizedImageURLs;
      delete updateData.image;
    }

    const categoryToCheck =
      updateData.category !== undefined && updateData.category !== null
        ? updateData.category
        : existingProduct.category;
    const productNameToCheck =
      updateData.productName !== undefined && updateData.productName !== null
        ? updateData.productName
        : existingProduct.productName;

    // Check if product with same category and name already exists (excluding current product)
    const existingProductByCategoryAndName = await Product.findOne({
      category: categoryToCheck,
      productName: productNameToCheck,
      _id: { $ne: id },
      isDeleted: { $ne: true },
    });
    if (existingProductByCategoryAndName) {
      return sendErrorResponse({
        status: 400,
        res,
        message: "Product with this name already exists in this category.",
      });
    }

    // Update product
    const updatedProduct = await Product.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .select("-__v")
      .populate({
        path: "category",
        select: "_id name",
        match: { isDeleted: false },
      })
      .lean();

    // ✅ Invalidate cache after product update
    const { invalidateCache } = await import("../util/cacheHelper.js");
    invalidateCache('product', id);
    invalidateCache('dashboard');

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
    if (!existingProduct || existingProduct.isDeleted) {
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
    )
      .lean();

    // ✅ Invalidate cache after product deletion
    const { invalidateCache } = await import("../util/cacheHelper.js");
    invalidateCache('product', id);
    invalidateCache('dashboard');

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

    const product = await Product.findById(id)
      .select("-__v -createdAt -updatedAt")
      .populate({
        path: "category",
        select: "_id name",
        match: { isDeleted: false },
      })
      .lean();
    
    if (!product || product.isDeleted) {
      return sendErrorResponse({
        status: 404,
        res,
        message: "Product not found."
      });
    }

    // Set cache-control headers to prevent browser caching (304 responses)
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

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