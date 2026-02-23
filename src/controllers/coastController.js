import CoastSettings from "../models/coastSettings.js";
import MetalLabor from "../models/metalLabor.js";
import DiamondPrice from "../models/diamondPrice.js";
import DiamondMmCarat from "../models/diamondMmCarat.js";
import { DIAMOND_MM_CARAT_SEED } from "../data/diamondMmCaratSeed.js";
import { getGoldRateResponse, getSilverRateResponse, getPlatinumRateResponse } from "../services/goldRateService.js";
import { sendSuccessResponse, sendErrorResponse } from "../util/commonResponses.js";

const DEFAULT_SETTINGS = {
  current_gold_price: 6000,
  current_silver_price: 80,
  default_profit_margin: 0.45,
};

const DEFAULT_METAL_LABOR = [
  { metal_type: "Alloy", purity_name: "Mixed", purity_factor: 0.5, labor_per_gram: 200 },
  { metal_type: "Gold", purity_name: "24K", purity_factor: 1.0, labor_per_gram: 500 },
  { metal_type: "Gold", purity_name: "22K", purity_factor: 0.9167, labor_per_gram: 450 },
  { metal_type: "Gold", purity_name: "18K", purity_factor: 0.75, labor_per_gram: 400 },
  { metal_type: "Gold", purity_name: "14K", purity_factor: 0.5833, labor_per_gram: 350 },
  { metal_type: "Gold", purity_name: "10K", purity_factor: 10 / 24, labor_per_gram: 320 },
  { metal_type: "Gold", purity_name: "8K", purity_factor: 8 / 24, labor_per_gram: 300 },
  { metal_type: "Silver", purity_name: "925", purity_factor: 0.925, labor_per_gram: 80 },
  { metal_type: "Silver", purity_name: "999", purity_factor: 1.0, labor_per_gram: 100 },
  { metal_type: "Platinum", purity_name: "950", purity_factor: 0.95, labor_per_gram: 800 },
  { metal_type: "Platinum", purity_name: "900", purity_factor: 0.9, labor_per_gram: 750 },
];

const DEFAULT_DIAMOND_PRICES = [
  { origin: "Natural", shape: "Round", carat_min: 0.2, carat_max: 0.5, color: "G", clarity: "VS1", cut_grade: "Excellent", price_per_carat: 280000 },
  { origin: "Natural", shape: "Round", carat_min: 0.2, carat_max: 0.5, color: "G", clarity: "VS2", cut_grade: "Excellent", price_per_carat: 240000 },
  { origin: "Natural", shape: "Round", carat_min: 0.5, carat_max: 1.0, color: "G", clarity: "VS1", cut_grade: "Excellent", price_per_carat: 260000 },
  { origin: "Natural", shape: "Round", carat_min: 0.5, carat_max: 1.0, color: "G", clarity: "VS2", cut_grade: "Excellent", price_per_carat: 220000 },
  { origin: "Lab", shape: "Round", carat_min: 0.2, carat_max: 0.5, color: "G", clarity: "VS1", cut_grade: "Excellent", price_per_carat: 32000 },
  { origin: "Lab", shape: "Round", carat_min: 0.2, carat_max: 0.5, color: "G", clarity: "VS2", cut_grade: "Excellent", price_per_carat: 28000 },
  { origin: "Lab", shape: "Round", carat_min: 0.5, carat_max: 1.0, color: "G", clarity: "VS1", cut_grade: "Excellent", price_per_carat: 30000 },
  { origin: "Lab", shape: "Round", carat_min: 0.5, carat_max: 1.0, color: "G", clarity: "VS2", cut_grade: "Excellent", price_per_carat: 26000 },
  { origin: "Moissanite", shape: "Round", carat_min: 0.2, carat_max: 1.0, color: "D", clarity: "VVS1", cut_grade: "Excellent", price_per_carat: 8000 },
];

async function ensureSettings() {
  let doc = await CoastSettings.findOne();
  if (!doc) {
    doc = await CoastSettings.create(DEFAULT_SETTINGS);
  }
  return doc;
}

async function ensureMetalLabor() {
  // Upsert defaults (do not overwrite existing custom values)
  const ops = DEFAULT_METAL_LABOR.map((row) => ({
    updateOne: {
      filter: { metal_type: row.metal_type, purity_name: row.purity_name },
      update: { $setOnInsert: row },
      upsert: true,
    },
  }));
  if (ops.length) {
    await MetalLabor.bulkWrite(ops, { ordered: false });
  }
}

export const getSettings = async (req, res) => {
  try {
    const doc = await ensureSettings();
    return sendSuccessResponse({ res, data: doc, message: "Settings fetched" });
  } catch (error) {
    console.error("Coast getSettings error (DB may be down):", error.message);
    return sendSuccessResponse({ res, data: DEFAULT_SETTINGS, message: "Settings (default)" });
  }
};

export const updateSettings = async (req, res) => {
  try {
    const { current_gold_price, current_silver_price, default_profit_margin } = req.body;
    let doc = await CoastSettings.findOne();
    if (!doc) {
      doc = await CoastSettings.create({
        current_gold_price: current_gold_price ?? DEFAULT_SETTINGS.current_gold_price,
        current_silver_price: current_silver_price ?? DEFAULT_SETTINGS.current_silver_price,
        default_profit_margin: default_profit_margin ?? DEFAULT_SETTINGS.default_profit_margin,
      });
    } else {
      if (current_gold_price != null) doc.current_gold_price = current_gold_price;
      if (current_silver_price != null) doc.current_silver_price = current_silver_price;
      if (default_profit_margin != null) doc.default_profit_margin = default_profit_margin;
      await doc.save();
    }
    return sendSuccessResponse({ res, data: doc, message: "Settings updated" });
  } catch (error) {
    return sendErrorResponse({ res, message: error.message, status: 500 });
  }
};

export const getMetalLabor = async (req, res) => {
  try {
    await ensureMetalLabor();
    const list = await MetalLabor.find().sort({ metal_type: 1, purity_name: 1 }).lean();
    const withId = list.map((r) => ({ id: r._id.toString(), ...r, _id: undefined }));
    return sendSuccessResponse({ res, data: withId, message: "Metal labor list" });
  } catch (error) {
    console.error("Coast getMetalLabor error (DB may be down):", error.message);
    const fallback = DEFAULT_METAL_LABOR.map((r, i) => ({ id: `fallback-${i}`, ...r }));
    return sendSuccessResponse({ res, data: fallback, message: "Metal labor (default)" });
  }
};

export const getDiamondPrices = async (req, res) => {
  try {
    const list = await DiamondPrice.find().sort({ origin: 1, shape: 1, carat_min: 1 }).lean();
    const withId = list.map((r) => ({ id: r._id.toString(), ...r, _id: undefined }));
    return sendSuccessResponse({ res, data: withId, message: "Diamond prices list" });
  } catch (error) {
    console.error("Coast getDiamondPrices error (DB may be down):", error.message);
    const fallback = DEFAULT_DIAMOND_PRICES.map((r, i) => ({ id: `fallback-${i}`, ...r }));
    return sendSuccessResponse({ res, data: fallback, message: "Diamond prices (default)" });
  }
};

export const getOrigins = async (req, res) => {
  try {
    const origins = await DiamondPrice.distinct("origin").sort();
    return sendSuccessResponse({ res, data: origins, message: "Origins" });
  } catch (error) {
    console.error("Coast getOrigins error (DB may be down):", error.message);
    return sendSuccessResponse({ res, data: [], message: "Origins (unavailable)" });
  }
};

export const getShapesForOrigin = async (req, res) => {
  try {
    const { origin } = req.params;
    const shapes = await DiamondPrice.distinct("shape", { origin }).sort();
    return sendSuccessResponse({ res, data: shapes, message: "Shapes" });
  } catch (error) {
    console.error("Coast getShapes error (DB may be down):", error.message);
    return sendSuccessResponse({ res, data: [], message: "Shapes (unavailable)" });
  }
};

export const getColorsForOriginShape = async (req, res) => {
  try {
    const { origin, shape } = req.params;
    const colors = await DiamondPrice.distinct("color", { origin, shape }).sort();
    return sendSuccessResponse({ res, data: colors, message: "Colors" });
  } catch (error) {
    console.error("Coast getColors error (DB may be down):", error.message);
    return sendSuccessResponse({ res, data: [], message: "Colors (unavailable)" });
  }
};

export const getClaritiesForOriginShapeColor = async (req, res) => {
  try {
    const { origin, shape, color } = req.params;
    const clarities = await DiamondPrice.distinct("clarity", { origin, shape, color }).sort();
    return sendSuccessResponse({ res, data: clarities, message: "Clarities" });
  } catch (error) {
    console.error("Coast getClarities error (DB may be down):", error.message);
    return sendSuccessResponse({ res, data: [], message: "Clarities (unavailable)" });
  }
};

export const getCutGradesForOriginShapeColorClarity = async (req, res) => {
  try {
    const { origin, shape, color, clarity } = req.params;
    const cutGrades = await DiamondPrice.distinct("cut_grade", {
      origin,
      shape,
      color,
      clarity,
    }).sort();
    return sendSuccessResponse({ res, data: cutGrades, message: "Cut grades" });
  } catch (error) {
    console.error("Coast getCutGrades error (DB may be down):", error.message);
    return sendSuccessResponse({ res, data: [], message: "Cut grades (unavailable)" });
  }
};

export const calculateFinalPrice = async (req, res) => {
  try {
    const {
      metalType,
      purityName,
      origin,
      shape,
      color,
      clarity,
      cutGrade,
      carat,
      weightGrams,
      laborOverridePerGram,
    } = req.body;

    const settings = await ensureSettings();
    await ensureMetalLabor();
    const metalRow = await MetalLabor.findOne({ metal_type: metalType, purity_name: purityName });
    if (!metalRow) {
      return sendErrorResponse({ res, message: `Metal ${metalType} ${purityName} not found`, status: 400 });
    }

    let pricePerGram =
      metalType === "Gold"
        ? settings.current_gold_price
        : metalType === "Silver"
          ? settings.current_silver_price
          : metalType === "Platinum"
            ? settings.current_gold_price * 2.5
            : metalType === "Alloy"
              ? settings.current_silver_price * 0.5
              : settings.current_gold_price;

    const metalCost = pricePerGram * metalRow.purity_factor * Number(weightGrams);
    const laborPerGram = laborOverridePerGram != null ? Number(laborOverridePerGram) : metalRow.labor_per_gram;
    const laborCost = laborPerGram * Number(weightGrams);

    const stoneRow = await DiamondPrice.findOne({
      origin,
      shape,
      color,
      clarity,
      cut_grade: cutGrade,
      carat_min: { $lte: Number(carat) },
      carat_max: { $gte: Number(carat) },
    });

    if (!stoneRow) {
      return sendErrorResponse({ res, message: "No matching diamond price found for the selected specs", status: 400 });
    }

    const stoneCost = stoneRow.price_per_carat * Number(carat);
    const totalCost = metalCost + laborCost + stoneCost;
    const profitMargin = settings.default_profit_margin;
    const sellingPrice = totalCost / (1 - profitMargin);

    return sendSuccessResponse({
      res,
      data: {
        metalCost,
        laborCost,
        stoneCost,
        totalCost,
        profitMargin,
        sellingPrice,
        stonePricePerCarat: stoneRow.price_per_carat,
      },
      message: "Price calculated",
    });
  } catch (error) {
    return sendErrorResponse({ res, message: error.message, status: 500 });
  }
};

export const createDiamondPrice = async (req, res) => {
  try {
    const { origin, shape, carat_min, carat_max, color, clarity, cut_grade, price_per_carat } = req.body;
    const toNum = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const doc = await DiamondPrice.create({
      origin: String(origin || "").trim(),
      shape: String(shape || "").trim(),
      carat_min: toNum(carat_min),
      carat_max: toNum(carat_max),
      color: String(color || "").trim(),
      clarity: String(clarity || "").trim(),
      cut_grade: String(cut_grade || "").trim(),
      price_per_carat: toNum(price_per_carat),
    });
    const out = { id: doc._id.toString(), ...doc.toObject(), _id: undefined };
    return sendSuccessResponse({ res, data: out, message: "Diamond price added" });
  } catch (error) {
    return sendErrorResponse({ res, message: error.message, status: 500 });
  }
};

export const updateDiamondPrice = async (req, res) => {
  try {
    const { id } = req.params;
    const { origin, shape, carat_min, carat_max, color, clarity, cut_grade, price_per_carat } = req.body;
    const doc = await DiamondPrice.findById(id);
    if (!doc) return sendErrorResponse({ res, message: "Diamond price not found", status: 404 });
    if (origin != null) doc.origin = String(origin).trim();
    if (shape != null) doc.shape = String(shape).trim();
    if (carat_min != null) doc.carat_min = Number(carat_min);
    if (carat_max != null) doc.carat_max = Number(carat_max);
    if (color != null) doc.color = String(color).trim();
    if (clarity != null) doc.clarity = String(clarity).trim();
    if (cut_grade != null) doc.cut_grade = String(cut_grade).trim();
    if (price_per_carat != null) doc.price_per_carat = Number(price_per_carat);
    await doc.save();
    const out = { id: doc._id.toString(), ...doc.toObject(), _id: undefined };
    return sendSuccessResponse({ res, data: out, message: "Diamond price updated" });
  } catch (error) {
    return sendErrorResponse({ res, message: error.message, status: 500 });
  }
};

export const deleteDiamondPrice = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await DiamondPrice.findByIdAndDelete(id);
    if (!doc) return sendErrorResponse({ res, message: "Diamond price not found", status: 404 });
    return sendSuccessResponse({ res, data: null, message: "Diamond price deleted" });
  } catch (error) {
    return sendErrorResponse({ res, message: error.message, status: 500 });
  }
};

export const bulkDeleteDiamondPrices = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return sendErrorResponse({ res, message: "Body must contain non-empty array of ids", status: 400 });
    }
    const result = await DiamondPrice.deleteMany({ _id: { $in: ids } });
    return sendSuccessResponse({ res, data: { deletedCount: result.deletedCount }, message: "Diamond prices deleted" });
  } catch (error) {
    return sendErrorResponse({ res, message: error.message, status: 500 });
  }
};

export const bulkUpdateDiamondPrices = async (req, res) => {
  try {
    const body = req.body;
    // Support "add to price" for selected ids: { ids: string[], addToPricePerCarat: number }
    if (body.ids != null && Array.isArray(body.ids) && body.ids.length > 0 && Number.isFinite(Number(body.addToPricePerCarat))) {
      const delta = Number(body.addToPricePerCarat);
      const docs = await DiamondPrice.find({ _id: { $in: body.ids } }).lean();
      for (const doc of docs) {
        const newPrice = Math.max(0, (doc.price_per_carat || 0) + delta);
        await DiamondPrice.findByIdAndUpdate(doc._id, { price_per_carat: newPrice });
      }
      return sendSuccessResponse({ res, data: null, message: "Diamond prices updated (add to price)" });
    }
    // Legacy: array of { id, price_per_carat }
    const updates = body;
    if (!Array.isArray(updates)) {
      return sendErrorResponse({ res, message: "Body must be an array of { id, price_per_carat } or { ids, addToPricePerCarat }", status: 400 });
    }
    for (const u of updates) {
      if (u.id != null && Number.isFinite(Number(u.price_per_carat))) {
        await DiamondPrice.findByIdAndUpdate(u.id, { price_per_carat: Number(u.price_per_carat) });
      }
    }
    return sendSuccessResponse({ res, data: null, message: "Diamond prices updated" });
  } catch (error) {
    return sendErrorResponse({ res, message: error.message, status: 500 });
  }
};

export const getGoldRate = async (req, res) => {
  try {
    const payload = await getGoldRateResponse();
    return res.status(200).json(payload);
  } catch (error) {
    return res.status(200).json({
      success: false,
      perGram: null,
      per10Gram: null,
      perTroyOz: null,
      timestamp: null,
      updatedAt: null,
      source: "spot",
      currency: "INR",
      purity: "24K",
      unitNote: "—",
      error: error.message,
    });
  }
};

export const getSilverRate = async (req, res) => {
  try {
    const payload = await getSilverRateResponse();
    return res.status(200).json(payload);
  } catch (error) {
    return res.status(200).json({
      success: false,
      perGram: null,
      per10Gram: null,
      perTroyOz: null,
      timestamp: null,
      updatedAt: null,
      source: "metalpriceapi",
      currency: "INR",
      unitNote: "—",
      error: error.message,
    });
  }
};

export const getPlatinumRate = async (req, res) => {
  try {
    const payload = await getPlatinumRateResponse();
    return res.status(200).json(payload);
  } catch (error) {
    return res.status(200).json({
      success: false,
      perGram: null,
      per10Gram: null,
      perTroyOz: null,
      timestamp: null,
      updatedAt: null,
      source: "metalpriceapi",
      currency: "INR",
      unitNote: "—",
      error: error.message,
    });
  }
};

async function ensureDiamondMmCarat() {
  const count = await DiamondMmCarat.countDocuments();
  if (count === 0 && Array.isArray(DIAMOND_MM_CARAT_SEED) && DIAMOND_MM_CARAT_SEED.length > 0) {
    await DiamondMmCarat.insertMany(DIAMOND_MM_CARAT_SEED);
  }
}

export const getDiamondMmCaratList = async (req, res) => {
  try {
    await ensureDiamondMmCarat();
    const { category } = req.query;
    const filter = category ? { category: String(category).trim() } : {};
    const list = await DiamondMmCarat.find(filter)
      .sort({ category: 1, caratWeight: 1 })
      .lean();
    const data = list.map((r) => ({
      id: r._id.toString(),
      category: r.category,
      millimeter: r.millimeter,
      caratWeight: r.caratWeight,
    }));
    return sendSuccessResponse({ res, data, message: "Diamond mm to carat list" });
  } catch (error) {
    console.error("Coast getDiamondMmCaratList error:", error.message);
    return sendErrorResponse({ res, message: error.message, status: 500 });
  }
};

export const getDiamondMmCaratCategories = async (req, res) => {
  try {
    await ensureDiamondMmCarat();
    const categories = await DiamondMmCarat.distinct("category").sort();
    return sendSuccessResponse({ res, data: categories, message: "Diamond mm-carat categories" });
  } catch (error) {
    console.error("Coast getDiamondMmCaratCategories error:", error.message);
    return sendErrorResponse({ res, message: error.message, status: 500 });
  }
};

/** Seed diamond mm–carat collection. GET/POST: seed if empty. ?force=1: clear and re-seed. */
export const seedDiamondMmCarat = async (req, res) => {
  try {
    const force = String(req.query.force || req.body?.force || "").toLowerCase() === "1" || String(req.query.force || req.body?.force || "").toLowerCase() === "true";
    const count = await DiamondMmCarat.countDocuments();
    if (force && count > 0) {
      await DiamondMmCarat.deleteMany({});
    }
    const currentCount = await DiamondMmCarat.countDocuments();
    if (currentCount === 0 && Array.isArray(DIAMOND_MM_CARAT_SEED) && DIAMOND_MM_CARAT_SEED.length > 0) {
      await DiamondMmCarat.insertMany(DIAMOND_MM_CARAT_SEED);
      const total = await DiamondMmCarat.countDocuments();
      return sendSuccessResponse({
        res,
        data: { seeded: true, inserted: DIAMOND_MM_CARAT_SEED.length, total },
        message: `Inserted ${DIAMOND_MM_CARAT_SEED.length} diamond mm–carat records.`,
      });
    }
    const total = await DiamondMmCarat.countDocuments();
    return sendSuccessResponse({
      res,
      data: { seeded: false, total },
      message: force ? "Collection was empty; no seed data to insert." : `Collection already has ${total} records. Use ?force=1 to clear and re-seed.`,
    });
  } catch (error) {
    console.error("Coast seedDiamondMmCarat error:", error.message);
    return sendErrorResponse({ res, message: error.message, status: 500 });
  }
};
