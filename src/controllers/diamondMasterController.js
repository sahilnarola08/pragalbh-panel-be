import DiamondMaster from "../models/diamondMaster.js";
import { sendSuccessResponse, sendErrorResponse } from "../util/commonResponses.js";
import { clearCacheByRoute } from "../middlewares/cache.js";

const DEFAULT_VALUES = {
  diamondType: ["Natural", "Lab Diamond", "Moissanite"],
  clarity: ["FL", "IF", "VVS1", "VVS2", "VS1", "VS2", "SI1", "SI2", "I1", "I2", "I3"],
  color: "D,E,F,G,H,I,J,K,L,M".split(","),
  cut: ["Excellent", "Very Good", "Good", "Fair", "Poor"],
  shape: [
    "Round",
    "Princess",
    "Cushion",
    "Emerald",
    "Oval",
    "Radiant",
    "Asscher",
    "Marquise",
    "Pear",
    "Heart",
    "Trillion",
  ],
};

function slugify(name) {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

async function ensureDefaults() {
  for (const [type, values] of Object.entries(DEFAULT_VALUES)) {
    const existing = await DiamondMaster.countDocuments({ type });
    if (existing > 0) continue;
    const docs = values.map((name, i) => ({
      type,
      name,
      slug: slugify(name),
      displayOrder: i,
      isActive: true,
    }));
    await DiamondMaster.insertMany(docs);
  }
}

export const list = async (req, res) => {
  try {
    const { type, activeOnly } = req.query;
    await ensureDefaults();
    const filter = {};
    if (type) filter.type = type;
    if (activeOnly === "true") filter.isActive = true;
    const list = await DiamondMaster.find(filter)
      .sort({ type: 1, displayOrder: 1, name: 1 })
      .lean();
    return sendSuccessResponse({ res, data: list, message: "Diamond master list" });
  } catch (error) {
    console.error("Diamond master list error (DB may be down):", error.message);
    return sendSuccessResponse({ res, data: [], message: "Diamond master (unavailable)" });
  }
};

export const getByType = async (req, res) => {
  try {
    const { type } = req.params;
    await ensureDefaults();
    const list = await DiamondMaster.find({ type, isActive: true })
      .sort({ displayOrder: 1, name: 1 })
      .lean();
    return sendSuccessResponse({ res, data: list, message: "Diamond master by type" });
  } catch (error) {
    console.error("Diamond master getByType error (DB may be down):", error.message);
    return sendSuccessResponse({ res, data: [], message: "Diamond master by type (unavailable)" });
  }
};

export const create = async (req, res) => {
  try {
    const { type, name, slug, displayOrder, isActive } = req.body;
    const finalSlug = slug || slugify(name);
    const existing = await DiamondMaster.findOne({ type, slug: finalSlug });
    if (existing) {
      return sendErrorResponse({
        res,
        message: "Entry with this slug already exists for this type",
        status: 400,
      });
    }
    const doc = await DiamondMaster.create({
      type,
      name: name.trim(),
      slug: finalSlug,
      displayOrder: Number(displayOrder) || 0,
      isActive: isActive !== false,
    });
    clearCacheByRoute("/diamond-master");
    return sendSuccessResponse({ res, data: doc, message: "Diamond master created" });
  } catch (error) {
    return sendErrorResponse({ res, message: error.message, status: 500 });
  }
};

export const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, slug, displayOrder, isActive } = req.body;
    const doc = await DiamondMaster.findById(id);
    if (!doc) return sendErrorResponse({ res, message: "Not found", status: 404 });
    if (name !== undefined) doc.name = name.trim();
    if (slug !== undefined) doc.slug = slug.trim().toLowerCase();
    if (displayOrder !== undefined) doc.displayOrder = Number(displayOrder);
    if (isActive !== undefined) doc.isActive = isActive;
    await doc.save();
    clearCacheByRoute("/diamond-master");
    return sendSuccessResponse({ res, data: doc, message: "Diamond master updated" });
  } catch (error) {
    return sendErrorResponse({ res, message: error.message, status: 500 });
  }
};

export const remove = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await DiamondMaster.findByIdAndDelete(id);
    if (!doc) return sendErrorResponse({ res, message: "Not found", status: 404 });
    clearCacheByRoute("/diamond-master");
    return sendSuccessResponse({ res, data: null, message: "Deleted" });
  } catch (error) {
    return sendErrorResponse({ res, message: error.message, status: 500 });
  }
};

const DIAMOND_MASTER_TYPES = ["diamondType", "clarity", "color", "cut", "shape"];

export const getTypes = async (req, res) => {
  try {
    return sendSuccessResponse({ res, data: DIAMOND_MASTER_TYPES, message: "Types" });
  } catch (error) {
    return sendSuccessResponse({ res, data: DIAMOND_MASTER_TYPES, message: "Types (fallback)" });
  }
};
