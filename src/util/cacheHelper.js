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
    employees: '/employees',
    salary: '/salary',
    stock: '/stocks',
  };

  const pattern = patterns[entityType] || entityType;
  
  if (entityId) {
    // Clear specific entity cache
    clearCacheByRoute(`${pattern}/${entityId}`);
  }
  
  // Clear list cache for the entity type
  clearCacheByRoute(pattern);

  // Orders drive supplier payable lines (ExpanseIncome) and payment lists; those routes
  // use their own URL prefixes and were not covered by clearing `/order` alone.
  if (entityType === "order") {
    clearCacheByRoute("/supplier-orderdetails");
    clearCacheByRoute("/income-expance");
  }
  
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

