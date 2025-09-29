class DetectorManager {
    constructor(categoryManager) {
        this.categoryManager = categoryManager || new CategoryManager();
        this.detectors = {};
        this.initialized = false;
    }

    /**
     * Initialize the DetectorManager by loading categories and detectors from files
     * and saving them to Chrome storage
     */
    async initialize() {
        if (this.initialized) return;

        try {
            // Initialize CategoryManager if not already done
            if (!this.categoryManager.initialized) {
                await this.categoryManager.initialize();
            }

            // First, try to load from storage
            const storageLoaded = await this.loadFromStorage();

            // Only load from JSON files if storage is empty
            if (!storageLoaded || Object.keys(this.detectors).length === 0) {
                console.log('No detectors in storage, loading from JSON files...');
                await this.loadDetectorsFromIndex();
                await this.saveDetectorsToStorage();
            } else {
                console.log('Loaded detectors from storage, preserving custom settings');
            }

            this.initialized = true;
            console.log('DetectorManager initialized successfully');
        } catch (error) {
            console.error('Failed to initialize DetectorManager:', error);
            throw error;
        }
    }


    /**
     * Load all detector files based on categories
     * Reads each detector file from detectors/{category}/{detector}.json
     */
    async loadDetectorsFromIndex() {
        const loadPromises = [];
        const categories = this.categoryManager.getAllCategories();

        for (const [categoryName, categoryData] of Object.entries(categories)) {
            console.log(`Loading detectors for category: ${categoryName}`);

            // Skip entries that don't have a detectors array (like "tags")
            if (!categoryData.detectors || !Array.isArray(categoryData.detectors)) {
                console.log(`Skipping ${categoryName} - not a detector category`);
                continue;
            }

            if (!this.detectors[categoryName]) {
                this.detectors[categoryName] = {};
            }

            for (const detectorName of categoryData.detectors) {
                const promise = this.loadDetectorFile(categoryName, detectorName);
                loadPromises.push(promise);
            }
        }

        await Promise.all(loadPromises);
        console.log('Finished loading all detectors');
        console.log('Total detectors loaded:', this.getDetectorCount());
        console.log('Detectors by category:', Object.keys(this.detectors).map(cat => `${cat}: ${Object.keys(this.detectors[cat]).length}`));
    }

    /**
     * Load a single detector file
     * @param {string} categoryName - Category name (antibot, captcha, fingerprint)
     * @param {string} detectorName - Detector name (cloudflare, hcaptcha, etc.)
     */
    async loadDetectorFile(categoryName, detectorName) {
        try {
            const detectorPath = `detectors/${categoryName}/${detectorName}.json`;
            console.log(`Loading detector: ${detectorPath}`);

            const response = await fetch(chrome.runtime.getURL(detectorPath));

            if (!response.ok) {
                console.warn(`Detector file not found: ${detectorPath} (${response.status})`);
                return;
            }

            const detectorData = await response.json();
            // Default enabled to true if not specified
            if (detectorData.enabled === undefined) {
                detectorData.enabled = true;
            }
            // Update lastUpdated to include time if it doesn't already
            if (detectorData.lastUpdated && !detectorData.lastUpdated.includes(':')) {
                // Old format (YYYY-MM-DD), add default time
                detectorData.lastUpdated = `${detectorData.lastUpdated} 00:00:00`;
            }
            this.detectors[categoryName][detectorName] = detectorData;
            console.log(`Successfully loaded detector: ${categoryName}/${detectorName}`);

            console.log(`Successfully loaded detector: ${categoryName}/${detectorName}`);

        } catch (error) {
            console.error(`Failed to load detector ${categoryName}/${detectorName}:`, error);
        }
    }


    /**
     * Save all detector data to Chrome storage as 'scrapfly_detectors'
     */
    async saveDetectorsToStorage() {
        try {
            const detectorsData = {
                timestamp: new Date().toISOString(),
                detectors: this.detectors,
                totalCount: this.getDetectorCount()
            };

            await chrome.storage.local.set({
                'scrapfly_detectors': JSON.stringify(detectorsData, null, 2)
            });

            console.log(`Saved ${detectorsData.totalCount} detectors to storage as scrapfly_detectors`);
        } catch (error) {
            console.error('Failed to save detectors to storage:', error);
            throw error;
        }
    }


    /**
     * Fix corrupted detection data that was saved as strings instead of arrays
     * @param {object} detection - Detection object to fix
     * @returns {object} Fixed detection object with proper array structure
     */
    fixCorruptedDetectionData(detection) {
        if (!detection) return {};

        const fixed = {};
        for (const [methodType, data] of Object.entries(detection)) {
            if (Array.isArray(data)) {
                // Data is already an array, keep it as is
                fixed[methodType] = data;
            } else if (typeof data === 'string' && data.trim()) {
                // Data is corrupted (string instead of array), need to reload from JSON
                console.warn(`Detection method ${methodType} is corrupted (string instead of array)`);
                fixed[methodType] = [];
            } else {
                // Empty or invalid data
                fixed[methodType] = [];
            }
        }

        return fixed;
    }

    /**
     * Load previously saved data from Chrome storage
     * @returns {boolean} True if data was loaded from storage, false otherwise
     */
    async loadFromStorage() {
        try {
            // Load categories through CategoryManager
            const categoriesLoaded = await this.categoryManager.loadFromStorage();

            // Load detectors - try both keys for backward compatibility
            const result = await chrome.storage.local.get(['scrapfly_detectors', 'scrapfly_detectors.json']);

            let detectorsData = null;
            if (result['scrapfly_detectors']) {
                detectorsData = JSON.parse(result['scrapfly_detectors']);
            } else if (result['scrapfly_detectors.json']) {
                // Backward compatibility - migrate from old key
                detectorsData = JSON.parse(result['scrapfly_detectors.json']);
                // Save with new key and remove old one
                await chrome.storage.local.set({
                    'scrapfly_detectors': result['scrapfly_detectors.json']
                });
                await chrome.storage.local.remove(['scrapfly_detectors.json']);
                console.log('Migrated storage from scrapfly_detectors.json to scrapfly_detectors');
            }

            if (detectorsData) {
                this.detectors = detectorsData.detectors || {};

                // Check for corrupted data
                let hasCorruption = false;
                for (const [category, categoryDetectors] of Object.entries(this.detectors)) {
                    for (const [detectorName, detector] of Object.entries(categoryDetectors)) {
                        if (detector.detection) {
                            // Check if any detection method is a string (corrupted)
                            for (const [methodType, methodData] of Object.entries(detector.detection)) {
                                if (typeof methodData === 'string') {
                                    hasCorruption = true;
                                    console.warn(`Corrupted detection data found for ${detectorName}.${methodType}`);
                                    break;
                                }
                            }
                        }
                    }
                }

                // If corrupted, reload from JSON files
                if (hasCorruption) {
                    console.log('Corrupted detection data found, reloading from JSON files...');
                    await this.loadDetectorsFromIndex();
                    await this.saveDetectorsToStorage();
                    return true;
                }

                console.log('Loaded detectors from storage with custom settings');
                return true;
            }

            return false;

        } catch (error) {
            console.error('Failed to load from storage:', error);
            return false;
        }
    }

    /**
     * Get list of available category names
     * @returns {string[]} Array of category names
     */
    getCategories() {
        return this.categoryManager.getCategories();
    }

    /**
     * Get category information including color and detector list
     * @param {string} categoryName - Category name
     * @returns {object} Category data with colour and detectors array
     */
    getCategoryInfo(categoryName) {
        return this.categoryManager.getCategoryInfo(categoryName);
    }

    /**
     * Get detector names for a specific category
     * @param {string} categoryName - Category name
     * @returns {string[]} Array of detector names
     */
    getCategoryDetectors(categoryName) {
        return this.categoryManager.getCategoryDetectors(categoryName);
    }

    /**
     * Get a specific detector's full configuration
     * @param {string} categoryName - Category name
     * @param {string} detectorName - Detector name (ID)
     * @returns {object} Detector configuration object
     */
    getDetector(categoryName, detectorName) {
        return this.detectors[categoryName]?.[detectorName];
    }

    /**
     * Normalize category name to internal key format
     * @param {string} category - Category display name (e.g., "Anti-Bot", "CAPTCHA")
     * @returns {string} Normalized category key (e.g., "antibot", "captcha")
     */
    normalizeCategoryName(category) {
        if (!category) return '';

        const normalized = category.toLowerCase()
            .replace(/[^a-z]/g, ''); // Remove spaces, hyphens, etc.

        // Map known variations
        const categoryMap = {
            'antibot': 'antibot',
            'captcha': 'captcha',
            'fingerprint': 'fingerprint',
            'fingerprinting': 'fingerprint'
        };

        return categoryMap[normalized] || normalized;
    }

    /**
     * Get a detector by its display name within a category
     * @param {string} categoryName - Category name (display name or internal key)
     * @param {string} displayName - Detector display name
     * @returns {object|null} Detector configuration object or null if not found
     */
    getDetectorByName(categoryName, displayName) {
        // Normalize category name to internal key
        const normalizedCategory = this.normalizeCategoryName(categoryName);
        const categoryDetectors = this.detectors[normalizedCategory];
        if (!categoryDetectors) return null;

        for (const [id, detector] of Object.entries(categoryDetectors)) {
            if (detector.name === displayName) {
                return detector;
            }
        }
        return null;
    }

    /**
     * Get all detectors for a specific category
     * @param {string} categoryName - Category name
     * @returns {object} Object with detector names as keys and configs as values
     */
    getDetectorsByCategory(categoryName) {
        return this.detectors[categoryName] || {};
    }

    /**
     * Get all detectors organized by category
     * @returns {object} All detectors organized by category
     */
    getAllDetectors() {
        return this.detectors;
    }

    /**
     * Get total number of loaded detectors
     * @returns {number} Total count of detectors
     */
    getDetectorCount() {
        let count = 0;
        for (const category of Object.values(this.detectors)) {
            count += Object.keys(category).length;
        }
        return count;
    }

    /**
     * Clear all detector data from Chrome storage
     */
    async clearStorage() {
        try {
            // Remove both old and new keys
            await chrome.storage.local.remove(['scrapfly_detectors', 'scrapfly_detectors.json']);
            await this.categoryManager.clearStorage();
            console.log('Cleared detector storage');
        } catch (error) {
            console.error('Failed to clear storage:', error);
        }
    }

    /**
     * Get information about stored data
     * @returns {object} Object with categories count, detectors count, and initialized status
     */
    getStorageInfo() {
        const categoryInfo = this.categoryManager.getStorageInfo();
        return {
            categories: categoryInfo.categoryCount,
            detectors: this.getDetectorCount(),
            initialized: this.initialized,
            categoryDetails: categoryInfo
        };
    }

    /**
     * Export all detectors to JSON format
     * @returns {Object} Exportable detector data
     */
    exportDetectors() {
        return {
            version: '1.0',
            timestamp: new Date().toISOString(),
            detectors: this.detectors,
            categories: this.categories
        };
    }

    /**
     * Import detectors from JSON data
     * @param {Object} data - Imported data
     * @param {boolean} merge - Whether to merge with existing or replace
     * @returns {Promise<boolean>} Success status
     */
    async importDetectors(data, merge = false) {
        try {
            // Validate the data format
            if (!data.detectors || typeof data.detectors !== 'object') {
                throw new Error('Invalid detector data format');
            }

            if (merge) {
                // Merge with existing detectors
                for (const [category, categoryDetectors] of Object.entries(data.detectors)) {
                    if (!this.detectors[category]) {
                        this.detectors[category] = {};
                    }
                    Object.assign(this.detectors[category], categoryDetectors);
                }

                // Merge categories if provided
                if (data.categories) {
                    Object.assign(this.categories, data.categories);
                }
            } else {
                // Replace existing detectors
                this.detectors = data.detectors;
                if (data.categories) {
                    this.categories = data.categories;
                }
            }

            // Save to storage
            await this.saveDetectorsToStorage();
            if (data.categories) {
                await this.saveCategoriesToStorage();
            }

            console.log('Detectors imported successfully');
            return true;
        } catch (error) {
            console.error('Failed to import detectors:', error);
            return false;
        }
    }

    /**
     * Reload detectors from JSON files (fixes corrupted data)
     * @returns {Promise<boolean>} Success status
     */
    async reloadFromJSON() {
        try {
            console.log('Reloading all detectors from JSON files...');
            this.detectors = {};
            await this.loadDetectorsFromIndex();
            await this.saveDetectorsToStorage();
            console.log('Detectors reloaded from JSON files successfully');
            return true;
        } catch (error) {
            console.error('Failed to reload from JSON:', error);
            return false;
        }
    }

    /**
     * Clear all custom detectors (keep defaults)
     * @returns {Promise<boolean>} Success status
     */
    async clearCustomDetectors() {
        try {
            // Reload default detectors from JSON files
            await this.loadDetectorsFromIndex();
            await this.saveDetectorsToStorage();

            console.log('Custom detectors cleared, defaults restored');
            return true;
        } catch (error) {
            console.error('Failed to clear custom detectors:', error);
            return false;
        }
    }

    /**
     * Clear ALL detectors - removes everything
     * @returns {Promise<boolean>} Success status
     */
    async clearAllDetectors() {
        try {
            // Clear all detector data
            this.detectors = {};

            // Clear categories as well
            for (const category of Object.keys(this.categories)) {
                this.detectors[category] = {};
            }

            // Save empty state to storage
            await this.saveDetectorsToStorage();

            console.log('All detectors cleared');
            return true;
        } catch (error) {
            console.error('Failed to clear all detectors:', error);
            return false;
        }
    }

    /**
     * Add a new detector
     * @param {string} category - Detector category
     * @param {string} name - Detector name
     * @param {Object} detector - Detector configuration
     * @returns {Promise<boolean>} Success status
     */
    async addDetector(category, name, detector) {
        try {
            if (!this.detectors[category]) {
                this.detectors[category] = {};
            }

            // Add timestamp in local time: YYYY-MM-DD HH:MM:SS
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');
            detector.lastUpdated = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

            this.detectors[category][name] = detector;
            await this.saveDetectorsToStorage();

            console.log(`Detector ${name} added to ${category}`);
            return true;
        } catch (error) {
            console.error('Failed to add detector:', error);
            return false;
        }
    }

    /**
     * Get the CategoryManager instance
     * @returns {CategoryManager} The category manager instance
     */
    getCategoryManager() {
        return this.categoryManager;
    }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DetectorManager;
} else if (typeof window !== 'undefined') {
  window.DetectorManager = DetectorManager;
}