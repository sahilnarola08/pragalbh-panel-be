import Order from "../models/order.js";
import { sendSuccessResponse, sendErrorResponse } from "../util/commonResponses.js";
import { ORDER_STATUS, DEFAULT_ORDER_STATUS, DEFAULT_TIME_STATUS, DEFAULT_PAYMENT_STATUS } from "../helper/enums.js";

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

    // The order status will automatically be set to 'pending' because we updated the enums file.
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
      status: DEFAULT_ORDER_STATUS,
      timeStatus: DEFAULT_TIME_STATUS,
      paymentStatus: DEFAULT_PAYMENT_STATUS,
    });

    return sendSuccessResponse({
      res,
      data: order,
      message: "Order created successfully",
      status: 200
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
      status = ""
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
    
    // Add status filter if provided in the query
    if (status) {
      filter.status = status;
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


const getKanbanData = async (req, res) => {
  try {
    const statuses = Object.values(ORDER_STATUS);
    const kanbanData = {};

    const promises = statuses.map(async (status) => {
      const orders = await Order.find({ status }).sort({ createdAt: 'asc' });
      kanbanData[status] = orders;
    });

    await Promise.all(promises);

    return sendSuccessResponse({
      res,
      data: kanbanData,
      message: "Kanban board data retrieved successfully",
      status: 200
    });

  } catch (err) {
    console.error("Error retrieving Kanban board data:", err);
    return sendErrorResponse({
      res,
      message: "Failed to retrieve Kanban board data",
      status: 500
    });
  }
};

// New function to update the status of an order
const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return sendErrorResponse({
        res,
        message: "Status is required to update an order",
        status: 400
      });
    }

    const order = await Order.findByIdAndUpdate(id, { status }, { new: true });

    if (!order) {
      return sendErrorResponse({
        res,
        message: "Order not found",
        status: 404
      });
    }

    return sendSuccessResponse({
      res,
      data: order,
      message: "Order status updated successfully",
      status: 200
    });

  } catch (err) {
    console.error("Error updating order status:", err);
    return sendErrorResponse({
      res,
      message: "Failed to update order status",
      status: 500
    });
  }
};

export default {
    createOrder,
    getAllOrders,
    updateOrderStatus,
    getKanbanData
}
