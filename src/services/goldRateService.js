const TROY_OZ_TO_GRAM = 31.1034768;
const FREE_GOLD_API = "https://freegoldapi.com/data/latest.json";
const FRANKFURTER_API = "https://api.frankfurter.app/latest?from=USD&to=INR";
const IBJA_API = "https://ibjarates.com/API/GoldRates/";
const METALPRICEAPI_LATEST = "https://api.metalpriceapi.com/v1/latest";
const GOLD_API_BASE = "https://api.gold-api.com";

function round2(n) {
  return Math.round(n * 100) / 100;
}

function formatIbjaDate(d) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function nowInIndia() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(new Date())
    .reduce((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});
  return new Date(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    12,
    0,
    0,
    0
  );
}

function ibjaRateTimeRank(rateTime) {
  const t = String(rateTime).trim().toUpperCase();
  if (t.includes("PM")) return 2;
  if (t.includes("AM")) return 1;
  return 0;
}

async function fetchIbja24kInr() {
  const accessToken = process.env.IBJA_ACCESS_TOKEN;
  if (!accessToken) throw new Error("IBJA_ACCESS_TOKEN is not set");

  const indiaToday = nowInIndia();
  const ddmmyyyy = formatIbjaDate(indiaToday);
  const url = new URL(IBJA_API);
  url.searchParams.set("ACCESS_TOKEN", accessToken);
  url.searchParams.set("START_DATE", ddmmyyyy);
  url.searchParams.set("END_DATE", ddmmyyyy);

  const res = await fetch(url.toString());
  const data = await res.json();

  if (!Array.isArray(data) || data.length === 0) throw new Error("Invalid IBJA response");
  if (data[0].status) throw new Error(data[0].message || "IBJA error");

  const records = data.filter((x) => typeof x.Purity === "string");
  const purity999 = records.filter((r) => r.Purity === "999");
  if (purity999.length === 0) throw new Error("IBJA: 999 purity rate not found");

  const best = [...purity999].sort((a, b) => {
    if (a.RateDate !== b.RateDate) return a.RateDate.localeCompare(b.RateDate);
    return ibjaRateTimeRank(a.RateTime) - ibjaRateTimeRank(b.RateTime);
  })[purity999.length - 1];

  const per10g = Number(best.GoldRate);
  if (!Number.isFinite(per10g)) throw new Error("IBJA: invalid GoldRate");

  return {
    per10GramInr: per10g,
    updatedAtIso: new Date().toISOString(),
    timestamp: null,
    note: `IBJA Purity ${best.Purity} (24K), RateTime ${best.RateTime}, RateDate ${best.RateDate}`,
  };
}

/** Fetch USD to INR rate (free, no key). */
async function fetchUsdToInr() {
  const res = await fetch(FRANKFURTER_API);
  if (!res.ok) throw new Error(`Forex API error: ${res.status}`);
  const data = await res.json();
  const usdToInr = Number(data?.rates?.INR);
  if (!Number.isFinite(usdToInr)) throw new Error("Could not fetch USD to INR rate.");
  return usdToInr;
}

/** Fetch metal price in USD per troy oz from Gold API (free, no key). Symbol: XAU, XAG, XPT. */
async function fetchGoldApiPrice(symbol) {
  const res = await fetch(`${GOLD_API_BASE}/price/${symbol}`);
  if (!res.ok) throw new Error(`Gold API error: ${res.status}`);
  const data = await res.json();
  const price = Number(data?.price);
  if (!Number.isFinite(price)) throw new Error(`Invalid price for ${symbol}`);
  return {
    usdPerTroyOz: price,
    updatedAtIso: data?.updatedAt || new Date().toISOString(),
  };
}

/** Get metal rate in INR per troy oz using free APIs: Gold API (USD) + Frankfurter (USD→INR). */
async function fetchMetalInrFromGoldApi(symbol) {
  const [metal, usdToInr] = await Promise.all([
    fetchGoldApiPrice(symbol),
    fetchUsdToInr(),
  ]);
  const inrPerTroyOz = metal.usdPerTroyOz * usdToInr;
  const metalName = symbol === "XAU" ? "gold" : symbol === "XAG" ? "silver" : "platinum";
  return {
    inrPerTroyOz,
    updatedAtIso: metal.updatedAtIso,
    timestamp: metal.updatedAtIso ? Math.floor(new Date(metal.updatedAtIso).getTime() / 1000) : null,
    note: `Spot (USD/oz) × USD/INR → INR. Source: Gold API + Frankfurter (free, no key).`,
  };
}

async function fetchSpotInr() {
  const [goldRes, forexRes] = await Promise.all([
    fetch(FREE_GOLD_API),
    fetch(FRANKFURTER_API),
  ]);

  if (!goldRes.ok) throw new Error(`Gold API error: ${goldRes.status}`);
  const goldData = await goldRes.json();
  if (!Array.isArray(goldData) || goldData.length === 0) throw new Error("Invalid gold data");

  const latest = goldData[goldData.length - 1];
  const goldUsdPerTroyOz = Number(latest.price);
  const dateStr = latest.date;
  if (!Number.isFinite(goldUsdPerTroyOz)) throw new Error("Invalid gold price");

  let usdToInr = 0;
  if (forexRes.ok) {
    const forexData = await forexRes.json();
    usdToInr = Number(forexData?.rates?.INR) || 0;
  }
  if (!usdToInr || !Number.isFinite(usdToInr)) {
    throw new Error("Could not fetch USD to INR rate. Try again later.");
  }

  const inrPerTroyOz = goldUsdPerTroyOz * usdToInr;
  const updatedAtIso = dateStr ? `${dateStr}T06:00:00.000Z` : new Date().toISOString();
  const timestamp = dateStr ? Math.floor(new Date(updatedAtIso).getTime() / 1000) : null;
  return {
    inrPerTroyOz,
    updatedAtIso,
    timestamp,
    note: "Indicative: global spot (USD/oz) converted to INR. Local taxes/premiums not included.",
  };
}

async function fetchMetalpriceInr(base = "XAU") {
  const apiKey = process.env.METALPRICEAPI_API_KEY;
  if (!apiKey) throw new Error("METALPRICEAPI_API_KEY is not set");

  const url = new URL(METALPRICEAPI_LATEST);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("base", base);
  url.searchParams.set("currencies", "INR");

  const res = await fetch(url.toString());
  const data = await res.json();

  if (!data.success || typeof data.rates?.INR !== "number") {
    throw new Error(data.error?.info ?? "MetalpriceAPI error");
  }
  const inrPerTroyOz = Number(data.rates.INR);
  if (!Number.isFinite(inrPerTroyOz)) throw new Error("Invalid INR rate from MetalpriceAPI");

  const updatedAtIso = data.timestamp
    ? new Date(data.timestamp * 1000).toISOString()
    : new Date().toISOString();
  const timestamp = data.timestamp ?? null;
  const metalName = base === "XAU" ? "gold" : base === "XAG" ? "silver" : "platinum";
  return {
    inrPerTroyOz,
    updatedAtIso,
    timestamp,
    note: `Indian ${metalName} rate in INR. Source: MetalpriceAPI (free tier).`,
  };
}

export async function getGoldRateResponse() {
  try {
    if (process.env.METALPRICEAPI_API_KEY) {
      const inr = await fetchMetalpriceInr("XAU");
      const perGram = inr.inrPerTroyOz / TROY_OZ_TO_GRAM;
      const per10Gram = perGram * 10;
      return {
        success: true,
        perGram: round2(perGram),
        per10Gram: round2(per10Gram),
        perTroyOz: round2(inr.inrPerTroyOz),
        timestamp: inr.timestamp,
        updatedAt: inr.updatedAtIso,
        source: "inr",
        currency: "INR",
        purity: "24K",
        unitNote: inr.note,
      };
    }

    if (process.env.IBJA_ACCESS_TOKEN) {
      const ibja = await fetchIbja24kInr();
      const perGram = ibja.per10GramInr / 10;
      return {
        success: true,
        perGram: round2(perGram),
        per10Gram: round2(ibja.per10GramInr),
        perTroyOz: null,
        timestamp: ibja.timestamp,
        updatedAt: ibja.updatedAtIso,
        source: "ibja",
        currency: "INR",
        purity: "24K",
        unitNote: ibja.note,
      };
    }

    try {
      const spot = await fetchSpotInr();
      const perGram = spot.inrPerTroyOz / TROY_OZ_TO_GRAM;
      const per10Gram = perGram * 10;
      return {
        success: true,
        perGram: round2(perGram),
        per10Gram: round2(per10Gram),
        perTroyOz: round2(spot.inrPerTroyOz),
        timestamp: spot.timestamp,
        updatedAt: spot.updatedAtIso,
        source: "spot",
        currency: "INR",
        purity: "24K",
        unitNote: spot.note,
      };
    } catch (_) {
      const fallback = await fetchMetalInrFromGoldApi("XAU");
      const perGram = fallback.inrPerTroyOz / TROY_OZ_TO_GRAM;
      const per10Gram = perGram * 10;
      return {
        success: true,
        perGram: round2(perGram),
        per10Gram: round2(per10Gram),
        perTroyOz: round2(fallback.inrPerTroyOz),
        timestamp: fallback.timestamp,
        updatedAt: fallback.updatedAtIso,
        source: "goldapi",
        currency: "INR",
        purity: "24K",
        unitNote: fallback.note,
      };
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return {
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
      error: message,
    };
  }
}

export async function getSilverRateResponse() {
  try {
    const inr = await fetchMetalInrFromGoldApi("XAG");
    const perGram = inr.inrPerTroyOz / TROY_OZ_TO_GRAM;
    return {
      success: true,
      perGram: round2(perGram),
      per10Gram: round2(perGram * 10),
      perTroyOz: round2(inr.inrPerTroyOz),
      timestamp: inr.timestamp,
      updatedAt: inr.updatedAtIso,
      source: "goldapi",
      currency: "INR",
      unitNote: inr.note,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return {
      success: false,
      perGram: null,
      per10Gram: null,
      perTroyOz: null,
      timestamp: null,
      updatedAt: null,
      source: "goldapi",
      currency: "INR",
      unitNote: "—",
      error: message,
    };
  }
}

export async function getPlatinumRateResponse() {
  try {
    const inr = await fetchMetalInrFromGoldApi("XPT");
    const perGram = inr.inrPerTroyOz / TROY_OZ_TO_GRAM;
    return {
      success: true,
      perGram: round2(perGram),
      per10Gram: round2(perGram * 10),
      perTroyOz: round2(inr.inrPerTroyOz),
      timestamp: inr.timestamp,
      updatedAt: inr.updatedAtIso,
      source: "goldapi",
      currency: "INR",
      unitNote: inr.note,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return {
      success: false,
      perGram: null,
      per10Gram: null,
      perTroyOz: null,
      timestamp: null,
      updatedAt: null,
      source: "goldapi",
      currency: "INR",
      unitNote: "—",
      error: message,
    };
  }
}
