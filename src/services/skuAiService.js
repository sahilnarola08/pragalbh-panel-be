import {
  SKU_CATEGORIES,
  SKU_METALS,
  SKU_STONES,
  SKU_COLLECTIONS,
  SKU_VARIANTS,
} from "../constants/skuConstants.js";

const CATEGORY_KEYWORDS = {
  RNG: ["ring", "band", "solitaire ring"],
  ERG: ["earring", "stud", "hoop"],
  PNG: ["pendant", "locket"],
  NEC: ["necklace", "choker", "lariat"],
  BRC: ["bracelet", "tennis bracelet"],
  BNG: ["bangle"],
  CHN: ["chain", "cable chain"],
};

const METAL_KEYWORDS = {
  "18K": ["18k", "18 karat", "18-carat"],
  "14K": ["14k", "14 karat"],
  "10K": ["10k", "10 karat"],
  SIL: ["silver", "sterling"],
  PT: ["platinum", "pt950"],
};

const STONE_KEYWORDS = {
  DIA: ["diamond", "natural diamond"],
  LGD: ["lab grown", "lab-grown", "lgd", "lab diamond"],
  MOS: ["moissanite"],
  GEM: ["ruby", "sapphire", "emerald", "gemstone", "gem"],
  NOSTONE: ["no stone", "plain metal", "metal only"],
};

const COLLECTION_KEYWORDS = {
  ENG: ["engagement", "bridal"],
  CLS: ["classic", "timeless"],
  MOD: ["modern", "contemporary"],
  VNT: ["vintage", "antique"],
  CST: ["custom", "bespoke"],
};

const VARIANT_KEYWORDS = {
  YG: ["yellow gold", "yg"],
  WG: ["white gold", "wg", "rhodium"],
  RG: ["rose gold", "pink gold", "rg"],
  MIX: ["two tone", "mixed metal", "tri-color"],
};

function matchFromKeywords(text, keywordMap) {
  const lower = text.toLowerCase();
  for (const [code, keywords] of Object.entries(keywordMap)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return code;
    }
  }
  return null;
}

/**
 * Rule-based NLP for SKU attribute detection (no external AI API required).
 */
export function parseSkuFromDescription(description = "") {
  const text = String(description).trim();
  if (!text) {
    return { confidence: 0, attributes: {}, suggestions: [] };
  }

  const category = matchFromKeywords(text, CATEGORY_KEYWORDS) || "RNG";
  const metal = matchFromKeywords(text, METAL_KEYWORDS) || "18K";
  const stone = matchFromKeywords(text, STONE_KEYWORDS) || "DIA";
  const collection = matchFromKeywords(text, COLLECTION_KEYWORDS) || "ENG";
  const variant = matchFromKeywords(text, VARIANT_KEYWORDS) || "YG";

  let confidence = 0.4;
  if (matchFromKeywords(text, CATEGORY_KEYWORDS)) confidence += 0.15;
  if (matchFromKeywords(text, METAL_KEYWORDS)) confidence += 0.15;
  if (matchFromKeywords(text, STONE_KEYWORDS)) confidence += 0.15;
  if (matchFromKeywords(text, COLLECTION_KEYWORDS)) confidence += 0.1;
  if (matchFromKeywords(text, VARIANT_KEYWORDS)) confidence += 0.05;

  return {
    confidence: Math.min(confidence, 1),
    attributes: { category, metal, stone, collection, variant },
    labels: {
      category: SKU_CATEGORIES[category],
      metal: SKU_METALS[metal],
      stone: SKU_STONES[stone],
      collection: SKU_COLLECTIONS[collection],
      variant: SKU_VARIANTS[variant],
    },
    suggestions: [],
  };
}
