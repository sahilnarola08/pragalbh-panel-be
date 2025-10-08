import Supplier from "../models/supplier.js";
import { sendSuccessResponse, sendErrorResponse } from "../util/commonResponses.js";
import mongoose from "mongoose";

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

        // Validate advancePayment array if provided
        if (advancePayment && Array.isArray(advancePayment)) {
            for (let payment of advancePayment) {
                if (!payment.bankId) {
                    return sendErrorResponse({
                        res,
                        message: "Each advance payment must have a bankId",
                        status: 400
                    });
                }
                if (payment.amount === undefined || payment.amount === null) {
                    return sendErrorResponse({
                        res,
                        message: "Each advance payment must have an amount",
                        status: 400
                    });
                }
                if (typeof payment.amount !== 'number' || payment.amount < 0) {
                    return sendErrorResponse({
                        res,
                        message: "Payment amount must be a positive number",
                        status: 400
                    });
                }
            }
        }

        const supplier = await Supplier.create({
            firstName,
            lastName,
            address,
            contactNumber,
            company,
            advancePayment: advancePayment || []
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

        // Build match stage for filtering
        const matchStage = { isDeleted: false };
        if (search) {
            matchStage.$or = [
                { firstName: new RegExp(search, "i") },
                { lastName: new RegExp(search, "i") },
                { company: new RegExp(search, "i") },
                { contactNumber: new RegExp(search, "i") },
            ];
        }

        // Build sort object
        const sortObj = {};
        sortObj[sortField] = sortOrder === "asc" ? 1 : -1;

        // Aggregation pipeline to calculate total advance payment at database level
        const pipeline = [
            { $match: matchStage },
            {
                $addFields: {
                    advancePayment: {
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
                            else: { $ifNull: ["$advancePayment", 0] }
                        }
                    },
                    fullName: {
                        $concat: ["$firstName", " ", "$lastName"]
                    }
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
                    isDeleted: 1,
                    createdAt: 1,
                    updatedAt: 1
                }
            },
            { $sort: sortObj },
            { $skip: offset },
            { $limit: limitNum }
        ];

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

        // Validate advancePayment array if provided
        if (updateData.advancePayment && Array.isArray(updateData.advancePayment)) {
            for (let payment of updateData.advancePayment) {
                if (!payment.bankId) {
                    return sendErrorResponse({
                        res,
                        message: "Each advance payment must have a bankId",
                        status: 400
                    });
                }
                if (payment.amount === undefined || payment.amount === null) {
                    return sendErrorResponse({
                        res,
                        message: "Each advance payment must have an amount",
                        status: 400
                    });
                }
                if (typeof payment.amount !== 'number' || payment.amount < 0) {
                    return sendErrorResponse({
                        res,
                        message: "Payment amount must be a positive number",
                        status: 400
                    });
                }
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

        // Use aggregation to calculate total advance payment
        const supplierData = await Supplier.aggregate([
            { $match: { _id: new mongoose.Types.ObjectId(id) } },
            {
                $addFields: {
                    advancePayment: {
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
                            else: { $ifNull: ["$advancePayment", 0] }
                        }
                    },
                    fullName: {
                        $concat: ["$firstName", " ", "$lastName"]
                    }
                }
            },
            {
                $project: {
                    __v: 0,
                    createdAt: 0,
                    updatedAt: 0
                }
            }
        ]);
        
        if (!supplierData || supplierData.length === 0) {
            return sendErrorResponse({
                status: 404,
                res,
                message: "Supplier not found."
            });
        }

        sendSuccessResponse({
            res,
            data: supplierData[0],
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
      
      if (!advancePayment || !Array.isArray(advancePayment)) {
        return sendErrorResponse({
          res,
          status: 400,
          message: "advancePayment array is required",
        });
      }

      // Validate advancePayment array
      for (let payment of advancePayment) {
        if (!payment.bankId) {
          return sendErrorResponse({
            res,
            message: "Each advance payment must have a bankId",
            status: 400
          });
        }
        if (payment.amount === undefined || payment.amount === null) {
          return sendErrorResponse({
            res,
            message: "Each advance payment must have an amount",
            status: 400
          });
        }
        if (typeof payment.amount !== 'number' || payment.amount < 0) {
          return sendErrorResponse({
            res,
            message: "Payment amount must be a positive number",
            status: 400
          });
        }
      }

      const supplier = await Supplier.findById(supplierId);
      if (!supplier) {
        return sendErrorResponse({
          res,
          status: 404,
          message: "Supplier not found",
        });
      }

      // Update the advancePayment array directly
      supplier.advancePayment = advancePayment;
      await supplier.save();

      // Get updated supplier with calculated total using aggregation
      const supplierData = await Supplier.aggregate([
        { $match: { _id: new mongoose.Types.ObjectId(supplierId) } },
        {
          $addFields: {
            advancePayment: {
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
                else: { $ifNull: ["$advancePayment", 0] }
              }
            },
            fullName: {
              $concat: ["$firstName", " ", "$lastName"]
            }
          }
        }
      ]);
  
      return sendSuccessResponse({
        res,
        status: 200,
        message: "Supplier advance payment updated successfully",
        data: supplierData[0],
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