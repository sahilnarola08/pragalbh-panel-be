/**
 * Format amount as INR currency
 * @param {number} amount - The amount to format
 * @returns {string} - Formatted amount with INR symbol (e.g., "₹1,00,000")
 */
export const formatINR = (amount) => {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return "₹0";
  }

  // Round to 2 decimal places for calculation
  const roundedAmount = Math.round(Number(amount) * 100) / 100;
  
  // Format with Indian numbering system (lakhs, crores) without decimal places
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(roundedAmount);
};

/**
 * Format amount as INR currency without symbol (for messages)
 * @param {number} amount - The amount to format
 * @returns {string} - Formatted amount (e.g., "1,00,000")
 */
export const formatAmount = (amount) => {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return "0";
  }

  // Round to 2 decimal places for calculation
  const roundedAmount = Math.round(Number(amount) * 100) / 100;
  
  // Format with Indian numbering system without decimal places
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(roundedAmount);
};

/**
 * Format amount with INR symbol for error messages
 * @param {number} amount - The amount to format
 * @returns {string} - Formatted amount with INR symbol (e.g., "₹1,00,000")
 */
export const formatCurrency = (amount) => {
  return formatINR(amount);
};

