import Supplier from "../models/supplier.js";
import Master from "../models/master.js";
import { sendSuccessResponse, sendErrorResponse } from "../util/commonResponses.js";
import mongoose from "mongoose";

const validateAdvancePayments = async (advancePayments) => {
    if (advancePayments === undefined || advancePayments === null) {
        return;
    }

    if (!Array.isArray(advancePayments)) {
        throw { status: 400, message: "advancePayment must be an array" };
    }

    for (const payment of advancePayments) {
        if (!payment || typeof payment !== "object") {
            throw { status: 400, message: "Each advance payment must be an object" };
        }

        const { bankId, amount } = payment;

        if (!bankId || !mongoose.Types.ObjectId.isValid(bankId)) {
            throw { status: 400, message: `Invalid bank ID format: ${bankId}` };
        }

        const bankExists = await Master.findOne({
            _id: bankId,
            isDeleted: false
        }).select("_id");

        if (!bankExists) {
            throw { status: 400, message: `Bank not found or is inactive for ID: ${bankId}` };
        }

        if (amount === undefined || amount === null) {
            throw { status: 400, message: "Each advance payment must have an amount" };
        }

        if (typeof amount !== "number" || Number.isNaN(amount) || amount < 0) {
            throw { status: 400, message: "Payment amount must be a positive number" };
        }
    }
};

const buildSupplierAggregationPipeline = ({
    matchStage = {},
    sortObj,
    skip,
    limit
} = {}) => {
    const pipeline = [
        { $match: matchStage },
        {
            $lookup: {
                from: "masters",
                let: { bankIds: "$advancePayment.bankId" },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    {
                                        $in: [
                                            "$_id",
                                            { $ifNull: ["$$bankIds", []] }
                                        ]
                                    },
                                    { $eq: ["$isDeleted", false] }
                                ]
                            }
                        }
                    },
                    { $project: { _id: 1, name: 1 } }
                ],
                as: "bankDetails"
            }
        },
        {
            $addFields: {
                fullName: {
                    $concat: ["$firstName", " ", "$lastName"]
                },
                advancePaymentDetails: {
                    $map: {
                        input: { $ifNull: ["$advancePayment", []] },
                        as: "payment",
                        in: {
                            bankId: "$$payment.bankId",
                            amount: "$$payment.amount",
                            bank: {
                                $let: {
                                    vars: {
                                        matchedBank: {
                                            $first: {
                                                $filter: {
                                                    input: "$bankDetails",
                                                    as: "bank",
                                                    cond: {
                                                        $eq: [
                                                            "$$bank._id",
                                                            "$$payment.bankId"
                                                        ]
                                                    }
                                                }
                                            }
                                        }
                                    },
                                    in: {
                                        $cond: [
                                            { $ifNull: ["$$matchedBank", false] },
                                            {
                                                _id: "$$matchedBank._id",
                                                name: "$$matchedBank.name"
                                            },
                                            null
                                        ]
                                    }
                                }
                            }
                        }
                    }
                },
                advancePaymentTotal: {
                    $cond: {
                        if: { $isArray: "$advancePayment" },
                        then: {
                            $sum: {
                                $map: {
                                    input: "$advancePayment",
                                    as: "payment",
                                    in: "$$payment.amount"
                                }
                            }
                        },
                        else: 0
                    }
                }
            }
        },
        {
            $addFields: {
                advancePayment: "$advancePaymentTotal"
            }
        },
        {
            $project: {
                firstName: 1,
                lastName: 1,
                fullName: 1,
                address: 1,
                contactNumber: 1,
                company: 1,
                advancePayment: 1,
                advancePaymentDetails: 1,
                isDeleted: 1,
                createdAt: 1,
                updatedAt: 1
            }
        }
    ];

    if (sortObj && Object.keys(sortObj).length > 0) {
        pipeline.push({ $sort: sortObj });
    }

    if (typeof skip === "number" && skip >= 0) {
        pipeline.push({ $skip: skip });
    }

    if (typeof limit === "number" && limit > 0) {
        pipeline.push({ $limit: limit });
    }

    return pipeline;
};

const fetchSupplierWithAggregates = async (supplierId) => {
    if (!mongoose.Types.ObjectId.isValid(supplierId)) {
        return null;
    }

    const results = await Supplier.aggregate(
        buildSupplierAggregationPipeline({
            matchStage: {
                _id: new mongoose.Types.ObjectId(supplierId),
                isDeleted: false
            }
        })
    );

    if (!results || results.length === 0) {
        return null;
    }

    return results[0];
};

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

        const normalizedCompany = typeof company === "string" ? company.trim() : company;
        const normalizedContactNumber = typeof contactNumber === "string"
            ? contactNumber.trim()
            : contactNumber;

        const existingSupplier = await Supplier.findOne({
            company: normalizedCompany,
            isDeleted: false
        });
        // check if supplier already exists
        if (existingSupplier) {
            return sendErrorResponse({
                res,
                message: "Supplier already exists",
                status: 400
            });
        }

        // Validate advancePayment array if provided
        try {
            await validateAdvancePayments(advancePayment);
        } catch (validationError) {
            return sendErrorResponse({
                res,
                status: validationError.status || 400,
                message: validationError.message || "Invalid advance payment data"
            });
        }

        const sanitizedAdvancePayments = Array.isArray(advancePayment)
            ? advancePayment.map(payment => ({
                bankId: new mongoose.Types.ObjectId(payment.bankId),
                amount: payment.amount
            }))
            : [];

        const supplier = await Supplier.create({
            firstName,
            lastName,
            address,
            contactNumber: normalizedContactNumber,
            company: normalizedCompany,
            advancePayment: sanitizedAdvancePayments
        });

        const supplierPayload = await fetchSupplierWithAggregates(supplier._id);

        sendSuccessResponse({
            res,
            data: supplierPayload || supplier,
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

        // Build match stage for filtering
        const matchStage = { isDeleted: false };
        const normalizedSearch = typeof search === "string" ? search.trim() : "";

        if (normalizedSearch) {
            const searchRegex = new RegExp(normalizedSearch, "i");
            const orConditions = [
                { firstName: searchRegex },
                { lastName: searchRegex },
                { company: searchRegex },
                { contactNumber: searchRegex },
            ];

            if (mongoose.Types.ObjectId.isValid(normalizedSearch)) {
                orConditions.push({ _id: new mongoose.Types.ObjectId(normalizedSearch) });
            }

            const matchingBanks = await Master.find({
                name: searchRegex,
                isDeleted: false
            }).select("_id");

            if (matchingBanks.length > 0) {
                orConditions.push({
                    "advancePayment.bankId": { $in: matchingBanks.map(bank => bank._id) }
                });
            }

            matchStage.$or = orConditions;
        }

        // Build sort object
        const sortObj = {};
        sortObj[sortField] = sortOrder === "asc" ? 1 : -1;

        const pipeline = buildSupplierAggregationPipeline({
            matchStage,
            sortObj,
            skip: offset,
            limit: limitNum
        });

        const suppliers = await Supplier.aggregate(pipeline);

        // Get total count
        const totalSuppliers = await Supplier.countDocuments(matchStage);

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
        if (!existingSupplier || existingSupplier.isDeleted) {
            return sendErrorResponse({
                status: 404,
                res,
                message: "Supplier not found."
            });
        }

        if (updateData.contactNumber && typeof updateData.contactNumber === "string") {
            updateData.contactNumber = updateData.contactNumber.trim();
        }

        if (updateData.company && typeof updateData.company === "string") {
            updateData.company = updateData.company.trim();
        }

        // Check if contact number is being updated and already exists for another supplier
        if (updateData.contactNumber) {
            const existingSupplierByContact = await Supplier.findOne({ 
                contactNumber: updateData.contactNumber,
                _id: { $ne: id },
                isDeleted: false
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
                _id: { $ne: id },
                isDeleted: false
            });
            if (existingSupplierByCompany) {
                return sendErrorResponse({
                    status: 400,
                    res,
                    message: "Company already exists for another supplier."
                });
            }
        }

        // Validate advancePayment array if provided
        if (Object.prototype.hasOwnProperty.call(updateData, "advancePayment")) {
            try {
                await validateAdvancePayments(updateData.advancePayment);
            } catch (validationError) {
                return sendErrorResponse({
                    res,
                    status: validationError.status || 400,
                    message: validationError.message || "Invalid advance payment data"
                });
            }
        }

        if (Array.isArray(updateData.advancePayment)) {
            updateData.advancePayment = updateData.advancePayment.map(payment => ({
                bankId: new mongoose.Types.ObjectId(payment.bankId),
                amount: payment.amount
            }));
        }

        // Update supplier
        const updatedSupplier = await Supplier.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        ).select("-__v");

        const supplierPayload = await fetchSupplierWithAggregates(id);

        sendSuccessResponse({
            res,
            data: supplierPayload || updatedSupplier,
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
        if (!existingSupplier || existingSupplier.isDeleted) {
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

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return sendErrorResponse({
                status: 400,
                res,
                message: "Invalid supplier ID format"
            });
        }

        const supplierData = await Supplier.aggregate(
            buildSupplierAggregationPipeline({
                matchStage: {
                    _id: new mongoose.Types.ObjectId(id),
                    isDeleted: false
                }
            })
        );
        
        if (!supplierData || supplierData.length === 0) {
            return sendErrorResponse({
                status: 404,
                res,
                message: "Supplier not found."
            });
        }

        const { createdAt, updatedAt, ...supplierPayload } = supplierData[0];

        sendSuccessResponse({
            res,
            data: supplierPayload,
            message: "Supplier retrieved successfully",
            status: 200
        });

    } catch (error) {
        next(error);
    }
};




// Add or Update Advance Payment for Supplier
export const updateSupplierBalance = async (req, res) => {
    try {
      const { supplierId, advancePayment } = req.body;
  
      if (!supplierId) {
        return sendErrorResponse({
          res,
          status: 400,
          message: "supplierId is required",
        });
      }

      if (!mongoose.Types.ObjectId.isValid(supplierId)) {
        return sendErrorResponse({
          res,
          status: 400,
          message: "Invalid supplier ID format",
        });
      }

      if (advancePayment === undefined || advancePayment === null) {
        return sendErrorResponse({
          res,
          status: 400,
          message: "advancePayment array is required",
        });
      }

      try {
        await validateAdvancePayments(advancePayment);
      } catch (validationError) {
        return sendErrorResponse({
          res,
          status: validationError.status || 400,
          message: validationError.message || "Invalid advance payment data",
        });
      }

      const supplier = await Supplier.findById(supplierId);
      if (!supplier || supplier.isDeleted) {
        return sendErrorResponse({
          res,
          status: 404,
          message: "Supplier not found",
        });
      }

      // Update the advancePayment array directly
      supplier.advancePayment = Array.isArray(advancePayment)
        ? advancePayment.map(payment => ({
            bankId: new mongoose.Types.ObjectId(payment.bankId),
            amount: payment.amount
          }))
        : [];
      await supplier.save();

      // Get updated supplier with calculated total using aggregation
      const supplierData = await Supplier.aggregate(
        buildSupplierAggregationPipeline({
          matchStage: {
            _id: new mongoose.Types.ObjectId(supplierId),
            isDeleted: false
          }
        })
      );

      if (!supplierData || supplierData.length === 0) {
        return sendErrorResponse({
          res,
          status: 404,
          message: "Supplier not found",
        });
      }
  
      const { createdAt, updatedAt, ...supplierPayload } = supplierData[0];

      return sendSuccessResponse({
        res,
        status: 200,
        message: "Supplier advance payment updated successfully",
        data: supplierPayload,
      });
    } catch (error) {
      console.error("Error updating supplier balance:", error);
      return sendErrorResponse({
        res,
        status: 500,
        message: "Internal Server Error",
        error: error.message,
      });
    }
  };

export default {
    createSupplier,
    getAllSuppliers,
    updateSupplier,
    deleteSupplier,
    getSupplierById,
    updateSupplierBalance,
};