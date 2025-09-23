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

        // Search filter - exclude deleted suppliers
        const filter = { isDeleted: { $ne: true } };
        if (search) {
            filter.$and = [
                { isDeleted: { $ne: true } },
                {
                    $or: [
                        { firstName: new RegExp(search, "i") },
                        { lastName: new RegExp(search, "i") },
                        { company: new RegExp(search, "i") },
                        { contactNumber: new RegExp(search, "i") },
                    ]
                }
            ];
        }

        const suppliers = await Supplier.find({...filter ,isDeleted: false})
            .sort(sort)
            .skip(offset)
            .limit(limitNum);

        const totalSuppliers = await Supplier.countDocuments({...filter ,isDeleted: false});

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

// Update supplier by ID
const updateSupplier = async (req, res, next) => {
    try {
        const { id } = req.params;
        const updateData = req.body || {};

        // Check if supplier exists
        const existingSupplier = await Supplier.findById(id);
        if (!existingSupplier) {
            return sendErrorResponse({
                status: 404,
                res,
                message: "Supplier not found."
            });
        }

        // Check if contact number is being updated and already exists for another supplier
        if (updateData.contactNumber) {
            const existingSupplierByContact = await Supplier.findOne({ 
                contactNumber: updateData.contactNumber,
                _id: { $ne: id }
            });
            if (existingSupplierByContact) {
                return sendErrorResponse({
                    status: 400,
                    res,
                    message: "Contact number already exists for another supplier."
                });
            }
        }

        // Check if company is being updated and already exists for another supplier
        if (updateData.company) {
            const existingSupplierByCompany = await Supplier.findOne({ 
                company: updateData.company,
                _id: { $ne: id }
            });
            if (existingSupplierByCompany) {
                return sendErrorResponse({
                    status: 400,
                    res,
                    message: "Company already exists for another supplier."
                });
            }
        }

        // Update supplier
        const updatedSupplier = await Supplier.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        ).select("-__v");

        sendSuccessResponse({
            res,
            data: updatedSupplier,
            message: "Supplier updated successfully",
            status: 200
        });

    } catch (error) {
        next(error);
    }
};

// Delete supplier by ID
const deleteSupplier = async (req, res, next) => {
    try {
        const { id } = req.params;

        // Check if supplier exists
        const existingSupplier = await Supplier.findById(id);
        if (!existingSupplier) {
            return sendErrorResponse({
                status: 404,
                res,
                message: "Supplier not found."
            });
        }

        // Soft delete - set isDeleted to true
        const deletedSupplier = await Supplier.findByIdAndUpdate(
            id,
            { isDeleted: true },
            { new: true }
        );

        sendSuccessResponse({
            res,
            data: deletedSupplier,
            message: "Supplier deleted successfully",
            status: 200
        });

    } catch (error) {
        next(error);
    }
};

// Get supplier by ID
const getSupplierById = async (req, res, next) => {
    try {
        const { id } = req.params;

        const supplier = await Supplier.findById(id).select("-__v -createdAt -updatedAt");
        
        if (!supplier) {
            return sendErrorResponse({
                status: 404,
                res,
                message: "Supplier not found."
            });
        }

        sendSuccessResponse({
            res,
            data: supplier,
            message: "Supplier retrieved successfully",
            status: 200
        });

    } catch (error) {
        next(error);
    }
};

export default {
    createSupplier,
    getAllSuppliers,
    updateSupplier,
    deleteSupplier,
    getSupplierById,
};