/**
 * Cache Helper Utilities
 * Provides functions to invalidate cache when data is modified
 */

import { clearCacheByRoute } from "../middlewares/cache.js";

/**
 * Clear cache for specific entity type
 */
export const invalidateCache = (entityType, entityId = null) => {
  const patterns = {
    dashboard: '/dashboard',
    order: '/order',
    product: '/product',
    supplier: '/supplier',
    user: '/user',
    master: '/master',
    income: '/income-expance',
  };

  const pattern = patterns[entityType] || entityType;
  
  if (entityId) {
    // Clear specific entity cache
    clearCacheByRoute(`${pattern}/${entityId}`);
  }
  
  // Clear list cache for the entity type
  clearCacheByRoute(pattern);
  
  // Always clear dashboard cache when any entity changes
  if (entityType !== 'dashboard') {
    clearCacheByRoute('/dashboard');
  }
};

/**
 * Clear all cache
 */
export const clearAllCache = () => {
  clearCacheByRoute('');
};

export default {
  invalidateCache,
  clearAllCache,
};

