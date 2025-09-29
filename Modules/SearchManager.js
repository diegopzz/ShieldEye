/**
 * SearchManager - Advanced search module for Scrapfly extension
 * Handles complex searching across multiple fields and sections
 */
class SearchManager {
  constructor(options = {}) {
    this.searchableFields = options.searchableFields || [];
    this.caseSensitive = options.caseSensitive || false;
    this.fuzzySearch = options.fuzzySearch || false;
    this.searchOperator = options.searchOperator || 'AND'; // AND or OR
  }

  /**
   * Main search function
   * @param {Array} items - Array of items to search through
   * @param {string} query - Search query string
   * @param {Object} options - Search options
   * @returns {Array} Filtered items matching the search criteria
   */
  search(items, query, options = {}) {
    if (!query || !query.trim()) {
      return items;
    }

    const searchOptions = {
      ...this,
      ...options
    };

    // Parse the query for special operators
    const parsedQuery = this.parseQuery(query);

    return items.filter(item => {
      return this.matchItem(item, parsedQuery, searchOptions);
    });
  }

  /**
   * Parse search query for special operators and terms
   * @param {string} query - Raw search query
   * @returns {Object} Parsed query object
   */
  parseQuery(query) {
    const result = {
      terms: [],
      exactMatch: false,
      fieldFilters: {},
      dateRange: null
    };

    // Check for exact match (quoted strings)
    const exactMatchRegex = /"([^"]+)"/g;
    let exactMatches = [];
    let match;
    while ((match = exactMatchRegex.exec(query)) !== null) {
      exactMatches.push(match[1]);
    }

    // Remove quoted strings from query
    let cleanQuery = query.replace(exactMatchRegex, '');

    // Check for field-specific searches (field:value)
    const fieldRegex = /(\w+):(\S+)/g;
    while ((match = fieldRegex.exec(cleanQuery)) !== null) {
      const field = match[1].toLowerCase();
      const value = match[2];
      result.fieldFilters[field] = value;
    }

    // Remove field filters from query
    cleanQuery = cleanQuery.replace(fieldRegex, '');

    // Extract remaining terms
    const terms = cleanQuery.split(/\s+/).filter(term => term.length > 0);

    result.terms = [...terms, ...exactMatches];
    result.exactMatch = exactMatches.length > 0;

    return result;
  }

  /**
   * Check if an item matches the parsed query
   * @param {Object} item - Item to check
   * @param {Object} parsedQuery - Parsed query object
   * @param {Object} options - Search options
   * @returns {boolean} True if item matches
   */
  matchItem(item, parsedQuery, options) {
    const matches = [];

    // Check field-specific filters
    for (const [field, value] of Object.entries(parsedQuery.fieldFilters)) {
      const fieldMatch = this.checkFieldMatch(item, field, value, options);
      matches.push(fieldMatch);
    }

    // Check general terms across all searchable fields
    for (const term of parsedQuery.terms) {
      const termMatch = this.checkTermMatch(item, term, options, parsedQuery.exactMatch);
      matches.push(termMatch);
    }

    // Apply operator (AND/OR)
    if (options.searchOperator === 'OR') {
      return matches.some(match => match === true);
    } else {
      // AND operator - all must match
      return matches.length === 0 || matches.every(match => match === true);
    }
  }

  /**
   * Check if a specific field matches a value
   * @param {Object} item - Item to check
   * @param {string} field - Field name
   * @param {string} value - Value to match
   * @param {Object} options - Search options
   * @returns {boolean} True if field matches
   */
  checkFieldMatch(item, field, value, options) {
    // Handle nested fields (e.g., "detector.name")
    const fieldParts = field.split('.');
    let fieldValue = item;

    for (const part of fieldParts) {
      if (fieldValue && typeof fieldValue === 'object') {
        fieldValue = fieldValue[part];
      } else {
        return false;
      }
    }

    if (fieldValue === undefined || fieldValue === null) {
      return false;
    }

    return this.compareValues(fieldValue, value, options.caseSensitive);
  }

  /**
   * Check if a term matches anywhere in the item
   * @param {Object} item - Item to check
   * @param {string} term - Search term
   * @param {Object} options - Search options
   * @param {boolean} exactMatch - Whether to match exactly
   * @returns {boolean} True if term matches
   */
  checkTermMatch(item, term, options, exactMatch = false) {
    const searchableFields = options.searchableFields.length > 0
      ? options.searchableFields
      : this.getAllFields(item);

    for (const field of searchableFields) {
      const value = this.getFieldValue(item, field);
      if (value !== undefined && value !== null) {
        const strValue = this.stringify(value);
        if (this.compareValues(strValue, term, options.caseSensitive, exactMatch)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get value of a field from an item (supports nested fields)
   * @param {Object} item - Item to get value from
   * @param {string} field - Field path (e.g., "detector.name")
   * @returns {*} Field value
   */
  getFieldValue(item, field) {
    const parts = field.split('.');
    let value = item;

    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = value[part];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Get all fields from an item recursively
   * @param {Object} item - Item to extract fields from
   * @param {string} prefix - Current field prefix
   * @returns {Array} Array of field paths
   */
  getAllFields(item, prefix = '') {
    const fields = [];

    for (const [key, value] of Object.entries(item)) {
      const fieldPath = prefix ? `${prefix}.${key}` : key;

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        // Recursively get nested fields
        fields.push(...this.getAllFields(value, fieldPath));
      } else {
        fields.push(fieldPath);
      }
    }

    return fields;
  }

  /**
   * Compare two values
   * @param {*} value1 - First value
   * @param {*} value2 - Second value
   * @param {boolean} caseSensitive - Case sensitive comparison
   * @param {boolean} exactMatch - Exact match required
   * @returns {boolean} True if values match
   */
  compareValues(value1, value2, caseSensitive = false, exactMatch = false) {
    const str1 = this.normalizeString(this.stringify(value1));
    const str2 = this.normalizeString(this.stringify(value2));

    if (!caseSensitive) {
      const lower1 = str1.toLowerCase();
      const lower2 = str2.toLowerCase();

      if (exactMatch) {
        return lower1 === lower2;
      } else {
        return lower1.includes(lower2);
      }
    }

    if (exactMatch) {
      return str1 === str2;
    } else {
      return str1.includes(str2);
    }
  }

  /**
   * Normalize string for better matching
   * @param {string} str - String to normalize
   * @returns {string} Normalized string
   */
  normalizeString(str) {
    // Replace hyphens, underscores with spaces, then remove extra spaces
    return str.replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * Convert any value to string for comparison
   * @param {*} value - Value to stringify
   * @returns {string} String representation
   */
  stringify(value) {
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (Array.isArray(value)) {
      return value.map(v => this.stringify(v)).join(' ');
    }
    if (value && typeof value === 'object') {
      return Object.values(value).map(v => this.stringify(v)).join(' ');
    }
    return '';
  }

  /**
   * Search specifically for Rules section
   * @param {Array} detectors - Array of detector objects
   * @param {string} query - Search query
   * @returns {Array} Filtered detectors
   */
  searchRules(detectors, query) {
    const options = {
      searchableFields: [
        'detector.displayName',
        'detector.name',
        'detector.description',
        'detector.lastUpdated',
        'category',
        'detector._searchStrings.headers',
        'detector._searchStrings.cookies',
        'detector._searchStrings.content',
        'detector._searchStrings.dom',
        'detector._searchStrings.urls'
      ]
    };

    // Handle special search for detection methods - create deep copies to avoid mutations
    const enhancedDetectors = detectors.map(item => {
      // Deep clone the entire item to avoid any mutations
      const enhanced = JSON.parse(JSON.stringify(item));

      // Create searchable strings for detection methods
      if (enhanced.detector && enhanced.detector.detection) {
        // Create a separate searchStrings property for searching
        enhanced.detector._searchStrings = {};

        for (const [methodType, methods] of Object.entries(enhanced.detector.detection)) {
          if (Array.isArray(methods)) {
            // Create searchable strings from method arrays
            const methodStrings = methods.map(m => {
              if (typeof m === 'string') return m;
              if (typeof m === 'object') {
                return Object.values(m).filter(v => v).join(' ');
              }
              return '';
            }).join(' ');

            // Store in the search strings property
            enhanced.detector._searchStrings[methodType] = methodStrings;
          } else if (typeof methods === 'string') {
            // If it's already a string (corrupted data), use it for search
            enhanced.detector._searchStrings[methodType] = methods;
          }
        }
      }

      return enhanced;
    });

    return this.search(enhancedDetectors, query, options);
  }

  /**
   * Search specifically for Detection section
   * @param {Array} detections - Array of detection objects
   * @param {string} query - Search query
   * @returns {Array} Filtered detections
   */
  searchDetections(detections, query) {
    const options = {
      searchableFields: [
        'name',
        'category',
        'method',
        'details',
        'url',
        'timestamp'
      ]
    };

    return this.search(detections, query, options);
  }

  /**
   * Search specifically for History section
   * @param {Array} history - Array of history objects
   * @param {string} query - Search query
   * @returns {Array} Filtered history
   */
  searchHistory(history, query) {
    const options = {
      searchableFields: [
        'url',
        'detectorName',
        'category',
        'timestamp',
        'detections'
      ]
    };

    return this.search(history, query, options);
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SearchManager;
} else if (typeof window !== 'undefined') {
  window.SearchManager = SearchManager;
}