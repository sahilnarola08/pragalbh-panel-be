import Order from "../models/order.js";
import { sendSuccessResponse, sendErrorResponse } from "../util/commonResponses.js";

export const createOrder = async (req, res, next) => {
  try {
    const {
      clientName,
      address,
      product,
      orderDate,
      dispatchDate,
      purchasePrice,
      sellingPrice,
      supplier,
      orderPlatform,
      otherDetails
    } = req.body;



    const order = await Order.create({
      clientName,
      address,
      product,
      orderDate,
      dispatchDate,
      purchasePrice,
      sellingPrice,
      supplier,
      orderPlatform,
      otherDetails,
    });

    return sendSuccessResponse({
      res,
      data: order,
      message: "Order created successfully",
      status: 201
    });
  } catch (err) {
    console.error("Error creating order:", err);
    return sendErrorResponse({
      res,
      message: "Failed to create order",
      status: 500
    });
  }
};


//  Get All Orders
const getAllOrders = async (req, res) => {
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
        { clientName: new RegExp(search, "i") },
        { address: new RegExp(search, "i") },
        { product: new RegExp(search, "i") },
        { supplier: new RegExp(search, "i") },
        { orderPlatform: new RegExp(search, "i") },
      ];
    }

    const orders = await Order.find(filter)
      .sort(sort)
      .skip(offset)
      .limit(limitNum);

    const totalOrders = await Order.countDocuments(filter);

    return sendSuccessResponse({
      status: 200,
      res,
      data: {
        orders,
        totalCount: totalOrders,
        page: pageNum,
        limit: limitNum,
      },
      message: "Orders retrieved successfully.",
    });
  } catch (error) {
    console.error("Error fetching orders:", error);
    return sendErrorResponse({
      status: 500,
      res,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};


export default {
    createOrder,
    getAllOrders
}