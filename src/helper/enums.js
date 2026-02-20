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
    RESERVED: "reserved",
    PROCESSING: "processing",
  };
  
  // Default values - Changed to PENDING
  export const DEFAULT_ORDER_STATUS = ORDER_STATUS.PENDING;
  export const DEFAULT_PAYMENT_STATUS = PAYMENT_STATUS.PENDING;

  // Payment lifecycle (mediator → bank)
  export const PAYMENT_LIFECYCLE_STATUS = {
    PENDING_WITH_MEDIATOR: "pending_with_mediator",
    PROCESSING: "processing",
    CREDITED_TO_BANK: "credited_to_bank",
  };
  export const DEFAULT_PAYMENT_LIFECYCLE_STATUS = PAYMENT_LIFECYCLE_STATUS.PENDING_WITH_MEDIATOR;
  
  // User Role Enum
  export const USER_ROLE = {
    ADMIN: 1,
    USER: 2
  };
  
  // Default role - Admin (1)
  export const DEFAULT_USER_ROLE = USER_ROLE.ADMIN;