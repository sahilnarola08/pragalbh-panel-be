import Order from "../models/order.js";
import { sendSuccessResponse, sendErrorResponse } from "../util/commonResponses.js";
import { ORDER_STATUS } from "../helper/enums.js";

const checkOverDue = async (req, res, next) => {
     try {
        const currentDate = new Date();
        
        // Find overdue orders
        const overdueOrders = await Order.find({
            dispatchDate: { $lt: currentDate }, 
            status: { $in: [ORDER_STATUS.PENDING, ORDER_STATUS.FACTORY_PROCESS, ORDER_STATUS.VIDEO_CONFIRMATION] }
        });
        
        if(overdueOrders.length > 0){
            // Update all overdue orders to status "over_due"
            const updateResult = await Order.updateMany(
                {
                    dispatchDate: { $lt: currentDate }, 
                    status: { $in: [ORDER_STATUS.PENDING, ORDER_STATUS.FACTORY_PROCESS, ORDER_STATUS.VIDEO_CONFIRMATION] }
                },
                {
                    $set: { status: ORDER_STATUS.OVER_DUE }
                }
            );
            
            return sendSuccessResponse({
                res,
                message: `${updateResult.modifiedCount} orders marked as over due`,
                status: 200,
                data: {
                    updatedCount: updateResult.modifiedCount,
                    overdueOrders: overdueOrders
                }
            });
        }
        
        return sendSuccessResponse({
            res,
            message: "No orders are over due",
            status: 200,
            data: []
        });
     } catch (error) {
          next(error);
     }
};

export default { checkOverDue };    