// fetch is globally available in Node 18+

// Cache for USD -> INR rate
let usdToInrCache = {
  rate: null,
  timestamp: 0,
};

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const FETCH_TIMEOUT_MS = 5000; // 5 seconds
const DEFAULT_FALLBACK_RATE = 87.0; // Safe fallback if API fails completely

/**
 * Fetch USD to INR rate with caching and timeout.
 * @returns {Promise<number>} The exchange rate (e.g., 83.5)
 */
export const getUsdToInrRate = async () => {
  const now = Date.now();

  // 1. Return cached rate if valid
  if (
    usdToInrCache.rate !== null &&
    now - usdToInrCache.timestamp < CACHE_TTL_MS
  ) {
    return usdToInrCache.rate;
  }

  try {
    // 2. Fetch from external API with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(
      "https://api.frankfurter.app/latest?from=USD&to=INR",
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Currency API responded with status ${response.status}`);
    }

    const data = await response.json();
    const rate = data?.rates?.INR ? Number(data.rates.INR) : null;

    if (rate && !isNaN(rate)) {
      // Update cache
      usdToInrCache = {
        rate,
        timestamp: now,
      };
      return rate;
    } else {
      throw new Error("Invalid rate data received from API");
    }
  } catch (error) {
    console.warn("Error fetching USD to INR rate:", error.message);
    
    // 3. Return last cached rate if available (even if expired)
    if (usdToInrCache.rate !== null) {
      console.log("Using expired cached rate:", usdToInrCache.rate);
      return usdToInrCache.rate;
    }

    // 4. Return hardcoded fallback
    console.warn("Using hardcoded fallback rate:", DEFAULT_FALLBACK_RATE);
    return DEFAULT_FALLBACK_RATE;
  }
};
