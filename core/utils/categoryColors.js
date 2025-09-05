/**
 * Shared utility for category colors used across the extension
 * This eliminates duplicate code and ensures consistency
 */

// Category color definitions
const CATEGORY_COLORS = {
  'CAPTCHA': '#dc2626',        // Red
  'Anti-Bot': '#ea580c',       // Orange
  'Bot Detection': '#ea580c',   // Orange
  'WAF': '#2563eb',            // Blue
  'CDN': '#059669',            // Green
  'Protection': '#7c3aed',     // Purple
  'DDoS': '#b91c1c',           // Dark Red
  'Fingerprinting': '#f59e0b', // Amber
  'Analytics': '#8b5cf6',      // Violet
  'Security': '#10b981'        // Emerald
};

// Default color for unknown categories
const DEFAULT_COLOR = '#6b7280'; // Gray

/**
 * Get color for a category
 * @param {string} category - The category name
 * @returns {string} Hex color code
 */
function getCategoryColor(category) {
  return CATEGORY_COLORS[category] || DEFAULT_COLOR;
}

// Export for use in content scripts and background scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getCategoryColor, CATEGORY_COLORS };
}