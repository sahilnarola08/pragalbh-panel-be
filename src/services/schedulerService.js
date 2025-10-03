import cron from "node-cron";
import Order from "../models/order.js";
import { ORDER_STATUS } from "../helper/enums.js";

// Auto mark overdue orders every day at midnight (server time)
export const startSchedulers = () => {
  cron.schedule("0 0 * * *", async () => {
    try {
      const currentDate = new Date();

      // Find overdue orders
      const overdueOrders = await Order.find({
        dispatchDate: { $lt: currentDate },
        status: { $in: [ORDER_STATUS.PENDING, ORDER_STATUS.FACTORY_PROCESS, ORDER_STATUS.VIDEO_CONFIRMATION] },
      });

      if (overdueOrders.length > 0) {
        const updateResult = await Order.updateMany(
          {
            dispatchDate: { $lt: currentDate },
            status: { $in: [ORDER_STATUS.PENDING, ORDER_STATUS.FACTORY_PROCESS, ORDER_STATUS.VIDEO_CONFIRMATION] },
          },
          { $set: { status: ORDER_STATUS.OVER_DUE } }
        );

        console.log(`[Scheduler]  ${updateResult.modifiedCount} orders marked as over_due`);
      } else {
        console.log("[Scheduler]  No overdue orders today");
      }
    } catch (error) {
      console.error("[Scheduler]  Error updating overdue orders:", error);
    }
  });
};
