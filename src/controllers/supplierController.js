import Supplier from "../models/supplier.js";
import { sendSuccessResponse, sendErrorResponse } from "../util/commonResponses.js";

// create supplier
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
// get all suppliers
const getAllSuppliers = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            search = "",
            sortField = "createdAt",
            sortOrder = "desc",
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
                { firstName: new RegExp(search, "i") },
                { lastName: new RegExp(search, "i") },
                { company: new RegExp(search, "i") },
                { contactNumber: new RegExp(search, "i") },
            ];
        }

        const suppliers = await Supplier.find(filter)
            .sort(sort)
            .skip(offset)
            .limit(limitNum);

        const totalSuppliers = await Supplier.countDocuments(filter);

        return sendSuccessResponse({
            status: 200,
            res,
            data: {
                suppliers,
                totalCount: totalSuppliers,
                page: pageNum,
                limit: limitNum,
            },
            message: "Suppliers retrieved successfully.",
        });
    } catch (error) {
        console.error("Error fetching suppliers:", error);
        return sendErrorResponse({
            status: 500,
            res,
            message: "Internal Server Error",
            error: error.message,
        });
    }
};

export default {
    createSupplier,
    getAllSuppliers,
};