/** Pragalbh Jewels — SKU code dictionaries */

export const COMPANY_CODE = "PJ";

export const SKU_CATEGORIES = {
  RNG: "Ring",
  ERG: "Earrings",
  PNG: "Pendant",
  NEC: "Necklace",
  BRC: "Bracelet",
  BNG: "Bangle",
  CHN: "Chain",
};

export const SKU_METALS = {
  "18K": "18 Karat Gold",
  "14K": "14 Karat Gold",
  "10K": "10 Karat Gold",
  SIL: "Silver",
  PT: "Platinum",
};

export const SKU_STONES = {
  DIA: "Diamond",
  LGD: "Lab Grown Diamond",
  MOS: "Moissanite",
  GEM: "Gemstone",
  NOSTONE: "No Stone",
};

export const SKU_COLLECTIONS = {
  CLS: "Classic",
  MOD: "Modern",
  VNT: "Vintage",
  CST: "Custom",
  ENG: "Engagement",
};

export const SKU_VARIANTS = {
  YG: "Yellow Gold",
  WG: "White Gold",
  RG: "Rose Gold",
  MIX: "Mixed",
};

export const JEWELRY_TYPES = [
  "gold",
  "diamond",
  "lab_grown_diamond",
  "moissanite",
  "silver",
  "custom",
];

export const ORDER_CHANNELS = [
  "b2b",
  "b2c",
  "etsy",
  "alibaba",
  "website",
  "custom",
];

export const DEFAULT_TEMPLATE_SEGMENTS = [
  "COMPANY",
  "CATEGORY",
  "SEQUENCE",
];

export const LEGACY_TEMPLATE_SEGMENTS = [
  "COMPANY",
  "CATEGORY",
  "METAL",
  "STONE",
  "COLLECTION",
  "VARIANT",
  "SEQUENCE",
];

export const SKU_CODE_REGEX = /^[A-Z0-9]+(-[A-Z0-9]+)*$/;

export const SEQUENCE_PAD = 5;

export function padSequence(n, width = SEQUENCE_PAD) {
  return String(n).padStart(width, "0");
}

export function isValidSkuCode(code) {
  if (!code || typeof code !== "string") return false;
  return SKU_CODE_REGEX.test(code.trim().toUpperCase());
}
