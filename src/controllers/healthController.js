import { sendSuccessResponse, sendErrorResponse } from "../util/commonResponses.js";
const healthController = {
    createHealth: async (req, res) => {
        try {
            sendSuccessResponse({ res, data: {
                status: "200",
            }, message: "Health check successful", status: 200 });
        } catch (error) {
            console.error('Health check error:', error);
            sendErrorResponse({ res, message: "Health check failed", status: 500 });
        }
    }
};

export default healthController; 