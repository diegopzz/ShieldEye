/**
 * CategoryManager Module
 * Manages detector categories including loading, storage, and metadata
 * Handles category configuration from index.json and Chrome storage
 */
class CategoryManager {
    constructor() {
        this.categories = {};
        this.initialized = false;
    }

    /**
     * Initialize the CategoryManager by loading categories from files
     * and saving them to Chrome storage
     */
    async initialize() {
        if (this.initialized) return;

        try {
            console.log('CategoryManager: Starting initialization...');
            await this.loadCategoriesFromIndex();
            console.log('CategoryManager: Loaded categories from index.json');
            await this.saveToStorage();
            console.log('CategoryManager: Saved categories to storage');
            this.initialized = true;
            console.log('CategoryManager: Initialized successfully');
        } catch (error) {
            console.error('CategoryManager: Failed to initialize:', error);
            console.error('CategoryManager: Error stack:', error.stack);
            throw error;
        }
    }

    /**
     * Load categories from detectors/index.json
     * Sets this.categories with the index data
     */
    async loadCategoriesFromIndex() {
        try {
            const response = await fetch(chrome.runtime.getURL('detectors/index.json'));
            if (!response.ok) {
                throw new Error(`Failed to load index.json: ${response.statusText}`);
            }

            const indexData = await response.json();
            this.categories = indexData;

            console.log('Loaded categories from index:', Object.keys(this.categories));

        } catch (error) {
            console.error('Failed to load detectors index:', error);
            throw error;
        }
    }

    /**
     * Save category data to Chrome storage as 'scrapfly_categories'
     */
    async saveToStorage() {
        try {
            const categoriesData = {
                timestamp: new Date().toISOString(),
                categories: this.categories,
                totalCategories: Object.keys(this.categories).length
            };

            await chrome.storage.local.set({
                'scrapfly_categories': JSON.stringify(categoriesData, null, 2)
            });

            console.log(`Saved ${categoriesData.totalCategories} categories to storage as scrapfly_categories`);
        } catch (error) {
            console.error('Failed to save categories to storage:', error);
            throw error;
        }
    }

    /**
     * Load previously saved category data from Chrome storage
     */
    async loadFromStorage() {
        try {
            // Try both keys for backward compatibility
            const result = await chrome.storage.local.get(['scrapfly_categories', 'scrapfly_categories.json']);

            let categoriesData = null;
            if (result['scrapfly_categories']) {
                categoriesData = JSON.parse(result['scrapfly_categories']);
            } else if (result['scrapfly_categories.json']) {
                // Backward compatibility - migrate from old key
                categoriesData = JSON.parse(result['scrapfly_categories.json']);
                // Save with new key and remove old one
                await chrome.storage.local.set({
                    'scrapfly_categories': result['scrapfly_categories.json']
                });
                await chrome.storage.local.remove(['scrapfly_categories.json']);
                console.log('Migrated storage from scrapfly_categories.json to scrapfly_categories');
            }

            if (categoriesData) {
                this.categories = categoriesData.categories;
                console.log('Loaded categories from storage');
                this.initialized = Object.keys(this.categories).length > 0;
                return true;
            }

            return false;
        } catch (error) {
            console.error('Failed to load categories from storage:', error);
            return false;
        }
    }

    /**
     * Get list of available category names
     * @returns {string[]} Array of category names
     */
    getCategories() {
        return Object.keys(this.categories);
    }

    /**
     * Get all categories data
     * @returns {object} All categories with their configurations
     */
    getAllCategories() {
        return this.categories;
    }

    /**
     * Get category information including color and detector list
     * @param {string} categoryName - Category name
     * @returns {object} Category data with colour and detectors array
     */
    getCategoryInfo(categoryName) {
        return this.categories[categoryName];
    }

    /**
     * Get color for a specific category
     * @param {string} categoryName - Category name
     * @returns {string} Category color hex value or default
     */
    getCategoryColor(categoryName) {
        const categoryInfo = this.categories[categoryName];
        return categoryInfo?.colour || '#3b82f6';
    }

    /**
     * Get detector names for a specific category
     * @param {string} categoryName - Category name
     * @returns {string[]} Array of detector names
     */
    getCategoryDetectors(categoryName) {
        const categoryInfo = this.categories[categoryName];
        return categoryInfo ? categoryInfo.detectors : [];
    }

    /**
     * Check if a category exists
     * @param {string} categoryName - Category name
     * @returns {boolean} True if category exists
     */
    hasCategory(categoryName) {
        return categoryName in this.categories;
    }

    /**
     * Get category icon (fallback emojis for categories)
     * @param {string} categoryName - Category name
     * @returns {string} Icon emoji or default
     */
    getCategoryIcon(categoryName) {
        switch (categoryName?.toLowerCase()) {
            case 'antibot':
            case 'anti-bot':
                return '🛡️';
            case 'captcha':
                return '🧩';
            case 'fingerprint':
            case 'fingerprinting':
                return '👆';
            case 'waf':
            case 'firewall':
                return '🔥';
            default:
                return '🔍';
        }
    }

    /**
     * Get category display name
     * @param {string} categoryName - Category name
     * @returns {string} Formatted display name
     */
    getCategoryDisplayName(categoryName) {
        switch (categoryName?.toLowerCase()) {
            case 'antibot':
                return 'Anti-Bot';
            case 'captcha':
                return 'CAPTCHA';
            case 'fingerprint':
                return 'Fingerprinting';
            case 'waf':
                return 'Web Application Firewall';
            default:
                return categoryName.charAt(0).toUpperCase() + categoryName.slice(1);
        }
    }

    /**
     * Get category badge CSS class
     * @param {string} categoryName - Category name
     * @returns {string} CSS class name for badges
     */
    getCategoryBadgeClass(categoryName) {
        switch (categoryName?.toLowerCase()) {
            case 'antibot':
            case 'anti-bot':
                return 'antibot';
            case 'captcha':
                return 'captcha';
            case 'fingerprint':
            case 'fingerprinting':
                return 'fingerprint';
            case 'waf':
            case 'firewall':
                return 'waf';
            default:
                return 'primary';
        }
    }

    /**
     * Get all tag colors from index.json
     * @returns {object} Object with tag names as keys and color hex values
     */
    getTagColors() {
        return this.categories.tags || {};
    }

    /**
     * Get color for a specific tag (DOM, HEADERS, COOKIES, SCRIPT, etc.)
     * @param {string} tagName - Tag name (case-insensitive)
     * @returns {string} Tag color hex value or default
     */
    getTagColor(tagName) {
        const tags = this.getTagColors();
        let normalizedTagName = tagName.toUpperCase();

        // Handle plural/singular aliases
        const aliases = {
            'CONTENT': 'CONTENT',
            'URLS': 'URL',
            'URL': 'URLS',
            'COOKIE': 'COOKIES',
            'HEADER': 'HEADERS',
            'DOM': 'DOM'
        };

        // Try to get tag data directly first
        let tagData = tags[normalizedTagName];

        // If not found, try alias
        if (!tagData && aliases[normalizedTagName]) {
            tagData = tags[aliases[normalizedTagName]];
        }

        // Handle both old format (string) and new format (object with colour property)
        if (typeof tagData === 'string') {
            return tagData;
        } else if (tagData && tagData.colour) {
            return tagData.colour;
        }

        return '#666666';
    }

    /**
     * Add a new category (runtime only, not persisted to index.json)
     * @param {string} categoryName - Category name
     * @param {object} categoryData - Category configuration
     */
    addCategory(categoryName, categoryData) {
        if (this.hasCategory(categoryName)) {
            console.warn(`Category ${categoryName} already exists`);
            return false;
        }

        this.categories[categoryName] = {
            colour: categoryData.colour || '#3b82f6',
            detectors: categoryData.detectors || [],
            ...categoryData
        };

        console.log(`Added category: ${categoryName}`);
        return true;
    }

    /**
     * Update category color
     * @param {string} categoryName - Category name
     * @param {string} color - New color hex value
     */
    updateCategoryColor(categoryName, color) {
        if (!this.hasCategory(categoryName)) {
            console.error(`Category ${categoryName} not found`);
            return false;
        }

        this.categories[categoryName].colour = color;
        console.log(`Updated ${categoryName} color to ${color}`);
        return true;
    }

    /**
     * Add detector to category
     * @param {string} categoryName - Category name
     * @param {string} detectorName - Detector name to add
     */
    addDetectorToCategory(categoryName, detectorName) {
        if (!this.hasCategory(categoryName)) {
            console.error(`Category ${categoryName} not found`);
            return false;
        }

        if (!this.categories[categoryName].detectors.includes(detectorName)) {
            this.categories[categoryName].detectors.push(detectorName);
            console.log(`Added detector ${detectorName} to category ${categoryName}`);
            return true;
        }

        return false;
    }

    /**
     * Remove detector from category
     * @param {string} categoryName - Category name
     * @param {string} detectorName - Detector name to remove
     */
    removeDetectorFromCategory(categoryName, detectorName) {
        if (!this.hasCategory(categoryName)) {
            console.error(`Category ${categoryName} not found`);
            return false;
        }

        const index = this.categories[categoryName].detectors.indexOf(detectorName);
        if (index > -1) {
            this.categories[categoryName].detectors.splice(index, 1);
            console.log(`Removed detector ${detectorName} from category ${categoryName}`);
            return true;
        }

        return false;
    }

    /**
     * Get total count of categories
     * @returns {number} Number of categories
     */
    getCategoryCount() {
        return Object.keys(this.categories).length;
    }

    /**
     * Get total count of all detectors across all categories
     * @returns {number} Total number of detectors
     */
    getTotalDetectorCount() {
        let count = 0;
        for (const category of Object.values(this.categories)) {
            count += (category.detectors?.length || 0);
        }
        return count;
    }

    /**
     * Clear category data from Chrome storage
     */
    async clearStorage() {
        try {
            // Remove both old and new keys
            await chrome.storage.local.remove(['scrapfly_categories', 'scrapfly_categories.json']);
            console.log('Cleared category storage');
        } catch (error) {
            console.error('Failed to clear category storage:', error);
        }
    }

    /**
     * Get storage information
     * @returns {object} Object with category stats
     */
    getStorageInfo() {
        const detectorCounts = {};
        for (const [name, data] of Object.entries(this.categories)) {
            detectorCounts[name] = data.detectors?.length || 0;
        }

        return {
            categoryCount: this.getCategoryCount(),
            totalDetectorCount: this.getTotalDetectorCount(),
            detectorsByCategory: detectorCounts,
            initialized: this.initialized
        };
    }

    /**
     * Export categories data as JSON string
     * @returns {string} JSON string of categories
     */
    exportCategories() {
        return JSON.stringify(this.categories, null, 2);
    }

    /**
     * Import categories from JSON string
     * @param {string} jsonString - JSON string of categories
     * @returns {boolean} Success status
     */
    importCategories(jsonString) {
        try {
            const imported = JSON.parse(jsonString);
            this.categories = imported;
            console.log('Successfully imported categories');
            return true;
        } catch (error) {
            console.error('Failed to import categories:', error);
            return false;
        }
    }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CategoryManager;
} else if (typeof window !== 'undefined') {
    window.CategoryManager = CategoryManager;
}