import { sendErrorResponse, sendSuccessResponse } from "../util/commonResponses.js";
import { getStorageUsageStats } from "../services/storage/storageUsageService.js";

export async function getStorageUsage(req, res) {
  try {
    const stats = await getStorageUsageStats();
    return sendSuccessResponse({
      res,
      data: stats,
      message: "Storage usage fetched successfully",
      status: 200,
    });
  } catch (error) {
    console.error("Error fetching storage usage:", error);
    return sendErrorResponse({
      res,
      message: "Failed to fetch storage usage",
      status: 500,
      error: error.message || error,
    });
  }
}
