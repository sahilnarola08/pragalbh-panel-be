import Supplier from "../models/supplier.js";
import { sendSuccessResponse, sendErrorResponse } from "../util/commonResponses.js";


const createSupplier = async (req, res, next) => {
    try {
        const {
            firstName,
            lastName,
            address,
            contactNumber,
            company,
            advancePayment
        } = req.body;
        const existingSupplier = await Supplier.findOne({ company });
        // check if supplier already exists
        if (existingSupplier) {
            return sendErrorResponse({
                res,
                message: "Supplier already exists",
                status: 400
            });
        }
        const supplier = await Supplier.create({
            firstName,
            lastName,
            address,
            contactNumber,
            company,
            advancePayment
        });

        sendSuccessResponse({
            res,
            data: supplier,
            message: "Supplier created successfully",
            status: 200
        });
    } catch (error) {
        next(error);
        
    }

};


export default {
    createSupplier,
};  