// Popup script for Scrapfly Security Detection Extension

class ScrapflyPopup {
  constructor() {
    this.categoryManager = new CategoryManager();
    this.detectorManager = new DetectorManager(this.categoryManager);
    this.detectionEngine = new DetectionEngineManager();
    this.currentTab = 'detection';
    this.detection = new Detection(this.detectorManager, this.detectionEngine);
    this.history = new History(this.detectorManager);
    this.rules = new Rules(this.detectorManager);
    this.advanced = new Advanced(this.detectorManager, this.detection);
    this.settings = new Settings();
  }

  async initialize() {
    try {
      // Initialize notification manager using helper
      NotificationHelper.initialize();
      // Clear badge when popup is opened
      NotificationHelper.clearBadge();

      this.setupEventListeners();
      this.setupMessageHandlers();

      // Initialize detector manager FIRST (will load from storage if available)
      // Check if already initialized to avoid duplicate initialization
      if (!this.detectorManager.initialized) {
        await this.detectorManager.initialize();
        console.log('Popup: DetectorManager initialized');
      } else {
        console.log('Popup: DetectorManager already initialized');
      }

      // Then initialize all sections
      await this.initializeSections();

      // Display initial content after detector data is loaded
      await this.rules.displayRules();
      await this.history.displayHistory();
      await this.advanced.displayAdvancedTools();

      // Show default tab (detection) - this will automatically request detection data
      this.switchTab('detection');

    } catch (error) {
      console.error('Failed to initialize popup:', error);
    }
  }

  /**
   * Initialize all sections
   */
  async initializeSections() {
    try {
      // Initialize each section
      await this.settings.initialize();
      await this.detection.initialize();
      await this.history.initialize();
      await this.rules.initialize();
      await this.advanced.initialize();

      console.log('All sections initialized');
    } catch (error) {
      console.error('Failed to initialize sections:', error);
    }
  }

  setupEventListeners() {
    // Tab navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.currentTarget.dataset.tab;
        this.switchTab(tab);
      });
    });

    // Main enable/disable toggle
    const enableToggle = document.querySelector('#enableToggle');
    if (enableToggle) {
      // Load saved state or default to enabled
      this.loadToggleState();

      // Handle toggle changes
      enableToggle.addEventListener('change', (e) => {
        this.handleEnableToggle(e.target.checked);
      });
    }
  }

  /**
   * Load toggle state from storage
   */
  async loadToggleState() {
    try {
      const result = await chrome.storage.local.get(['scrapfly_enabled']);
      const enabled = result.scrapfly_enabled !== false; // Default to true
      const toggle = document.querySelector('#enableToggle');
      if (toggle) {
        toggle.checked = enabled;
      }
    } catch (error) {
      console.error('Failed to load toggle state:', error);
    }
  }

  /**
   * Handle enable toggle change
   * @param {boolean} enabled - Whether extension is enabled
   */
  async handleEnableToggle(enabled) {
    try {
      await chrome.storage.local.set({ scrapfly_enabled: enabled });
      console.log(`Extension ${enabled ? 'enabled' : 'disabled'}`);

      // You can add additional logic here to enable/disable detection
      // For example, notify content scripts or background script
    } catch (error) {
      console.error('Failed to save toggle state:', error);
    }
  }

  /**
   * Request detection data for the current tab
   */
  async requestCurrentTabDetection() {
    console.log('Popup: Requesting detection data for current tab...');

    // Show loading state while fetching detection data
    this.detection.showLoadingState();

    try {
      // Get current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        console.error('Popup: No active tab found');
        this.detection.showEmptyState();
        return;
      }

      console.log('Popup: Current tab:', tab.url);

      // Don't run detection on extension or browser pages
      if (tab.url.startsWith('chrome://') ||
          tab.url.startsWith('chrome-extension://') ||
          tab.url.startsWith('edge://') ||
          tab.url.startsWith('about:')) {
        console.log('Popup: Skipping detection on browser page');
        this.detection.showEmptyState();
        return;
      }

      // Show loading state
      this.detection.showLoadingState();

      // Ensure connection exists before sending message
      if (!chrome.runtime?.id) {
        console.error('Popup: Extension context invalidated');
        this.detection.showEmptyState();
        return;
      }

      // Request detection data from background script
      try {
        chrome.runtime.sendMessage(
          { type: 'GET_DETECTION_DATA', tabId: tab.id },
          async (response) => {
            // Check for errors
            const lastError = chrome.runtime.lastError;
            if (lastError) {
              console.error('Popup: Error getting detection data:', lastError.message || 'Unknown error');
              // Try requesting fresh detection instead
              setTimeout(() => this.requestFreshDetection(tab.id), 100);
              return;
            }

            if (response && response.data) {
              console.log('Popup: Received detection data:', response.data);
              console.log('Popup: Data keys:', Object.keys(response.data));
              // Process and display the detection data
              await this.processDetectionData(response.data);
            } else {
              console.log('Popup: No detection data available, requesting fresh detection...');
              console.log('Popup: Response was:', response);
              // No data available, request a fresh detection
              setTimeout(() => this.requestFreshDetection(tab.id), 100);
            }
          }
        );
      } catch (msgError) {
        console.error('Popup: Failed to send message:', msgError);
        this.detection.showEmptyState();
      }
    } catch (error) {
      console.error('Popup: Error requesting detection:', error);
      this.detection.showEmptyState();
    }
  }

  /**
   * Request a fresh detection for a specific tab
   * @param {number} tabId - Tab ID
   */
  requestFreshDetection(tabId) {
    console.log(`Popup: Requesting fresh detection for tab ${tabId}`);

    // Ensure connection exists
    if (!chrome.runtime?.id) {
      console.error('Popup: Extension context invalidated');
      this.detection.showEmptyState();
      return;
    }

    try {
      chrome.runtime.sendMessage(
        { type: 'REQUEST_DETECTION', tabId: tabId },
        (response) => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            console.error('Popup: Error requesting fresh detection:', lastError.message || 'Unknown error');
            console.log('Popup: This might be a new tab without content script loaded yet');
            this.detection.showEmptyState();
            return;
          }

          if (response && response.status === 'error') {
            console.error('Popup: Detection request failed:', response.error);
            this.detection.showEmptyState();
            return;
          }

          if (response && response.status === 'skipped') {
            console.log('Popup: Detection skipped (recent detection exists)');
            // Don't show empty state, existing data should be displayed soon
            return;
          }

          console.log('Popup: Fresh detection requested successfully:', response);

          // Wait for the detection to complete
          setTimeout(() => {
            this.requestCurrentTabDetection();
          }, 2000);
        }
      );
    } catch (error) {
      console.error('Popup: Failed to send detection request:', error);
      this.detection.showEmptyState();
    }
  }

  /**
   * Process detection data received from background
   * @param {object} detectionData - Detection data from background
   */
  async processDetectionData(detectionData) {
    console.log('Popup: Processing detection data...');

    // Check if we have pre-analyzed detection results from background
    if (detectionData.detectionResults !== undefined) {
      const isFromStorage = detectionData.fromStorage || false;
      console.log(`Popup: Using ${isFromStorage ? 'stored' : 'fresh'} detection results from background (${detectionData.detectionResults.length} detections)`);

      // Display the results directly
      await this.detection.displayResults(detectionData.detectionResults, {
        fromStorage: isFromStorage,
        storageExpiry: detectionData.storageExpiry,
        cacheMetadata: {
          timestamp: detectionData.timestamp,
          expiry: detectionData.storageExpiry,
          url: detectionData.url,
          favicon: detectionData.favicon || ''
        }
      });

      // History is already saved by background, no need to save again
      console.log('Popup: Detection history already saved by background');
      return;
    }

    // Fallback: Process raw page data if no cached results (shouldn't normally happen)
    const pageData = detectionData.data || detectionData;

    console.log('Popup: No cached results, analyzing page data locally');
    console.log('Popup: Page data URL:', pageData?.url);
    console.log('Popup: Page data has cookies:', pageData?.cookies?.length || 0);
    console.log('Popup: Page data has content:', pageData?.scripts?.length || 0);
    console.log('Popup: Page data has headers:', pageData?.headers ? Object.keys(pageData.headers).length : 0);

    try {
      // Run detection using DetectionEngineManager
      this.detectionEngine.setDetectors(this.detectorManager.getAllDetectors());
      const detections = this.detectionEngine.detectOnPage(pageData);

      console.log(`Popup: Found ${detections.length} detections`);
      if (detections.length > 0) {
        console.log('Popup: First detection:', detections[0]);
      }

      // Display the results
      await this.detection.displayResults(detections);

      // Save to history if there are detections
      if (detections.length > 0) {
        await this.history.addHistoryItem(
          detections,
          pageData.url,
          pageData.tabTitle || pageData.url,
          pageData.favicon || ''
        );
      }
    } catch (error) {
      console.error('Popup: Error processing detection data:', error);
      this.detection.showEmptyState();
    }
  }

  /**
   * Setup message handlers for communication with background script
   */
  setupMessageHandlers() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log('Popup: Received message:', request.type);

      switch (request.type) {
        case 'NEW_DETECTION_DATA':
          // New detection data available
          console.log('Popup: New detection data available for tab:', request.tabId);
          // If we're on the detection tab, refresh the data
          if (this.currentTab === 'detection') {
            this.requestCurrentTabDetection();
          }
          break;

        default:
          console.log('Popup: Unknown message type:', request.type);
      }

      sendResponse({ status: 'received' });
      return false;
    });
  }

  switchTab(tabName) {
    console.log('=== SWITCHING TO TAB:', tabName, '===');

    // Update current tab
    this.currentTab = tabName;

    // Update active tab button
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    const activeBtn = document.querySelector(`[data-tab="${tabName}"]`);
    if (activeBtn) {
      activeBtn.classList.add('active');
      console.log('Active button updated:', activeBtn);
    }

    // Show/hide tab contents - be VERY explicit
    const allTabs = document.querySelectorAll('.tab-content');
    console.log('Found tabs:', Array.from(allTabs).map(t => ({ id: t.id, display: t.style.display, class: t.className })));

    allTabs.forEach(content => {
      content.style.display = 'none';
      content.style.visibility = 'hidden';
      content.classList.remove('active');
      console.log('HIDING tab:', content.id);
    });

    const targetId = `${tabName}Tab`;
    const activeContent = document.querySelector(`#${targetId}`);
    console.log('Looking for tab content with id:', targetId);
    console.log('Found active content element:', activeContent);

    if (activeContent) {
      activeContent.style.display = 'block';
      activeContent.style.visibility = 'visible';
      activeContent.style.opacity = '1';
      activeContent.style.height = 'auto';
      activeContent.style.overflow = 'visible';
      activeContent.classList.add('active');
      console.log('SHOWING tab content:', activeContent.id);
    } else {
      console.error('Could not find tab content for:', tabName);
      console.log('Available tabs:', Array.from(allTabs).map(t => t.id));
    }

    // Handle section-specific logic when tabs are clicked
    switch (tabName) {
      case 'detection':
        console.log('Loading detection tab...');
        // Request fresh detection data when switching to detection tab
        this.requestCurrentTabDetection();
        break;
      case 'history':
        console.log('Loading history tab...');
        this.history.displayHistory();
        break;
      case 'rules':
        console.log('Loading rules tab...');
        this.rules.displayRules();
        break;
      case 'advanced':
        console.log('Loading advanced tab...');
        this.advanced.displayAdvancedTools();
        break;
      default:
        console.log('Unknown tab:', tabName);
    }

    console.log('=== TAB SWITCH COMPLETE ===');
  }

}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const popup = new ScrapflyPopup();
  popup.initialize();
});