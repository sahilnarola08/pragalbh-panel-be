import Master from "../models/master.js";
import MasterAssets from "../models/masterAssets.js";
import { sendSuccessResponse, sendErrorResponse } from "../util/commonResponses.js";
import mongoose from "mongoose";

// Create master - accepts single object
const createMaster = async (req, res, next) => {
    try {
        const { name, master, isActive } = req.body;

        // Validate name
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return sendErrorResponse({
                res,
                message: "Name is required",
                status: 400
            });
        }

        // Validate master (ObjectId) if provided
        if (master !== undefined && master !== null) {
            if (!mongoose.Types.ObjectId.isValid(master)) {
                return sendErrorResponse({
                    res,
                    message: "Invalid master ID format",
                    status: 400
                });
            }
        }

        // Validate isActive (optional, default true)
        if (isActive !== undefined && typeof isActive !== 'boolean') {
            return sendErrorResponse({
                res,
                message: "isActive must be a boolean",
                status: 400
            });
        }

        const trimmedName = name.trim();

        // Check if master already exists and is not deleted
        const existingMaster = await Master.findOne({
            name: trimmedName,
            isDeleted: false
        });

        if (existingMaster) {
            return sendErrorResponse({
                res,
                message: `"${trimmedName}" already exists`,
                status: 400
            });
        }

        // Check if master exists but is deleted (inactive)
        const deletedMaster = await Master.findOne({
            name: trimmedName,
            isDeleted: true
        });

        if (deletedMaster) {
            return sendErrorResponse({
                res,
                message: `This master name "${trimmedName}" is inactive. Please activate it and use it instead of creating a new one.`,
                status: 400
            });
        }

        // Create master
        const newMaster = await Master.create({
            name: trimmedName,
            master: master && mongoose.Types.ObjectId.isValid(master) ? master : undefined,
            isActive: isActive !== undefined ? isActive : true
        });

        sendSuccessResponse({
            res,
            data: newMaster,
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
            sortField = "name",
            sortOrder = "asc",
            masterType = "" // Add master type filter
        } = req.query;

        // Parse page and limit to integers with proper defaults and validation
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.max(1, parseInt(limit, 10) || 10);
        const offset = (pageNum - 1) * limitNum;

        // Build match stage for filtering - only not deleted masters
        const matchStage = { isDeleted: false };

        // Filter by master type (master asset ID)
        if (masterType && masterType.trim().length > 0) {
            matchStage.master = masterType.trim();
        }

        // Search by name (case-insensitive)
        if (search && search.trim().length > 0) {
            const searchPattern = search.trim();
            matchStage.name = { $regex: searchPattern, $options: "i" };
        }

        // Build sort object
        const sortObj = {};
        sortObj[sortField] = sortOrder === "asc" ? 1 : -1;

        // Query masters: not deleted, with pagination, desired sort
        const masters = await Master.find(matchStage)
            .sort(sortObj)
            .skip(offset)
            .limit(limitNum)
            .select("name master isActive") // Only select name, master, isActive
            .populate({
                path: 'master',
                select: 'name'
            });

        // Get total count (no skip/limit)
        const totalMasters = await Master.countDocuments(matchStage);

        // Build response data with masters array and pagination fields
        const responseData = {
            masters: masters,
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
        })
        .select("-__v")
        .populate('master', 'name');
        
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
        const { name, master, isActive } = req.body;

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
            
            // Check if name already exists (excluding current master)
            const nameToCheck = name.trim();
            
            const duplicateMaster = await Master.findOne({
                name: nameToCheck,
                _id: { $ne: id },
                isDeleted: false
            });

            if (duplicateMaster) {
                return sendErrorResponse({
                    res,
                    message: `"${nameToCheck}" already exists`,
                    status: 400
                });
            }

            updateData.name = nameToCheck;
        }

        // Validate and update master (ObjectId) if provided
        if (master !== undefined) {
            if (master !== null && !mongoose.Types.ObjectId.isValid(master)) {
                return sendErrorResponse({
                    res,
                    message: "Invalid master ID format",
                    status: 400
                });
            }
            updateData.master = master && mongoose.Types.ObjectId.isValid(master) ? master : null;
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
        )
        .select("-__v")
        .populate('master', 'name');

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

// ==================== Master Assets Controllers ====================

// Create master asset
const createMasterAsset = async (req, res, next) => {
    try {
        const { masterName } = req.body;

        // Validate master name
        if (!masterName || typeof masterName !== 'string' || masterName.trim().length === 0) {
            return sendErrorResponse({
                res,
                message: "Master name is required",
                status: 400
            });
        }

        const assetName = masterName.trim();

        // Check if master asset with this name already exists (unique name check)
        const existingAsset = await MasterAssets.findOne({
            name: assetName,
            isDeleted: false
        });

        if (existingAsset) {
            return sendErrorResponse({
                res,
                message: `Master asset with name "${assetName}" already exists`,
                status: 400
            });
        }

        // Create master asset with masterName as name
        const masterAsset = await MasterAssets.create({
            name: assetName
        });

        // Return required fields: _id, masterName, isDeleted
        const responseData = {
            _id: masterAsset._id,
            masterName: assetName,
            isDeleted: masterAsset.isDeleted
        };

        sendSuccessResponse({
            res,
            data: responseData,
            message: "Master asset created successfully",
            status: 200
        });
    } catch (error) {
        // Handle duplicate key error
        if (error.code === 11000) {
            return sendErrorResponse({
                res,
                message: "Duplicate entry detected. This master asset already exists.",
                status: 400
            });
        }
        next(error);
    }
};

// Get all master assets sorted alphabetically
const getAllMasterAssets = async (req, res, next) => {
    try {
        // Get all master assets that are not deleted, sorted alphabetically by name
        const masterAssets = await MasterAssets.find({ isDeleted: false })
            .sort({ name: 1 }) // Sort alphabetically ascending (a, b, c, d...)
            .select("_id name isDeleted");

        // Convert to plain objects
        const assetsList = masterAssets.map(asset => {
            const assetObj = asset.toObject();
            return {
                _id: assetObj._id,
                name: assetObj.name,
                isDeleted: assetObj.isDeleted
            };
        });

        sendSuccessResponse({
            res,
            data: assetsList,
            message: "Master assets retrieved successfully",
            status: 200
        });
    } catch (error) {
        next(error);
    }
};

// Get master asset by ID
const getMasterAssetById = async (req, res, next) => {
    try {
        const { id } = req.params;

        // Validate ID format
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return sendErrorResponse({
                res,
                message: "Invalid master asset ID format",
                status: 400
            });
        }

        // Find master asset by ID
        const masterAsset = await MasterAssets.findOne({
            _id: id,
            isDeleted: false
        }).select("_id name isDeleted");

        if (!masterAsset) {
            return sendErrorResponse({
                res,
                message: "Master asset not found",
                status: 404
            });
        }

        const responseData = {
            _id: masterAsset._id,
            name: masterAsset.name,
            isDeleted: masterAsset.isDeleted
        };

        sendSuccessResponse({
            res,
            data: responseData,
            message: "Master asset retrieved successfully",
            status: 200
        });
    } catch (error) {
        next(error);
    }
};

// Update master asset
const updateMasterAsset = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { masterName } = req.body;

        // Validate ID format
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return sendErrorResponse({
                res,
                message: "Invalid master asset ID format",
                status: 400
            });
        }

        // Validate master name
        if (!masterName || typeof masterName !== 'string' || masterName.trim().length === 0) {
            return sendErrorResponse({
                res,
                message: "Master name is required",
                status: 400
            });
        }

        const assetName = masterName.trim();

        // Check if master asset exists and is not deleted
        const existingAsset = await MasterAssets.findOne({
            _id: id,
            isDeleted: false
        });

        if (!existingAsset) {
            return sendErrorResponse({
                res,
                message: "Master asset not found",
                status: 404
            });
        }

        // Check if another master asset with same name exists (excluding current one)
        const duplicateAsset = await MasterAssets.findOne({
            name: assetName,
            isDeleted: false,
            _id: { $ne: id }
        });

        if (duplicateAsset) {
            return sendErrorResponse({
                res,
                message: `Master asset with name "${assetName}" already exists`,
                status: 400
            });
        }

        // Update master asset
        const updatedAsset = await MasterAssets.findByIdAndUpdate(
            id,
            { name: assetName },
            { new: true, runValidators: true }
        ).select("_id name isDeleted");

        const responseData = {
            _id: updatedAsset._id,
            masterName: updatedAsset.name,
            isDeleted: updatedAsset.isDeleted
        };

        sendSuccessResponse({
            res,
            data: responseData,
            message: "Master asset updated successfully",
            status: 200
        });
    } catch (error) {
        // Handle duplicate key error
        if (error.code === 11000) {
            return sendErrorResponse({
                res,
                message: "Duplicate entry detected. This master asset already exists.",
                status: 400
            });
        }
        next(error);
    }
};

// Delete master asset (soft delete)
const deleteMasterAsset = async (req, res, next) => {
    try {
        const { id } = req.params;

        // Validate ID format
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return sendErrorResponse({
                res,
                message: "Invalid master asset ID format",
                status: 400
            });
        }

        // Check if master asset exists and is not already deleted
        const masterAsset = await MasterAssets.findOne({
            _id: id,
            isDeleted: false
        });

        if (!masterAsset) {
            return sendErrorResponse({
                res,
                message: "Master asset not found",
                status: 404
            });
        }

        // Check if any masters are using this master asset
        const mastersUsingAsset = await Master.findOne({
            master: id,
            isDeleted: false
        });

        if (mastersUsingAsset) {
            return sendErrorResponse({
                res,
                message: "Cannot delete master asset. It is being used by one or more masters",
                status: 400
            });
        }

        // Soft delete the master asset
        await MasterAssets.findByIdAndUpdate(id, { isDeleted: true });

        sendSuccessResponse({
            res,
            data: { _id: id },
            message: "Master asset deleted successfully",
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
    createMasterAsset,
    getAllMasterAssets,
    getMasterAssetById,
    updateMasterAsset,
    deleteMasterAsset,
};

