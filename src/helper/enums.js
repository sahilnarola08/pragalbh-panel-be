// Order Status Enum based on Kanban Board Columns
export const ORDER_STATUS = {
    // New status added to match your "Pending Order" column
    PENDING: "pending",
    OVER_DUE: "over_due",
    STOCK: "stock",
    FACTORY_PROCESS: "factory_process",
    VIDEO_CONFIRMATION: "video_confirmation", 
    DISPATCH: "dispatch",
    UPDATED_TRACKING_ID: "updated_tracking_id",
    DELIVERY_CONFIRMATION: "delivery_confirmation",
    REVIEW: "review",
    DONE: "done"
  };
  
  
  // Payment Status Enum
  export const PAYMENT_STATUS = {
    PENDING: "pending",
    PAID: "paid",
    DONE: "done"
  };
  
  // Default values - Changed to PENDING
  export const DEFAULT_ORDER_STATUS = ORDER_STATUS.PENDING;
  export const DEFAULT_PAYMENT_STATUS = PAYMENT_STATUS.PENDING;
  ;
