import LaborPrice from "../models/laborPrice.js";
import { sendSuccessResponse, sendErrorResponse } from "../util/commonResponses.js";

export const create = async (req, res) => {
  try {
    const { metalType, pricePerGram, effectiveFrom, notes, isActive } = req.body;
    const payload = {
      pricePerGram: Number(pricePerGram),
      effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
      notes: notes || "",
      isActive: isActive !== false,
    };
    // Update existing active record for this metal if any; otherwise create one (one record per metal, update in place)
    let doc = await LaborPrice.findOne({ metalType, isActive: true });
    if (doc) {
      doc.pricePerGram = payload.pricePerGram;
      doc.effectiveFrom = payload.effectiveFrom;
      doc.notes = payload.notes;
      doc.isActive = payload.isActive;
      await doc.save();
      return sendSuccessResponse({ res, data: doc, message: "Labor price updated" });
    }
    doc = await LaborPrice.create({
      metalType,
      ...payload,
    });
    return sendSuccessResponse({ res, data: doc, message: "Labor price set" });
  } catch (error) {
    return sendErrorResponse({ res, message: error.message, status: 500 });
  }
};

export const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { pricePerGram, effectiveFrom, notes, isActive } = req.body;
    const doc = await LaborPrice.findById(id);
    if (!doc) return sendErrorResponse({ res, message: "Labor price not found", status: 404 });
    if (pricePerGram != null) doc.pricePerGram = Number(pricePerGram);
    if (effectiveFrom != null) doc.effectiveFrom = new Date(effectiveFrom);
    if (notes !== undefined) doc.notes = notes;
    if (isActive !== undefined) {
      if (isActive) {
        await LaborPrice.updateMany(
          { metalType: doc.metalType, _id: { $ne: id }, isActive: true },
          { $set: { isActive: false } }
        );
      }
      doc.isActive = isActive;
    }
    await doc.save();
    return sendSuccessResponse({ res, data: doc, message: "Labor price updated" });
  } catch (error) {
    return sendErrorResponse({ res, message: error.message, status: 500 });
  }
};

export const getActiveByMetal = async (req, res) => {
  try {
    const { metalType } = req.params;
    const doc = await LaborPrice.findOne({ metalType, isActive: true }).sort({
      effectiveFrom: -1,
    });
    return sendSuccessResponse({ res, data: doc, message: "Active labor price" });
  } catch (error) {
    return sendErrorResponse({ res, message: error.message, status: 500 });
  }
};

const LABOR_METALS = ["Alloy", "Silver", "Gold", "Platinum"];

export const getAllActive = async (req, res) => {
  try {
    const list = await Promise.all(
      LABOR_METALS.map((metalType) =>
        LaborPrice.findOne({ metalType, isActive: true })
          .sort({ effectiveFrom: -1 })
          .lean()
      )
    );
    const data = LABOR_METALS.map((m, i) => ({ metalType: m, laborPrice: list[i] || null }));
    return sendSuccessResponse({ res, data, message: "Active labor prices" });
  } catch (error) {
    console.error("Labor getAllActive error (DB may be down):", error.message);
    const data = LABOR_METALS.map((m) => ({ metalType: m, laborPrice: null }));
    return sendSuccessResponse({ res, data, message: "Active labor (unavailable)" });
  }
};

export const getHistory = async (req, res) => {
  try {
    const { metalType } = req.params;
    const list = await LaborPrice.find({ metalType })
      .sort({ effectiveFrom: -1, createdAt: -1 })
      .lean();
    return sendSuccessResponse({ res, data: list, message: "Labor price history" });
  } catch (error) {
    console.error("Labor getHistory error (DB may be down):", error.message);
    return sendSuccessResponse({ res, data: [], message: "Labor history (unavailable)" });
  }
};

export const list = async (req, res) => {
  try {
    const { metalType, activeOnly } = req.query;
    const filter = {};
    if (metalType) filter.metalType = metalType;
    if (activeOnly === "true") filter.isActive = true;
    const list = await LaborPrice.find(filter)
      .sort({ metalType: 1, effectiveFrom: -1 })
      .lean();
    return sendSuccessResponse({ res, data: list, message: "Labor prices" });
  } catch (error) {
    console.error("Labor list error (DB may be down):", error.message);
    return sendSuccessResponse({ res, data: [], message: "Labor prices (unavailable)" });
  }
};
