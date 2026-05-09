import { sendSuccessResponse } from "../util/commonResponses.js";

/** Manual endpoint kept for backwards compatibility; status is no longer auto-changed to over_due. */
const checkOverDue = async (req, res, next) => {
  try {
    return sendSuccessResponse({
      res,
      message:
        "Automatic movement to Over Due is disabled. Orders stay in their workflow column; use Order Management for deadline highlights.",
      status: 200,
      data: { updatedCount: 0, legacyNoOp: true },
    });
  } catch (error) {
    next(error);
  }
};

export default { checkOverDue };