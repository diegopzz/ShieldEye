/**
 * Utility functions for Scrapfly extension
 */

class Utils {
  /**
   * Generate a hash for URL to use as cache key
   * @param {string} url - URL to hash
   * @returns {string} Simple hash string
   */
  static hashUrl(url) {
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Check if we should skip detection due to recent request
   * Tracks recent detection requests to prevent duplicates
   * @param {number} tabId - Tab ID
   * @param {number} threshold - Minimum milliseconds between requests (default 2000ms)
   * @param {Map} recentRequests - Map to track recent requests (passed from caller)
   * @returns {boolean} true if should skip, false otherwise
   */
  static shouldSkipDetection(tabId, threshold = 2000, recentRequests) {
    const lastRequest = recentRequests.get(tabId);
    const now = Date.now();

    if (lastRequest && (now - lastRequest) < threshold) {
      console.log(`Scrapfly Background: Skipping duplicate detection for tab ${tabId} (last request ${now - lastRequest}ms ago)`);
      return true;
    }

    recentRequests.set(tabId, now);
    // Clean up old entries after 10 seconds
    setTimeout(() => {
      if (recentRequests.get(tabId) === now) {
        recentRequests.delete(tabId);
      }
    }, 10000);

    return false;
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Utils;
} else if (typeof window !== 'undefined') {
  window.Utils = Utils;
}