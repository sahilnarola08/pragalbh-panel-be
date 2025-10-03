import Order from "../models/order.js";
import { sendSuccessResponse, sendErrorResponse } from "../util/commonResponses.js";
import { ORDER_STATUS, DEFAULT_ORDER_STATUS, DEFAULT_TIME_STATUS, DEFAULT_PAYMENT_STATUS } from "../helper/enums.js";
import Product from "../models/product.js";
import User from "../models/user.js";
import Supplier from "../models/supplier.js";
import mongoose from "mongoose";

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
      initialPayment,
      supplier,
      orderPlatform,
      otherDetails
    } = req.body;

    // ✅ Validate client existence
    const existingClient = await User.findOne({
      $or: [
        { firstName: new RegExp(clientName, "i") },
        { lastName: new RegExp(clientName, "i") },
        { $expr: { $regexMatch: { input: { $concat: ["$firstName", " ", "$lastName"] }, regex: clientName, options: "i" } } }
      ]
    });

    if (!existingClient) {
      return sendErrorResponse({
        res,
        message: `Client "${clientName}" does not exist. Please add client first.`,
        status: 400,
      });
    }

    // ✅ Validate product existence
    const existingProduct = await Product.findOne({
      productName: new RegExp(product, "i")
    });

    if (!existingProduct) {
      return sendErrorResponse({
        res,
        message: `Product "${product}" does not exist. Please add product first.`,
        status: 400,
      });
    }

    let supplierName = supplier?.trim() || "";
    let existingSupplier = null;

    if (supplierName) {
      existingSupplier = await Supplier.findOne({
        $or: [
          { firstName: new RegExp(supplierName, "i") },
          { lastName: new RegExp(supplierName, "i") },
          { company: new RegExp(supplierName, "i") },
          { $expr: { $regexMatch: { input: { $concat: ["$firstName", " ", "$lastName"] }, regex: supplierName, options: "i" } } }
        ]
      });

      if (!existingSupplier) {
        return sendErrorResponse({
          res,
          message: `Supplier "${supplierName}" does not exist. Please add supplier first.`,
          status: 400,
        });
      }
    }

    // The order status will automatically be set to 'pending' because we updated the enums file.
    const order = await Order.create({
      clientName,
      address,
      product,
      orderDate,
      dispatchDate,
      purchasePrice,
      sellingPrice,
      initialPayment,
      supplier,
      orderPlatform,
      otherDetails,
      trackingId: "",
      courierCompany: "",
      status: DEFAULT_ORDER_STATUS,
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

// Get All Orders
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

// Update order by ID
const updateOrder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Check if order exists
    const existingOrder = await Order.findById(id);
    if (!existingOrder) {
      return sendErrorResponse({
        status: 404,
        res,
        message: "Order not found."
      });
    }

    // Validate client existence if clientName is being updated
    if (updateData.clientName) {
      const existingClient = await User.findOne({
        $or: [
          { firstName: new RegExp(updateData.clientName, "i") },
          { lastName: new RegExp(updateData.clientName, "i") },
          { $expr: { $regexMatch: { input: { $concat: ["$firstName", " ", "$lastName"] }, regex: updateData.clientName, options: "i" } } }
        ]
      });

      if (!existingClient) {
        return sendErrorResponse({
          res,
          message: `Client "${updateData.clientName}" does not exist. Please add client first.`,
          status: 400,
        });
      }
    }

    // Validate product existence if product is being updated
    if (updateData.product) {
      const existingProduct = await Product.findOne({
        productName: new RegExp(updateData.product, "i")
      });

      if (!existingProduct) {
        return sendErrorResponse({
          res,
          message: `Product "${updateData.product}" does not exist. Please add product first.`,
          status: 400,
        });
      }
    }

    // Validate supplier existence if supplier is being updated
    if (updateData.supplier && updateData.supplier.trim()) {
      const existingSupplier = await Supplier.findOne({
        $or: [
          { firstName: new RegExp(updateData.supplier, "i") },
          { lastName: new RegExp(updateData.supplier, "i") },
          { company: new RegExp(updateData.supplier, "i") },
          { $expr: { $regexMatch: { input: { $concat: ["$firstName", " ", "$lastName"] }, regex: updateData.supplier, options: "i" } } }
        ]
      });

      if (!existingSupplier) {
        return sendErrorResponse({
          res,
          message: `Supplier "${updateData.supplier}" does not exist. Please add supplier first.`,
          status: 400,
        });
      }
    }

    // Update order
    const updatedOrder = await Order.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).select("-__v");

    sendSuccessResponse({
      res,
      data: updatedOrder,
      message: "Order updated successfully",
      status: 200
    });

  } catch (error) {
    next(error);
  }
};

// Delete order by ID
const deleteOrder = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if order exists
    const existingOrder = await Order.findById(id);
    if (!existingOrder) {
      return sendErrorResponse({
        status: 404,
        res,
        message: "Order not found."
      });
    }

    // Hard delete the order
    await Order.findByIdAndDelete(id);

    sendSuccessResponse({
      res,
      data: null,
      message: "Order deleted successfully",
      status: 200
    });

  } catch (error) {
    next(error);
  }
};

// Get order by ID
const getOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const order = await Order.findById(id).select("-__v");
    
    if (!order) {
      return sendErrorResponse({
        status: 404,
        res,
        message: "Order not found."
      });
    }

    sendSuccessResponse({
      res,
      data: order,
      message: "Order retrieved successfully",
      status: 200
    });

  } catch (error) {
    next(error);
  }
};

// Get Kanban Board Data
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

// Update Order Checklist
export const updateOrderChecklist = async (req, res) => {
  try {
    const { orderId, checklist } = req.body;
    const id = orderId || req.params?.id;

    if (!id) {
      return sendErrorResponse({ res, status: 400, message: "orderId is required" });
    }
    if (!Array.isArray(checklist)) {
      return sendErrorResponse({ res, status: 400, message: "Checklist array is required" });
    }

    const order = await Order.findById(id);
    if (!order) {
      return sendErrorResponse({ res, status: 404, message: "Order not found" });
    }

    order.checklist = checklist;
    await order.save();

    return sendSuccessResponse({
      res,
      status: 200,
      data: order,
      message: "Checklist updated successfully",
    });
  } catch (err) {
    console.error("Error updating checklist:", err);
    return sendErrorResponse({ res, status: 500, message: "Failed to update checklist" });
  }
};

// Update Order Status
export const updateOrderStatus = async (req, res) => {
  try {
    const { orderId, status } = req.body;
    const id = orderId || req.params?.id;

    if (!id) {
      return sendErrorResponse({ res, status: 400, message: "orderId is required" });
    }
    if (!status) {
      return sendErrorResponse({ res, status: 400, message: "status is required" });
    }

    const order = await Order.findById(id);
    if (!order) {
      return sendErrorResponse({ res, status: 404, message: "Order not found" });
    }

    const protectedColumns = [
      ORDER_STATUS.VIDEO_CONFIRMATION,
      ORDER_STATUS.DISPATCH,
      ORDER_STATUS.UPDATED_TRACKING_ID,
    ];

    if (protectedColumns.includes(status)) {
      const requiredChecks = ["diamonds", "movements", "crown", "datetime", "rah"];
      const incomplete = requiredChecks.filter((key) => {
        const found = order.checklist.find((c) => c.id === key);
        return !found || !found.checked;
      });
      if (incomplete.length > 0) {
        return sendErrorResponse({
          res,
          status: 400,
          message: `Cannot move to ${status}. Incomplete checks: ${incomplete.join(", ")}`,
        });
      }
    }

    // Validate payment is complete before moving to DISPATCH
    if (status === ORDER_STATUS.DISPATCH) {
      const initialPayment = order.initialPayment || 0;
      if (initialPayment !== order.sellingPrice) {
        return sendErrorResponse({
          res,
          status: 400,
          message: `Cannot move to dispatch. Payment incomplete. Initial payment: ${initialPayment}, Selling price: ${order.sellingPrice}`,
        });
      }
    }

    order.status = status;
    await order.save();

    return sendSuccessResponse({
      res,
      status: 200,
      data: order,
      message: "Order status updated successfully",
    });

  } catch (err) {
    console.error("Error updating order status:", err);
    return sendErrorResponse({
      res,
      status: 500,
      message: "Failed to update order status",
    });
  }
};

// Update Tracking Info
export const updateTrackingInfo = async (req, res) => {
  try {
    const { orderId, trackingId, courierCompany, shippingCost } = req.body;

    if (!orderId) {
      return sendErrorResponse({ res, status: 400, message: "orderId is required" });
    }
    if (!trackingId || !courierCompany) {
      return sendErrorResponse({
        res,
        status: 400,
        message: "Both trackingId and courierCompany are required",
      });
    }

    // Check if trackingId already exists in another order
    const existingOrder = await Order.findOne({ trackingId, _id: { $ne: orderId } });
    if (existingOrder) {
      return sendErrorResponse({
        res,
        status: 400,
        message: `Tracking ID "${trackingId}" is already assigned to another order.`,
      });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return sendErrorResponse({ res, status: 404, message: "Order not found" });
    }

    order.trackingId = trackingId;
    order.courierCompany = courierCompany;
    order.status = ORDER_STATUS.UPDATED_TRACKING_ID;
    order.trackingIdUpdatedAt = new Date();
    order.shippingCost = shippingCost;
    await order.save();

    return sendSuccessResponse({
      res,
      status: 200,
      data: order,
      message: "Tracking info updated successfully and order moved to Updated Tracking ID column",
    });
  } catch (error) {
    console.error("Error updating tracking info:", error);
    return sendErrorResponse({
      res,
      status: 500,
      message: "Failed to update tracking info",
    });
  }
};

// Update Initial Payment
// export const updateInitialPayment = async (req, res) => {
//   try {
//     const { orderId, initialPayment } = req.body;

//     if (!orderId) {
//       return sendErrorResponse({ res, status: 400, message: "orderId is required" });
//     }
//     if (initialPayment === undefined || initialPayment === null) {
//       return sendErrorResponse({
//         res,
//         status: 400,
//         message: "initialPayment is required",
//       });
//     }
//     if (typeof initialPayment !== 'number' || initialPayment < 0) {
//       return sendErrorResponse({
//         res,
//         status: 400,
//         message: "initialPayment must be a positive number",
//       });
//     }

//     let order = null;
//     if (Mongoose.Types.ObjectId.isValid(orderId)) {
//       order = await Order.findById(orderId);
//     }
//     if (!order) {
//       order = await Order.findOne({ orderId: orderId });
//     }
//     if (!order) {
//       return sendErrorResponse({ res, status: 404, message: "Order not found" });
//     }

//     // Validate that initialPayment doesn't exceed sellingPrice
//     const sellingPrice = Number(order.sellingPrice || 0);
//     if (initialPayment > sellingPrice) {
//       return sendErrorResponse({
//         res,
//         status: 400,
//         message: `Initial payment (${initialPayment}) cannot exceed selling price (${sellingPrice})`,
//       });
//     }

//     order.initialPayment = initialPayment;

//     // Check if payment is complete and automatically set to DISPATCH
//     const isPaymentComplete = Number(initialPayment) === sellingPrice;
//     if (isPaymentComplete && order.status !== ORDER_STATUS.DISPATCH) {
//       order.status = ORDER_STATUS.DISPATCH;
//     }

//     await order.save();

//     return sendSuccessResponse({
//       res,
//       status: 200,
//       data: order,
//       message: "Initial payment updated successfully.",
//     });
//   } catch (error) {
//     console.error("Error updating initial payment:", error);
//     return sendErrorResponse({
//       res,
//       status: 500,
//       message: "Failed to update initial payment",
//     });
//   }
// };

// Update Initial Payment
export const updateInitialPayment = async (req, res) => {
  try {
    const { orderId, initialPayment } = req.body;

    // --- Basic validations ---
    if (!orderId) {
      return sendErrorResponse({ res, status: 400, message: "_id (orderId) is required" });
    }
    if (initialPayment === undefined || initialPayment === null) {
      return sendErrorResponse({
        res,
        status: 400,
        message: "initialPayment is required",
      });
    }
    if (typeof initialPayment !== "number" || initialPayment < 0) {
      return sendErrorResponse({
        res,
        status: 400,
        message: "initialPayment must be a positive number",
      });
    }

    // --- Validate and find by _id ---
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return sendErrorResponse({
        res,
        status: 400,
        message: "Invalid MongoDB _id provided",
      });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return sendErrorResponse({ res, status: 404, message: "Order not found" });
    }

    // --- Validate against sellingPrice ---
    const sellingPrice = Number(order.sellingPrice || 0);
    if (initialPayment > sellingPrice) {
      return sendErrorResponse({
        res,
        status: 400,
        message: `Initial payment (${initialPayment}) cannot exceed selling price (${sellingPrice})`,
      });
    }

    // --- Update payment ---
    order.initialPayment = initialPayment;

    // --- Auto update status if fully paid ---
    const isPaymentComplete = Number(initialPayment) === sellingPrice;
    if (isPaymentComplete && order.status !== ORDER_STATUS.DISPATCH) {
      order.status = ORDER_STATUS.DISPATCH;
    }

    await order.save();

    return sendSuccessResponse({
      res,
      status: 200,
      data: order,
      message: "Initial payment updated successfully.",
    });
  } catch (error) {
    console.error("Error updating initial payment:", error);
    return sendErrorResponse({
      res,
      status: 500,
      message: "Failed to update initial payment",
    });
  }
};


export default {
  createOrder,
  getAllOrders,
  updateOrder,
  deleteOrder,
  getOrderById,
  updateOrderStatus,
  getKanbanData,
  updateOrderChecklist,
  updateTrackingInfo,
  updateInitialPayment
}
