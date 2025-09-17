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

// Update status endpoint with validation rules
// export const updateOrderStatus = async (req, res) => {
//   try {
//     const { orderId, status, trackingId, courierCompany } = req.body;
//     const id = orderId || req.params?.id;
//     if (!id) {
//       return sendErrorResponse({ res, status: 400, message: "orderId is required" });
//     }
//     if (!status) {
//       return sendErrorResponse({ res, status: 400, message: "status is required" });
//     }

//     const order = await Order.findById(id);
//     if (!order) {
//       return sendErrorResponse({ res, status: 404, message: "Order not found" });
//     }

//     // Validate: factory_process -> video_confirmation requires all required checklist items checked
//     // if (order.status === ORDER_STATUS.FACTORY_PROCESS && status === ORDER_STATUS.VIDEO_CONFIRMATION) {
//     //   const requiredChecks = ["diamonds", "movements", "crown", "datetime", "rah"];
//     //   const incomplete = requiredChecks.filter((key) => {
//     //     const found = order.checklist.find((c) => c.id === key);
//     //     return !found || !found.checked;
//     //   });
//     //   if (incomplete.length > 0) {
//     //     return sendErrorResponse({
//     //       res,
//     //       status: 400,
//     //       message: `Cannot move to video confirmation. Incomplete checks: ${incomplete.join(", ")}`,
//     //     });
//     //   }
//     // }

//     if (status === ORDER_STATUS.VIDEO_CONFIRMATION) {
//       const requiredChecks = ["diamonds", "movements", "crown", "datetime", "rah"];
//       const incomplete = requiredChecks.filter((key) => {
//         const found = order.checklist.find((c) => c.id === key);
//         return !found || !found.checked;
//       });

//       if (incomplete.length > 0) {
//         return sendErrorResponse({
//           res,
//           status: 400,
//           message: `Cannot move to video confirmation. Incomplete checks: ${incomplete.join(", ")}`,
//         });
//       }
//     }

//     // All validations passed — update status
//     order.status = status;
//     await order.save();

//     return sendSuccessResponse({
//       res,
//       status: 200,
//       data: order,
//       message: "Order status updated successfully",
//     });
//   } catch (err) {
//     console.error("Error updating order status:", err);
//     return sendErrorResponse({ res, status: 500, message: "Failed to update order status" });
//   }
// };

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

    // 🔥 Columns that require checklist to be fully completed
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

    // ✅ If we reach here → status can be updated
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


export default {
    createOrder,
    getAllOrders,
    updateOrderStatus,
    getKanbanData,
    updateOrderChecklist
}
