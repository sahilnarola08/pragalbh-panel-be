import Master from "../models/master.js";
import { sendSuccessResponse, sendErrorResponse } from "../util/commonResponses.js";
import { MASTER_TYPE, MASTER_TYPE_LABELS } from "../helper/enums.js";

// Create master - accepts single object
const createMaster = async (req, res, next) => {
    try {
        const { name, masterType, isActive } = req.body;

        // Validate name
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return sendErrorResponse({
                res,
                message: "Name is required",
                status: 400
            });
        }

        // Validate masterType
        if (masterType === undefined || masterType === null) {
            return sendErrorResponse({
                res,
                message: "Master type is required",
                status: 400
            });
        }

        if (!Object.values(MASTER_TYPE).includes(Number(masterType))) {
            return sendErrorResponse({
                res,
                message: "Master type must be 1, 2, 3, or 4",
                status: 400
            });
        }

        // Validate isActive (optional, default true)
        if (isActive !== undefined && typeof isActive !== 'boolean') {
            return sendErrorResponse({
                res,
                message: "isActive must be a boolean",
                status: 400
            });
        }

        // Check if master already exists
        const existingMaster = await Master.findOne({
            name: name.trim(),
            masterType: Number(masterType),
            isDeleted: false
        });

        if (existingMaster) {
            return sendErrorResponse({
                res,
                message: `"${name}" already exists for ${MASTER_TYPE_LABELS[Number(masterType)]} (type ${masterType})`,
                status: 400
            });
        }

        // Create master
        const master = await Master.create({
            name: name.trim(),
            masterType: Number(masterType),
            isActive: isActive !== undefined ? isActive : true
        });

        sendSuccessResponse({
            res,
            data: master,
            message: "Master created successfully",
            status: 200
        });
    } catch (error) {
        // Handle duplicate key error
        if (error.code === 11000) {
            return sendErrorResponse({
                res,
                message: "Duplicate entry detected. This master already exists.",
                status: 400
            });
        }
        next(error);
    }
};

// Get all masters with filtering, search, and pagination
const getAllMasters = async (req, res, next) => {
    try {
        const {
            page = 1,
            limit = 10,
            search = "",
            masterType = 0, // 0 = all types, 1-4 = specific type
            sortField = "masterType",
            sortOrder = "asc"
        } = req.query;

        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const offset = (pageNum - 1) * limitNum;

        // Build match stage for filtering
        const matchStage = { isDeleted: false };

        // Filter by masterType (0 = all, 1-4 = specific type)
        const masterTypeNum = Number(masterType);
        if (masterTypeNum !== 0) {
            if (!Object.values(MASTER_TYPE).includes(masterTypeNum)) {
                return sendErrorResponse({
                    res,
                    message: "Invalid master type. Must be 0 (all), 1, 2, 3, or 4",
                    status: 400
                });
            }
            matchStage.masterType = masterTypeNum;
        }

        // Search by name (case-insensitive)
        if (search && search.trim().length > 0) {
            // Use case-insensitive regex - "i" flag makes it case-insensitive
            // This will match "SBI", "sbi", "Sbi", "SbI", etc.
            const searchPattern = search.trim();
            matchStage.name = { $regex: searchPattern, $options: "i" };
        }

        // Build sort object - default: sort by masterType first, then by name
        const sortObj = {};
        if (sortField === "masterType") {
            sortObj.masterType = sortOrder === "asc" ? 1 : -1;
            sortObj.name = 1; // Secondary sort by name
        } else {
            sortObj[sortField] = sortOrder === "asc" ? 1 : -1;
            sortObj.masterType = 1; // Secondary sort by masterType
        }

        // Get masters with pagination - sorted by masterType (1,2,3,4) then by name
        const sortByTypeAndName = {
            masterType: 1, // Sort by masterType ascending (1, 2, 3, 4)
            name: 1        // Then sort by name ascending
        };

        const masters = await Master.find(matchStage)
            .sort(sortByTypeAndName)
            .skip(offset)
            .limit(limitNum)
            .select("-__v");

        // Convert to plain objects and add id field
        const mastersList = masters.map(master => {
            const masterObj = master.toObject();
            masterObj.id = masterObj._id.toString();
            return masterObj;
        });

        // Get total count
        const totalMasters = await Master.countDocuments(matchStage);

        // Build response data with masters array and pagination fields
        const responseData = {
            masters: mastersList,
            totalCount: totalMasters,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(totalMasters / limitNum),
            hasNextPage: pageNum < Math.ceil(totalMasters / limitNum),
            hasPrevPage: pageNum > 1
        };

        return sendSuccessResponse({
            status: 200,
            res,
            data: responseData,
            message: "Masters retrieved successfully.",
        });
    } catch (error) {
        console.error("Error fetching masters:", error);
        return sendErrorResponse({
            status: 500,
            res,
            message: "Internal Server Error",
            error: error.message,
        });
    }
};

// Get master by ID
const getMasterById = async (req, res, next) => {
    try {
        const { id } = req.params;

        const master = await Master.findOne({ 
            _id: id, 
            isDeleted: false 
        }).select("-__v");
        
        if (!master) {
            return sendErrorResponse({
                status: 404,
                res,
                message: "Master not found."
            });
        }

        // Convert to plain object and add id field
        const masterObj = master.toObject();
        masterObj.id = masterObj._id.toString();

        sendSuccessResponse({
            res,
            data: masterObj,
            message: "Master retrieved successfully",
            status: 200
        });
    } catch (error) {
        next(error);
    }
};

// Update master by ID
const updateMaster = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, masterType, isActive } = req.body;

        // Check if master exists
        const existingMaster = await Master.findOne({ 
            _id: id, 
            isDeleted: false 
        });
        
        if (!existingMaster) {
            return sendErrorResponse({
                status: 404,
                res,
                message: "Master not found."
            });
        }

        // Build update object
        const updateData = {};

        // Validate and update name if provided
        if (name !== undefined) {
            if (!name || typeof name !== 'string' || name.trim().length === 0) {
                return sendErrorResponse({
                    res,
                    message: "Name cannot be empty",
                    status: 400
                });
            }
            
            // Check if name already exists for the same masterType (excluding current master)
            const nameToCheck = name.trim();
            const masterTypeToCheck = masterType !== undefined ? Number(masterType) : existingMaster.masterType;
            
            const duplicateMaster = await Master.findOne({
                name: nameToCheck,
                masterType: masterTypeToCheck,
                _id: { $ne: id },
                isDeleted: false
            });

            if (duplicateMaster) {
                return sendErrorResponse({
                    res,
                    message: `"${nameToCheck}" already exists for ${MASTER_TYPE_LABELS[masterTypeToCheck]} (type ${masterTypeToCheck})`,
                    status: 400
                });
            }

            updateData.name = nameToCheck;
        }

        // Validate and update masterType if provided
        if (masterType !== undefined) {
            if (!Object.values(MASTER_TYPE).includes(Number(masterType))) {
                return sendErrorResponse({
                    res,
                    message: "Master type must be 1, 2, 3, or 4",
                    status: 400
                });
            }

            // If masterType is being changed, check if name conflicts with new type
            if (Number(masterType) !== existingMaster.masterType) {
                const nameToCheck = name !== undefined ? name.trim() : existingMaster.name;
                const duplicateMaster = await Master.findOne({
                    name: nameToCheck,
                    masterType: Number(masterType),
                    _id: { $ne: id },
                    isDeleted: false
                });

                if (duplicateMaster) {
                    return sendErrorResponse({
                        res,
                        message: `"${nameToCheck}" already exists for ${MASTER_TYPE_LABELS[Number(masterType)]} (type ${masterType})`,
                        status: 400
                    });
                }
            }

            updateData.masterType = Number(masterType);
        }

        // Validate and update isActive if provided
        if (isActive !== undefined) {
            if (typeof isActive !== 'boolean') {
                return sendErrorResponse({
                    res,
                    message: "isActive must be a boolean",
                    status: 400
                });
            }
            updateData.isActive = isActive;
        }

        // Update master
        const updatedMaster = await Master.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        ).select("-__v");

        // Convert to plain object and add id field
        const masterObj = updatedMaster.toObject();
        masterObj.id = masterObj._id.toString();

        sendSuccessResponse({
            res,
            data: masterObj,
            message: "Master updated successfully",
            status: 200
        });
    } catch (error) {
        // Handle duplicate key error
        if (error.code === 11000) {
            return sendErrorResponse({
                res,
                message: "Duplicate entry detected. This master already exists.",
                status: 400
            });
        }
        next(error);
    }
};

// Delete master by ID (soft delete - sets isDeleted to true)
const deleteMaster = async (req, res, next) => {
    try {
        const { id } = req.params;

        // Check if master exists and is not already deleted
        const existingMaster = await Master.findOne({ 
            _id: id, 
            isDeleted: false 
        });
        
        if (!existingMaster) {
            return sendErrorResponse({
                status: 404,
                res,
                message: "Master not found or already deleted."
            });
        }

        // Soft delete - set isDeleted to true and isActive to false
        const deletedMaster = await Master.findByIdAndUpdate(
            id,
            { isDeleted: true, isActive: false },
            { new: true }
        ).select("-__v");

        // Convert to plain object and add id field
        const masterObj = deletedMaster.toObject();
        masterObj.id = masterObj._id.toString();

        sendSuccessResponse({
            res,
            data: masterObj,
            message: "Master deleted successfully",
            status: 200
        });
    } catch (error) {
        next(error);
    }
};

export default {
    createMaster,
    getAllMasters,
    getMasterById,
    updateMaster,
    deleteMaster,
};

