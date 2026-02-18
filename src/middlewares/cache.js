/**
 * Caching Middleware for API Responses
 * Reduces database load and improves response times
 */

// In-memory cache (can be replaced with Redis for production)
const cache = new Map();

// Cache configuration
const CACHE_CONFIG = {
  // Cache TTL in milliseconds
  TTL: {
    DASHBOARD: 5 * 60 * 1000, // 5 minutes
    LIST: 2 * 60 * 1000, // 2 minutes
    DETAIL: 5 * 60 * 1000, // 5 minutes
    STATIC: 30 * 60 * 1000, // 30 minutes
  },
  // Maximum cache size
  MAX_SIZE: 1000,
};

/**
 * Generate cache key from request
 */
const generateCacheKey = (req) => {
  const { method, originalUrl, query, params } = req;
  const queryString = JSON.stringify({ ...query, ...params });
  return `${method}:${originalUrl}:${queryString}`;
};

/**
 * Clean expired cache entries
 */
const cleanExpiredCache = () => {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (value.expiresAt < now) {
      cache.delete(key);
    }
  }
  
  // If cache is too large, remove oldest entries
  if (cache.size > CACHE_CONFIG.MAX_SIZE) {
    const entries = Array.from(cache.entries())
      .sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    
    const toRemove = cache.size - CACHE_CONFIG.MAX_SIZE;
    for (let i = 0; i < toRemove; i++) {
      cache.delete(entries[i][0]);
    }
  }
};

// Clean cache every 5 minutes
setInterval(cleanExpiredCache, 5 * 60 * 1000);

/**
 * Get cache TTL based on route
 */
const getCacheTTL = (url) => {
  if (url.includes('/dashboard')) {
    return CACHE_CONFIG.TTL.DASHBOARD;
  }
  if (url.includes('/all') || url.includes('/list') || url.includes('/get')) {
    return CACHE_CONFIG.TTL.LIST;
  }
  if (url.includes('/by-id') || url.includes('/get-by-id') || url.includes('/product-by-id')) {
    return CACHE_CONFIG.TTL.DETAIL;
  }
  return CACHE_CONFIG.TTL.STATIC;
};

/**
 * Cache middleware - only caches GET requests
 */
export const cacheMiddleware = (req, res, next) => {
  // Only cache GET requests
  if (req.method !== 'GET') {
    return next();
  }

  // Skip cache for auth, upload, partners, assets, master, and dashboard (must be fresh)
  if (
    req.path.includes('/auth') ||
    req.path.includes('/upload') ||
    req.originalUrl.startsWith('/partners') ||
    req.originalUrl.startsWith('/assets') ||
    req.originalUrl.startsWith('/master') ||
    req.originalUrl.startsWith('/dashboard')
  ) {
    return next();
  }

  const cacheKey = generateCacheKey(req);
  const cached = cache.get(cacheKey);

  // Check if cache exists and is valid
  if (cached && cached.expiresAt > Date.now()) {
    // Set headers to prevent 304 responses
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Cache', 'HIT');
    res.status(200); // Ensure 200 status
    return res.json(cached.data);
  }

  // Store original json method
  const originalJson = res.json.bind(res);

  // Override json method to cache response
  res.json = function (data) {
    // Only cache successful responses
    if (res.statusCode >= 200 && res.statusCode < 300) {
      const ttl = getCacheTTL(req.originalUrl);
      cache.set(cacheKey, {
        data,
        expiresAt: Date.now() + ttl,
        createdAt: Date.now(),
      });
      res.setHeader('X-Cache', 'MISS');
      // Ensure cache-control headers are set to prevent 304 responses
      if (!res.getHeader('Cache-Control')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    }
    return originalJson(data);
  };

  next();
};

/**
 * Clear cache for specific pattern
 */
export const clearCache = (pattern) => {
  if (!pattern) {
    cache.clear();
    return;
  }

  for (const key of cache.keys()) {
    if (key.includes(pattern)) {
      cache.delete(key);
    }
  }
};

/**
 * Clear cache by route pattern
 */
export const clearCacheByRoute = (routePattern) => {
  clearCache(routePattern);
};

export default cacheMiddleware;

