/**
 * DetectorManager - Handles loading and management of modular detectors
 */
class DetectorManager {
  constructor() {
    this.detectors = new Map();
    this.detectorIndex = null;
    this.initialized = false;
    this.cachedDetectors = null;
    this.cacheTimestamp = 0;
    this.cacheValidityMs = 5 * 60 * 1000; // 5 minutes cache validity
  }

  /**
   * Initialize the detector manager by loading the index
   */
  async init() {
    if (this.initialized && this.isCacheValid()) {
      return;
    }
    
    try {
      // Load detector index
      const indexResponse = await fetch(chrome.runtime.getURL('detectors/index.json'));
      this.detectorIndex = await indexResponse.json();
      
      // Load enabled detectors
      await this.loadEnabledDetectors();
      
      // Cache the results
      this.cachedDetectors = new Map(this.detectors);
      this.cacheTimestamp = Date.now();
      
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize DetectorManager:', error);
      // Fallback to legacy detectors.json if modular structure fails
      await this.loadLegacyDetectors();
    }
  }

  /**
   * Check if the cache is still valid
   */
  isCacheValid() {
    return this.cachedDetectors && 
           this.cacheTimestamp > 0 && 
           (Date.now() - this.cacheTimestamp) < this.cacheValidityMs;
  }

  /**
   * Load all enabled detectors from their individual files
   */
  async loadEnabledDetectors() {
    // Use cache if available and valid
    if (this.isCacheValid()) {
      this.detectors = new Map(this.cachedDetectors);
      return;
    }
    
    const loadPromises = [];
    
    for (const [id, config] of Object.entries(this.detectorIndex.detectors)) {
      if (config.enabled) {
        loadPromises.push(this.loadDetector(id, config));
      }
    }
    
    await Promise.allSettled(loadPromises);
  }

  /**
   * Load a single detector from its file
   */
  async loadDetector(id, config) {
    try {
      const detectorPath = `detectors/${config.file}`;
      const response = await fetch(chrome.runtime.getURL(detectorPath));
      
      if (!response.ok) {
        throw new Error(`Failed to load detector: ${id}`);
      }
      
      const detector = await response.json();
      detector.priority = config.priority || 50;
      
      this.detectors.set(id, detector);
    } catch (error) {
      console.error(`Error loading detector ${id}:`, error);
    }
  }

  /**
   * Fallback to load legacy detectors.json format
   */
  async loadLegacyDetectors() {
    try {
      const response = await fetch(chrome.runtime.getURL('detectors.json'));
      const legacyData = await response.json();
      
      if (legacyData.detectors) {
        for (const [id, detector] of Object.entries(legacyData.detectors)) {
          this.detectors.set(id, {
            id,
            ...detector,
            priority: 50
          });
        }
      }
      
    } catch (error) {
      console.error('Failed to load legacy detectors:', error);
    }
  }

  /**
   * Get all active detectors
   */
  getDetectors() {
    return Array.from(this.detectors.values());
  }

  /**
   * Get a specific detector by ID
   */
  getDetector(id) {
    return this.detectors.get(id);
  }

  /**
   * Get detectors by category
   */
  getDetectorsByCategory(category) {
    return Array.from(this.detectors.values())
      .filter(detector => detector.category === category);
  }

  /**
   * Enable/disable a detector
   */
  async toggleDetector(id, enabled) {
    if (this.detectorIndex && this.detectorIndex.detectors[id]) {
      this.detectorIndex.detectors[id].enabled = enabled;
      
      if (enabled && !this.detectors.has(id)) {
        await this.loadDetector(id, this.detectorIndex.detectors[id]);
      } else if (!enabled && this.detectors.has(id)) {
        this.detectors.delete(id);
      }
      
      // Save preference
      await chrome.storage.sync.set({
        [`detector_${id}_enabled`]: enabled
      });
    }
  }

  /**
   * Check for detector updates
   */
  async checkForUpdates() {
    if (!this.detectorIndex || !this.detectorIndex.metadata.updateUrl) {
      return false;
    }
    
    try {
      const response = await fetch(this.detectorIndex.metadata.updateUrl);
      const remoteIndex = await response.json();
      
      return remoteIndex.version !== this.detectorIndex.version;
    } catch (error) {
      console.error('Failed to check for updates:', error);
      return false;
    }
  }

  /**
   * Analyze detection results with priorities
   */
  analyzeResults(results) {
    // Sort by priority and confidence
    return results.sort((a, b) => {
      const detectorA = this.getDetector(a.key);
      const detectorB = this.getDetector(b.key);
      
      const priorityA = detectorA?.priority || 0;
      const priorityB = detectorB?.priority || 0;
      
      if (priorityA !== priorityB) {
        return priorityB - priorityA;
      }
      
      return b.confidence - a.confidence;
    });
  }
}

// Export for use in background.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DetectorManager;
}