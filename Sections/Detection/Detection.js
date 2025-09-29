class Detection {
  constructor(detectorManager, detectionEngine) {
    this.detectorManager = detectorManager;
    this.detectionEngine = detectionEngine;
    this.currentResults = [];
    this.searchQuery = '';
    this.initialized = false;
    this.paginationManager = null;
    this.lastNotificationTime = 0;
    this.notificationDebounceTime = 2000; // 2 seconds debounce
  }

  /**
   * Show loading state while detection is running
   */
  showLoadingState() {
    const loadingState = document.querySelector('#loadingState');
    const emptyState = document.querySelector('#emptyState');
    const detectionResults = document.querySelector('#detectionResults');
    const disabledState = document.querySelector('#disabledState');

    if (loadingState) loadingState.style.display = 'flex';
    if (emptyState) emptyState.style.display = 'none';
    if (detectionResults) detectionResults.style.display = 'none';
    if (disabledState) disabledState.style.display = 'none';
  }

  /**
   * Hide loading state
   */
  hideLoadingState() {
    const loadingState = document.querySelector('#loadingState');
    if (loadingState) loadingState.style.display = 'none';
  }

  /**
   * Show empty state when no detections found
   */
  showEmptyState() {
    this.hideLoadingState();
    const emptyState = document.querySelector('#emptyState');
    const detectionResults = document.querySelector('#detectionResults');
    const disabledState = document.querySelector('#disabledState');
    const detectionPagination = document.querySelector('#detectionPagination');

    if (emptyState) emptyState.style.display = 'flex';
    if (detectionResults) detectionResults.style.display = 'none';
    if (disabledState) disabledState.style.display = 'none';
    if (detectionPagination) detectionPagination.style.display = 'none';
  }

  /**
   * Show disabled state when detection is turned off
   */
  showDisabledState() {
    this.hideLoadingState();
    const disabledState = document.querySelector('#disabledState');
    const emptyState = document.querySelector('#emptyState');
    const detectionResults = document.querySelector('#detectionResults');
    const detectionPagination = document.querySelector('#detectionPagination');

    if (disabledState) disabledState.style.display = 'flex';
    if (emptyState) emptyState.style.display = 'none';
    if (detectionResults) detectionResults.style.display = 'none';
    if (detectionPagination) detectionPagination.style.display = 'none';
  }

  /**
   * Display detection results with stats and detected items
   * @param {Array} detections - Array of detection results
   * @param {Object} options - Display options (fromCache, cacheExpiry)
   */
  async displayResults(detections = [], options = {}) {
    console.log('Detection.displayResults called with:', detections, options);

    // Ensure HTML is loaded
    if (!this.initialized) {
      await this.initialize();
    }

    this.currentResults = detections;
    this.displayOptions = options;
    this.cacheMetadata = options.cacheMetadata || null;
    this.hideLoadingState();

    const detectionResults = document.querySelector('#detectionResults');
    const emptyState = document.querySelector('#emptyState');
    const disabledState = document.querySelector('#disabledState');

    if (detections.length === 0) {
      this.showEmptyState();
      // Badge is managed by background script now
      return;
    }

    // Badge is now handled by background script for real-time updates
    const totalDetections = detections.length;

    // Show toast notification ONLY for fresh detections (not when opening popup with cached data)
    if (totalDetections > 0 && options.fromStorage === false) {
      const now = Date.now();

      // Only show notification if enough time has passed since last one
      if (now - this.lastNotificationTime > this.notificationDebounceTime) {
        const detectionMessage = totalDetections === 1
          ? '1 security system detected'
          : `${totalDetections} security systems detected`;

        NotificationHelper.info(detectionMessage, {
          duration: 3000
        });

        this.lastNotificationTime = now;
      }
    }

    // Show results container
    if (detectionResults) detectionResults.style.display = 'flex';
    if (emptyState) emptyState.style.display = 'none';
    if (disabledState) disabledState.style.display = 'none';

    // Update URL display
    this.updateUrlDisplay(options);

    // Update stats
    this.updateStats(detections);

    // Filter items if search query exists
    const itemsToShow = this.searchQuery
      ? this.getFilteredResults()
      : detections;

    // Use pagination to display results
    if (this.paginationManager) {
      this.paginationManager.setItems(itemsToShow);
    }

    // Ensure pagination is visible
    const detectionPagination = document.querySelector('#detectionPagination');
    if (detectionPagination && itemsToShow.length > 0) {
      detectionPagination.style.display = 'flex';
    }

    // Show overview if there are detections
    const detectionOverview = document.querySelector('#detectionOverview');
    if (detectionOverview && detections.length > 0) {
      detectionOverview.style.display = 'block';
    }

    // Update cache info
    this.updateCacheInfo();
  }

  /**
   * Update the stats grid with detection information
   * @param {Array} detections - Array of detection results
   */
  updateStats(detections) {
    const detectionsCount = document.querySelector('#detectionsCount');
    const overallConfidence = document.querySelector('#overallConfidence');
    const difficultyLevel = document.querySelector('#difficultyLevel');
    const difficultyIcon = document.querySelector('#difficultyIcon');
    const detectionTime = document.querySelector('#detectionTime');
    const detectionCount = document.querySelector('#detectionCount');

    const totalDetections = detections.length;
    const avgConfidence = totalDetections > 0
      ? Math.round(detections.reduce((sum, d) => sum + (d.confidence || 0), 0) / totalDetections)
      : 0;

    // Determine difficulty level based on number and confidence of detections
    let difficulty = 'Low';
    let icon = '🛡️';
    if (totalDetections > 5 || avgConfidence > 80) {
      difficulty = 'High';
      icon = '🔥';
    } else if (totalDetections > 2 || avgConfidence > 60) {
      difficulty = 'Medium';
      icon = '⚠️';
    }

    // Update UI elements
    if (detectionsCount) detectionsCount.textContent = totalDetections;
    if (overallConfidence) overallConfidence.textContent = `${avgConfidence}%`;
    if (difficultyLevel) difficultyLevel.textContent = difficulty;
    if (difficultyIcon) difficultyIcon.textContent = icon;

    if (detectionCount) detectionCount.textContent = totalDetections;
  }

  /**
   * Update URL display with favicon and hostname
   * @param {Object} options - Options containing cacheMetadata or URL info
   */
  updateUrlDisplay(options = {}) {
    const siteFavicon = document.querySelector('#siteFavicon');
    const siteUrl = document.querySelector('#siteUrl');

    if (!siteFavicon || !siteUrl) {
      return;
    }

    // Try to get URL from various sources
    let url = '';
    let favicon = '';

    if (options.cacheMetadata) {
      url = options.cacheMetadata.url || '';
      favicon = options.cacheMetadata.favicon || '';
    }

    // If no URL yet, try to get from current tab
    if (!url) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          url = tabs[0].url || '';
          favicon = tabs[0].favIconUrl || '';

          // Update display
          if (url) {
            try {
              const urlObj = new URL(url);
              siteUrl.textContent = urlObj.hostname;
              siteUrl.title = url;
            } catch (e) {
              siteUrl.textContent = url;
              siteUrl.title = url;
            }
          }

          if (favicon) {
            siteFavicon.src = favicon;
          }
        }
      });
    } else {
      // We have URL from cache metadata
      try {
        const urlObj = new URL(url);
        siteUrl.textContent = urlObj.hostname;
        siteUrl.title = url;
      } catch (e) {
        siteUrl.textContent = url;
        siteUrl.title = url;
      }

      // Set favicon if available
      if (favicon) {
        siteFavicon.src = favicon;
      } else {
        // Try to get favicon from Chrome tab API as fallback
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0] && tabs[0].favIconUrl) {
            siteFavicon.src = tabs[0].favIconUrl;
          } else {
            // Try to use default favicon.ico from the domain
            try {
              const urlObj = new URL(url);
              siteFavicon.src = `${urlObj.origin}/favicon.ico`;
            } catch (e) {
              // Use default icon
              siteFavicon.src = 'icons/icon16.png';
            }
          }
        });
      }
    }
  }

  /**
   * Update cache information display
   */
  updateCacheInfo() {
    const cacheExpiry = document.querySelector('#cacheExpiry');

    if (!cacheExpiry) {
      return;
    }

    if (this.cacheMetadata && this.cacheMetadata.expiry) {
      const expiryDate = new Date(this.cacheMetadata.expiry);
      const now = new Date();
      const diff = expiryDate - now;

      if (diff > 0) {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        cacheExpiry.textContent = `${hours}h ${minutes}m`;
      } else {
        cacheExpiry.textContent = 'Expired';
      }
    } else {
      cacheExpiry.textContent = '-';
    }
  }

  /**
   * Clear cached detection for current page
   */
  async clearCache() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]) return;

      const url = tabs[0].url;

      // Send message to background to clear cache
      await chrome.runtime.sendMessage({
        type: 'CLEAR_DETECTION_CACHE',
        url: url
      });

      NotificationHelper.success('Cache cleared successfully');

      // Trigger refresh
      const refreshBtn = document.querySelector('#refreshBtn');
      if (refreshBtn) {
        refreshBtn.click();
      }
    } catch (error) {
      console.error('Failed to clear cache:', error);
      NotificationHelper.error('Failed to clear cache');
    }
  }

  /**
   * Render detections page items (called by pagination manager)
   * @param {Array} detections - Detection items for current page
   */
  renderDetectionsPage(detections) {
    const resultsList = document.querySelector('#resultsList');
    if (!resultsList) return;

    let resultsHtml = '';

    detections.forEach((detection, index) => {
      const confidence = detection.confidence || 0;
      let confidenceClass = 'confidence-low';
      if (confidence >= 90) confidenceClass = 'confidence-high';
      else if (confidence >= 70) confidenceClass = 'confidence-medium';

      const detectorIcon = this.getDetectorIcon(detection);

      // Get category badges
      const categoryBadges = this.getCategoryBadges(detection);

      // Get detection method badges
      const methodBadges = this.getMethodBadges(detection.matches);
      const hasMethods = detection.matches && detection.matches.length > 0;

      resultsHtml += `
        <div class="detection-card ${hasMethods ? 'has-methods' : ''}" data-detection-index="${index}">
          <div class="card-header">
            <div class="card-icon-section">
              ${detectorIcon}
            </div>
            <div class="card-info">
              <h3 class="detector-name">${detection.detector?.name || detection.detector || 'Unknown'}</h3>
              <div class="category-badges">
                ${categoryBadges}
              </div>
            </div>
            <div class="card-actions">
              <span class="confidence-display ${confidenceClass}">${confidence}%</span>
              <button class="copy-btn" data-detection-index="${index}" title="Copy detection details">
                <svg width="14" height="14" viewBox="0 0 24 24">
                  <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" fill="currentColor"/>
                </svg>
              </button>
            </div>
          </div>
          ${detection.matches && detection.matches.length > 0 ? `
            <div class="card-methods">
              <div class="methods-label">Detection Methods:</div>
              <div class="methods-list">
                ${methodBadges}
              </div>
            </div>
          ` : ''}
        </div>
      `;
    });

    resultsList.innerHTML = resultsHtml;

    // Add click handlers for expandable cards
    document.querySelectorAll('.detection-card').forEach(card => {
      const header = card.querySelector('.card-header');
      if (header) {
        header.addEventListener('click', (e) => {
          // Don't toggle if clicking on copy button
          if (!e.target.closest('.copy-btn')) {
            card.classList.toggle('expanded');
          }
        });
      }

      // Add hover effects
      card.addEventListener('mouseenter', () => {
        card.style.transform = 'translateY(-2px)';
      });
      card.addEventListener('mouseleave', () => {
        card.style.transform = 'translateY(0)';
      });
    });

    // Add click handlers for copy buttons
    document.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(btn.getAttribute('data-detection-index'));
        this.copyDetection(index);
      });
    });

    // Add click handlers for method cards
    document.querySelectorAll('.method-item-card').forEach(card => {
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        const copyValue = card.getAttribute('data-copy-value');
        const methodType = card.getAttribute('data-method-type');
        this.copyMethodValue(copyValue, methodType);
      });
    });
  }

  /**
   * Get category badges for detection
   * @param {object} detection - Detection object
   * @returns {string} HTML for category badges
   */
  getCategoryBadges(detection) {
    const badges = [];

    // Main category badge with dynamic color from storage
    if (detection.category) {
      const categoryInfo = this.detectorManager.getCategoryInfo(detection.category.toLowerCase());
      const categoryColor = categoryInfo?.colour || '#666666';
      const categoryName = detection.category.charAt(0).toUpperCase() + detection.category.slice(1);
      badges.push(`<span class="badge" style="background: ${categoryColor}; color: white;">${categoryName}</span>`);
    }

    // Add detection method badges based on actual matches
    if (detection.matches && detection.matches.length > 0) {
      const methodTypes = new Set();
      detection.matches.forEach(match => {
        if (match.type) {
          methodTypes.add(match.type);
        }
      });

      // Convert method types to badges with dynamic colors from CategoryManager
      methodTypes.forEach(type => {
        const typeName = type.toLowerCase();
        const methodName = typeName.toUpperCase();
        const tagColor = this.detectorManager.categoryManager.getTagColor(methodName);

        if (tagColor && tagColor !== '#666666') {
          // Use dynamic color from storage with transparent background
          const r = parseInt(tagColor.slice(1, 3), 16);
          const g = parseInt(tagColor.slice(3, 5), 16);
          const b = parseInt(tagColor.slice(5, 7), 16);
          badges.push(`<span class="badge" style="background: rgba(${r}, ${g}, ${b}, 0.15); color: ${tagColor}; border: 1px solid rgba(${r}, ${g}, ${b}, 0.3);">${methodName}</span>`);
        } else {
          // Fallback to CSS class (use typeName for CSS class)
          const methodClass = `badge-${typeName}`;
          badges.push(`<span class="badge ${methodClass}">${methodName}</span>`);
        }
      });
    }

    return badges.join('');
  }

  /**
   * Get method badges for detection
   * @param {array} matches - Detection matches
   * @returns {string} HTML for method badges
   */
  getMethodBadges(matches) {
    if (!matches || matches.length === 0) {
      return '<div class="method-item-card">Unknown method</div>';
    }

    // Show all methods as individual cards
    const badges = matches.map((match, index) => {
      let methodType = (match.type || 'unknown').toLowerCase();
      methodType = methodType.toUpperCase();
      const confidence = match.confidence || 0;

      // Format the display value based on type
      let displayValue = '';
      let copyValue = '';

      const matchType = (match.type || '').toLowerCase();

      switch (matchType) {
        case 'cookie':
        case 'cookies':
          // Show: name=value format if available, otherwise just name
          displayValue = match.value || match.name || 'unknown';
          copyValue = displayValue;
          break;

        case 'header':
        case 'headers':
          // Show: name: value format if available, otherwise just name
          displayValue = match.value || match.name || 'unknown';
          copyValue = displayValue;
          break;

        case 'content':
        case 'script':
        case 'scripts':
          // Show: pattern first (e.g., "recaptcha"), then value (location)
          displayValue = match.pattern || match.content || match.value || 'unknown';
          copyValue = displayValue;
          break;

        case 'url':
        case 'urls':
          // Show: URL pattern
          displayValue = match.pattern || 'unknown';
          copyValue = displayValue;
          break;

        case 'dom':
          // Show: selector=text format if available, otherwise just selector
          displayValue = match.value || match.selector || match.pattern || 'unknown';
          copyValue = displayValue;
          break;

        default:
          displayValue = match.pattern || match.name || match.value || match.selector || 'unknown';
          copyValue = displayValue;
      }

      // Truncate long values for display (keep full value for copy)
      const maxDisplayLength = 50;
      if (displayValue.length > maxDisplayLength) {
        displayValue = displayValue.substring(0, maxDisplayLength) + '...';
      }

      // Get tag color from CategoryManager
      const tagColor = this.detectorManager.categoryManager.getTagColor(methodType);

      // Always apply solid background color
      const backgroundColor = (tagColor && tagColor !== '#666666') ? tagColor : '#666666';
      const badgeStyle = `style="background: ${backgroundColor}; color: white; border: none;"`;

      // Confidence badge color
      let confidenceClass = 'confidence-low';
      if (confidence >= 90) confidenceClass = 'confidence-high';
      else if (confidence >= 70) confidenceClass = 'confidence-medium';

      // Normalize method type for CSS class (plural to singular)
      const methodClass = methodType.toLowerCase().replace(/s$/, ''); // headers -> header, cookies -> cookie

      return `
        <div class="method-item-card method-${methodClass}" data-copy-value="${copyValue.replace(/"/g, '&quot;')}" data-method-type="${methodType}" title="Click to copy">
          <span class="method-type-badge" ${badgeStyle}>${methodType}</span>
          <input type="text" class="method-value-input" value="${displayValue.replace(/"/g, '&quot;')}" readonly>
          <span class="method-confidence ${confidenceClass}">${confidence}%</span>
        </div>
      `;
    });

    return badges.join('');
  }

  /**
   * Copy detection details to clipboard
   * @param {number} index - Detection index
   */
  copyDetection(index) {
    if (!this.currentResults[index]) return;

    const detection = this.currentResults[index];
    const detailsText = `
Security System: ${detection.detector?.name || 'Unknown'}
Category: ${detection.category || 'Unknown'}
Confidence: ${detection.confidence || 0}%
Detection Methods: ${detection.matches?.map(m => `${m.type}: ${m.pattern || m.name || m.selector}`).join(', ') || 'Unknown'}
    `.trim();

    navigator.clipboard.writeText(detailsText).then(() => {
      NotificationHelper.success('Detection details copied to clipboard');
    }).catch(() => {
      NotificationHelper.error('Failed to copy to clipboard');
    });
  }

  /**
   * Copy individual method value to clipboard
   * @param {string} value - Method value/pattern
   * @param {string} type - Method type
   */
  copyMethodValue(value, type) {
    const textToCopy = `[${type}] ${value}`;
    navigator.clipboard.writeText(textToCopy).then(() => {
      NotificationHelper.success('Method value copied to clipboard');
    }).catch(() => {
      NotificationHelper.error('Failed to copy to clipboard');
    });
  }

  /**
   * Get filtered results based on search query
   * @returns {Array} Filtered detection results
   */
  getFilteredResults() {
    if (!this.searchQuery) return this.currentResults;

    return this.currentResults.filter(detection => {
      const name = (detection.detector?.name || detection.detector || '').toLowerCase();
      const category = (detection.category || '').toLowerCase();
      const description = (detection.detector?.description || '').toLowerCase();

      return name.includes(this.searchQuery) ||
             category.includes(this.searchQuery) ||
             description.includes(this.searchQuery);
    });
  }

  /**
   * Handle search functionality for filtering results
   * @param {string} query - Search query
   */
  handleSearch(query) {
    this.searchQuery = query.toLowerCase().trim();

    // Filter items if search query exists
    const itemsToShow = this.searchQuery
      ? this.getFilteredResults()
      : this.currentResults;

    // Update pagination with filtered results
    if (this.paginationManager) {
      this.paginationManager.setItems(itemsToShow);
    }
  }

  /**
   * Refresh analysis by re-running detection on current page
   */
  async refreshAnalysis() {
    console.log('Refreshing detection analysis...');

    try {
      this.showLoadingState();

      // Get current tab information
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        throw new Error('No active tab found');
      }

      // Request fresh detection from background script
      chrome.runtime.sendMessage(
        { type: 'REQUEST_DETECTION', tabId: tab.id },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error('Detection: Error requesting fresh detection:', chrome.runtime.lastError);
            this.hideLoadingState();
            this.showEmptyState();
            return;
          }

          console.log('Detection: Fresh detection requested:', response);

          // Wait a moment for detection to complete, then request the data
          setTimeout(() => {
            chrome.runtime.sendMessage(
              { type: 'GET_DETECTION_DATA', tabId: tab.id },
              async (dataResponse) => {
                if (chrome.runtime.lastError) {
                  console.error('Detection: Error getting detection data:', chrome.runtime.lastError);
                  this.hideLoadingState();
                  this.showEmptyState();
                  return;
                }

                if (dataResponse && dataResponse.data) {
                  // Run detection using DetectionEngineManager on real data
                  this.detectionEngine.setDetectors(this.detectorManager.getAllDetectors());
                  const detections = this.detectionEngine.detectOnPage(dataResponse.data);
                  console.log(`Detection: Found ${detections.length} detections after refresh`);

                  // Display results
                  this.displayResults(detections);
                } else {
                  console.log('Detection: No data received after refresh');
                  this.hideLoadingState();
                  this.showEmptyState();
                }
              }
            );
          }, 2000); // Wait 2 seconds for detection to complete
        }
      );

    } catch (error) {
      console.error('Failed to refresh analysis:', error);
      this.hideLoadingState();
      this.showEmptyState();
    }
  }

  /**
   * Get detector icon from detector data or fallback to category icon
   * @param {object} detection - Detection object
   * @returns {string} Icon string (emoji or URL)
   */
  getDetectorIcon(detection) {
    // Check for custom uploaded icon first
    if (detection.detector?.customIcon) {
      return `<img src="${detection.detector.customIcon}" alt="${detection.detector.name || 'Icon'}" />`;
    }

    // Try to get real icon from detector data
    if (detection.detector?.icon) {
      // Check if it's an emoji (not a file name)
      if (!detection.detector.icon.includes('.png') &&
          !detection.detector.icon.includes('.jpg') &&
          !detection.detector.icon.includes('.svg') &&
          !detection.detector.icon.includes('http')) {
        // It's an emoji or text, return it directly
        return detection.detector.icon;
      }

      // It's a file, build path to icon in detectors/icons folder
      const iconPath = chrome.runtime.getURL(`detectors/icons/${detection.detector.icon}`);
      const defaultIconPath = chrome.runtime.getURL('detectors/icons/custom.png');
      return `<img src="${iconPath}" alt="${detection.detector.name || 'Icon'}" onerror="this.src='${defaultIconPath}'" />`;
    }

    // No icon specified, use default custom.png
    const defaultIconPath = chrome.runtime.getURL('detectors/icons/custom.png');
    return `<img src="${defaultIconPath}" alt="${detection.detector?.name || 'Icon'}" />`;
  }

  /**
   * Get category icon for display (fallback)
   * @param {string} category - Category name
   * @returns {string} Icon emoji
   */
  getCategoryIcon(category) {
    switch (category?.toLowerCase()) {
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
   * Initialize detection section with event listeners
   */
  async initialize() {
    if (!this.initialized) {
      await this.loadHTML();
      this.setupPagination();
      this.setupEventListeners();
      this.initialized = true;

      // Expose copy function globally for onclick handlers
      window.scrapflyDetection = this;
    }
  }

  /**
   * Setup pagination manager
   */
  setupPagination() {
    this.paginationManager = new PaginationManager('detectionPagination', {
      itemsPerPage: 2,
      onPageChange: (page, items) => {
        this.renderDetectionsPage(items);
      }
    });
  }

  /**
   * Load HTML template into detection tab
   */
  async loadHTML() {
    try {
      const response = await fetch(chrome.runtime.getURL('Sections/Detection/detection.html'));
      const html = await response.text();

      const detectionTab = document.querySelector('#detectionTab');
      if (detectionTab) {
        detectionTab.innerHTML = html;
      }
    } catch (error) {
      console.error('Failed to load detection HTML:', error);
    }
  }

  /**
   * Setup event listeners after HTML is loaded
   */
  setupEventListeners() {
    // Setup search functionality
    const searchInput = document.querySelector('#detectionSearch');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.handleSearch(e.target.value);
      });
    }

    // Setup clear cache button
    const clearCacheBtn = document.querySelector('#clearCacheBtn');
    if (clearCacheBtn) {
      clearCacheBtn.addEventListener('click', () => {
        this.clearCache();
      });
    }
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Detection;
} else if (typeof window !== 'undefined') {
  window.Detection = Detection;
}