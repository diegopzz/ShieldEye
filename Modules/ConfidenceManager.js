/**
 * ConfidenceManager - Handles confidence calculation for detections
 */
class ConfidenceManager {
  constructor() {
    this.calculationMethod = 'max'; // 'max', 'average', 'weighted'
  }

  /**
   * Calculate overall confidence from detection matches
   * @param {Array} matches - Array of detection matches with confidence values
   * @param {string} method - Calculation method: 'max', 'average', 'weighted'
   * @returns {number} Overall confidence (0-100)
   */
  calculateConfidence(matches = [], method = null) {
    if (!matches || matches.length === 0) {
      return 0;
    }

    const calculationMethod = method || this.calculationMethod;

    switch (calculationMethod) {
      case 'max':
        return this.calculateMaxConfidence(matches);
      case 'average':
        return this.calculateAverageConfidence(matches);
      case 'weighted':
        return this.calculateWeightedConfidence(matches);
      default:
        return this.calculateMaxConfidence(matches);
    }
  }

  /**
   * Calculate maximum confidence from all matches
   * @param {Array} matches - Array of detection matches
   * @returns {number} Maximum confidence value
   */
  calculateMaxConfidence(matches) {
    let maxConfidence = 0;
    for (const match of matches) {
      if (match.confidence && match.confidence > maxConfidence) {
        maxConfidence = match.confidence;
      }
    }
    return maxConfidence;
  }

  /**
   * Calculate average confidence from all matches
   * @param {Array} matches - Array of detection matches
   * @returns {number} Average confidence value
   */
  calculateAverageConfidence(matches) {
    if (matches.length === 0) return 0;

    let totalConfidence = 0;
    let count = 0;

    for (const match of matches) {
      if (match.confidence) {
        totalConfidence += match.confidence;
        count++;
      }
    }

    return count > 0 ? Math.round(totalConfidence / count) : 0;
  }

  /**
   * Calculate weighted confidence based on detection method types
   * Different detection methods have different reliability weights
   * @param {Array} matches - Array of detection matches
   * @returns {number} Weighted confidence value
   */
  calculateWeightedConfidence(matches) {
    if (matches.length === 0) return 0;

    // Weight by detection method type (more reliable methods get higher weight)
    const typeWeights = {
      'cookies': 1.2,    // Cookies are very reliable
      'headers': 1.1,    // Headers are reliable
      'content': 1.0,    // Content is standard
      'dom': 0.9,        // DOM can be less reliable
      'urls': 0.95       // URLs are fairly reliable
    };

    let weightedSum = 0;
    let totalWeight = 0;

    for (const match of matches) {
      if (match.confidence && match.type) {
        const weight = typeWeights[match.type] || 1.0;
        weightedSum += match.confidence * weight;
        totalWeight += weight;
      }
    }

    return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
  }

  /**
   * Set the default calculation method
   * @param {string} method - 'max', 'average', or 'weighted'
   */
  setCalculationMethod(method) {
    if (['max', 'average', 'weighted'].includes(method)) {
      this.calculationMethod = method;
    } else {
      console.warn(`ConfidenceManager: Invalid method "${method}", keeping "${this.calculationMethod}"`);
    }
  }

  /**
   * Get confidence level category (high, medium, low)
   * @param {number} confidence - Confidence value (0-100)
   * @returns {string} Confidence level: 'high', 'medium', or 'low'
   */
  getConfidenceLevel(confidence) {
    if (confidence >= 90) return 'high';
    if (confidence >= 70) return 'medium';
    return 'low';
  }

  /**
   * Update match confidence values with a multiplier
   * Useful for adjusting confidence based on external factors
   * @param {Array} matches - Array of detection matches
   * @param {number} multiplier - Confidence multiplier (e.g., 0.8 for 80%)
   * @returns {Array} Matches with updated confidence values
   */
  adjustConfidence(matches, multiplier) {
    return matches.map(match => ({
      ...match,
      confidence: Math.min(100, Math.round((match.confidence || 0) * multiplier))
    }));
  }
}