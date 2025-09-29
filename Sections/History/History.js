class History {
  constructor(detectorManager) {
    this.detectorManager = detectorManager;
    this.historyItems = [];
    this.searchQuery = '';
    this.initialized = false;
    this.paginationManager = null;
  }

  /**
   * Display history items from storage
   */
  async displayHistory() {
    console.log('History.displayHistory called');

    // Ensure HTML is loaded
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      await this.loadHistoryFromStorage();
      this.renderHistory();
    } catch (error) {
      console.error('Failed to display history:', error);
      this.showEmptyState();
    }
  }

  /**
   * Load history from Chrome storage
   */
  async loadHistoryFromStorage() {
    try {
      const result = await chrome.storage.local.get(['scrapfly_history']);

      if (result.scrapfly_history) {
        const historyData = JSON.parse(result.scrapfly_history);
        this.historyItems = historyData.items || [];
        console.log('Loaded history items:', this.historyItems.length);
      } else {
        this.historyItems = [];
      }
    } catch (error) {
      console.error('Failed to load history from storage:', error);
      this.historyItems = [];
    }
  }

  /**
   * Save history to Chrome storage
   */
  async saveHistoryToStorage() {
    try {
      const historyData = {
        timestamp: new Date().toISOString(),
        items: this.historyItems
      };

      await chrome.storage.local.set({
        'scrapfly_history': JSON.stringify(historyData, null, 2)
      });

      console.log('History saved to storage');
    } catch (error) {
      console.error('Failed to save history to storage:', error);
    }
  }

  /**
   * Add a new detection result to history
   * @param {object} detection - Detection result object
   * @param {string} url - URL where detection occurred
   * @param {string} title - Page title
   * @param {string} favicon - Page favicon URL
   */
  async addHistoryItem(detection, url, title = '', favicon = '') {
    const historyItem = {
      id: Date.now().toString(),
      url,
      title: title || url,
      favicon,
      timestamp: new Date().toISOString(),
      detections: Array.isArray(detection) ? detection : [detection],
      totalDetections: Array.isArray(detection) ? detection.length : 1
    };

    // Add to beginning of array (newest first)
    this.historyItems.unshift(historyItem);

    // Keep only last 100 items to prevent storage bloat
    if (this.historyItems.length > 100) {
      this.historyItems = this.historyItems.slice(0, 100);
    }

    await this.saveHistoryToStorage();
    console.log('Added history item:', historyItem);
  }

  /**
   * Render history items in the UI
   */
  renderHistory() {
    if (this.historyItems.length === 0) {
      this.showEmptyState();
      return;
    }

    // Hide empty state
    const historyEmpty = document.querySelector('#historyEmpty');
    if (historyEmpty) historyEmpty.style.display = 'none';

    // Filter items if search query exists
    const itemsToShow = this.searchQuery
      ? this.getFilteredItems()
      : this.historyItems;

    // Use pagination to display items
    if (this.paginationManager) {
      this.paginationManager.setItems(itemsToShow);
    }

    // Ensure pagination is visible
    const historyPagination = document.querySelector('#historyPagination');
    if (historyPagination && itemsToShow.length > 0) {
      historyPagination.style.display = 'flex';
    }
  }

  /**
   * Render history page items (called by pagination manager)
   * @param {Array} items - History items for current page
   */
  renderHistoryPage(items) {
    const historyList = document.querySelector('#historyList');
    if (!historyList) {
      console.error('History list element not found');
      return;
    }

    historyList.style.display = 'block';
    let historyHtml = '';

    items.forEach(item => {
      const timeAgo = this.getTimeAgo(new Date(item.timestamp));
      const domain = this.getDomainFromUrl(item.url);

      // Use Scrapfly icon as default for favicon
      const faviconSrc = item.favicon || chrome.runtime.getURL('icons/icon16.png');

      historyHtml += `
        <div class="history-item" data-history-id="${item.id}">
          <div class="history-item-content">
            <div class="history-header-info">
              <img src="${faviconSrc}" alt="Favicon" class="history-favicon" onerror="this.src='${chrome.runtime.getURL('icons/icon16.png')}'">
              <div class="history-url" title="${item.url || ''}">${domain}</div>
            </div>
            <div class="history-title" title="${item.title || 'Untitled'}">${item.title || 'Untitled'}</div>
            <div class="history-detections">
              ${this.renderHistoryDetections(item.detections || [])}
            </div>
          </div>
          <div class="history-item-right">
            <div class="history-item-actions">
              <button class="history-item-action-btn history-copy-btn" data-action="copy" title="Copy data">
                <svg width="12" height="12" viewBox="0 0 24 24">
                  <path d="M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z" fill="currentColor"/>
                </svg>
              </button>
              <button class="history-item-action-btn history-export-btn" data-action="export" title="Export item">
                <svg width="12" height="12" viewBox="0 0 24 24">
                  <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" fill="currentColor"/>
                </svg>
              </button>
              <button class="history-item-action-btn history-delete-btn" data-action="delete" title="Delete item">
                <svg width="12" height="12" viewBox="0 0 24 24">
                  <path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z" fill="currentColor"/>
                </svg>
              </button>
            </div>
            <div class="history-timestamp">${timeAgo}</div>
          </div>
        </div>
      `;
    });

    historyList.innerHTML = historyHtml;

    // Add click handlers for history items
    this.setupHistoryItemHandlers();
  }

  /**
   * Render detection tags for a history item
   * @param {Array} detections - Array of detections
   * @returns {string} HTML string for detection tags
   */
  renderHistoryDetections(detections) {
    if (!detections || detections.length === 0) {
      return '<span class="history-detection-tag">No detections</span>';
    }

    let tagsHtml = '';
    const maxTags = 2;

    detections.slice(0, maxTags).forEach(detection => {
      const name = detection.detector?.name || detection.detector || 'Unknown';
      const category = detection.category || '';

      // Get detector color from storage
      let detectorColor = '#666666'; // Default fallback
      if (this.detectorManager && category && name !== 'Unknown') {
        const detectorObj = this.detectorManager.getDetectorByName(category, name);
        if (detectorObj && detectorObj.color) {
          detectorColor = detectorObj.color;
        } else {
          // Try with normalized category names if first attempt fails
          const categoryMappings = {
            'Anti-Bot': 'antibot',
            'antibot': 'antibot',
            'CAPTCHA': 'captcha',
            'captcha': 'captcha',
            'Fingerprint': 'fingerprint',
            'fingerprint': 'fingerprint'
          };

          const normalizedCategory = categoryMappings[category] || category.toLowerCase().replace(/[^a-z]/g, '');
          const retryDetectorObj = this.detectorManager.getDetectorByName(normalizedCategory, name);
          if (retryDetectorObj && retryDetectorObj.color) {
            detectorColor = retryDetectorObj.color;
          }
        }
      }

      tagsHtml += `<span class="history-detection-tag" title="${category}" style="background: ${detectorColor}; color: white; border-color: ${detectorColor};">${name}</span>`;
    });

    if (detections.length > maxTags) {
      // Get remaining detection names for tooltip
      const remainingNames = detections.slice(maxTags).map(d =>
        d.detector?.name || d.detector || 'Unknown'
      ).join(', ');

      tagsHtml += `<span class="history-detection-tag more-detections" title="${remainingNames}">+${detections.length - maxTags} more</span>`;
    }

    return tagsHtml;
  }

  /**
   * Show empty state when no history items exist
   */
  showEmptyState() {
    const historyList = document.querySelector('#historyList');
    const historyEmpty = document.querySelector('#historyEmpty');
    const historyPagination = document.querySelector('#historyPagination');

    if (historyList) historyList.style.display = 'none';
    if (historyEmpty) historyEmpty.style.display = 'flex';
    if (historyPagination) historyPagination.style.display = 'none';
  }

  /**
   * Clear all history items
   */
  async clearHistory() {
    try {
      this.historyItems = [];
      await chrome.storage.local.remove(['scrapfly_history']);
      this.showEmptyState();
      console.log('History cleared');
      NotificationHelper.success('History cleared successfully');
    } catch (error) {
      console.error('Failed to clear history:', error);
      NotificationHelper.error('Failed to clear history: ' + error.message);
    }
  }

  /**
   * Handle search functionality
   * @param {string} query - Search query
   */
  handleSearch(query) {
    this.searchQuery = query.toLowerCase().trim();
    this.renderHistory();
  }

  /**
   * Get filtered history items based on search query
   * @returns {Array} Filtered history items
   */
  getFilteredItems() {
    if (!this.searchQuery) return this.historyItems;

    return this.historyItems.filter(item => {
      const url = (item.url || '').toLowerCase();
      const title = (item.title || '').toLowerCase();
      const detectionNames = (item.detections || [])
        .map(d => (d.detector?.name || d.detector || '').toLowerCase())
        .join(' ');

      return url.includes(this.searchQuery) ||
             title.includes(this.searchQuery) ||
             detectionNames.includes(this.searchQuery);
    });
  }

  /**
   * Setup click handlers for history items
   */
  setupHistoryItemHandlers() {
    // Handle action button clicks (copy/export)
    document.querySelectorAll('.history-item-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = e.currentTarget.dataset.action;
        const historyItem = e.currentTarget.closest('.history-item');
        const historyId = historyItem.dataset.historyId;
        const item = this.historyItems.find(h => h.id === historyId);

        if (!item) return;

        if (action === 'copy') {
          this.copyHistoryItem(item);
        } else if (action === 'export') {
          this.exportHistoryItem(item);
        } else if (action === 'delete') {
          this.deleteHistoryItem(item);
        }
      });
    });

    // Handle history item click (open modal)
    document.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const historyId = e.currentTarget.dataset.historyId;
        const historyItem = this.historyItems.find(h => h.id === historyId);

        if (historyItem) {
          this.showHistoryItemDetails(historyItem);
        }
      });
    });
  }

  /**
   * Show detailed view of a history item
   * @param {object} historyItem - History item object
   */
  showHistoryItemDetails(historyItem) {
    console.log('Showing details for history item:', historyItem);

    const modal = document.querySelector('#historyDetailModal');
    if (!modal) {
      console.error('History detail modal not found');
      return;
    }

    // Populate modal header
    const favicon = document.querySelector('#historyModalFavicon');
    const title = document.querySelector('#historyModalTitle');
    const url = document.querySelector('#historyModalUrl');
    const timestamp = document.querySelector('#historyModalTimestamp');
    const detectionCount = document.querySelector('#historyModalDetectionCount');
    const content = document.querySelector('#historyModalContent');

    if (favicon) {
      const faviconUrl = historyItem.favicon || chrome.runtime.getURL('icons/icon16.png');
      favicon.src = faviconUrl;
      favicon.onerror = () => {
        favicon.src = chrome.runtime.getURL('icons/icon16.png');
      };
    }
    if (title) title.textContent = historyItem.title || 'Untitled';
    if (url) {
      url.textContent = historyItem.url;
      url.href = historyItem.url;
    }
    if (timestamp) {
      timestamp.textContent = `🕐 ${this.getTimeAgo(new Date(historyItem.timestamp))} (${new Date(historyItem.timestamp).toLocaleString()})`;
    }
    if (detectionCount) {
      const count = historyItem.detections?.length || 0;
      detectionCount.textContent = `🔍 ${count} detection${count !== 1 ? 's' : ''}`;
    }

    // Render detections in modal
    if (content) {
      content.innerHTML = this.renderDetectionDetails(historyItem.detections || []);
    }

    // Show modal
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Setup close handlers
    this.setupModalCloseHandlers();

    // Setup copy and export handlers
    this.setupModalActionHandlers(historyItem);
  }

  /**
   * Setup copy and export handlers for modal
   * @param {object} historyItem - Current history item
   */
  setupModalActionHandlers(historyItem) {
    const copyBtn = document.querySelector('#historyModalCopy');
    const exportBtn = document.querySelector('#historyModalExport');

    if (copyBtn) {
      copyBtn.onclick = () => this.copyHistoryItem(historyItem);
    }

    if (exportBtn) {
      exportBtn.onclick = () => this.exportHistoryItem(historyItem);
    }
  }

  /**
   * Copy history item data to clipboard
   * @param {object} historyItem - History item to copy
   */
  async copyHistoryItem(historyItem) {
    try {
      const detailsText = this.formatHistoryItemText(historyItem);
      await navigator.clipboard.writeText(detailsText);
      NotificationHelper.success('History item copied to clipboard');
    } catch (error) {
      console.error('Failed to copy:', error);
      NotificationHelper.error('Failed to copy to clipboard');
    }
  }

  /**
   * Format history item as text
   * @param {object} historyItem - History item
   * @returns {string} Formatted text
   */
  formatHistoryItemText(historyItem) {
    let text = `URL: ${historyItem.url}\n`;
    text += `Title: ${historyItem.title || 'Untitled'}\n`;
    text += `Timestamp: ${new Date(historyItem.timestamp).toLocaleString()}\n`;
    text += `\nDetections (${historyItem.detections?.length || 0}):\n`;
    text += '─'.repeat(50) + '\n\n';

    (historyItem.detections || []).forEach((detection, index) => {
      const name = detection.detector?.name || detection.detector || 'Unknown';
      const category = detection.category || '';
      const confidence = detection.confidence || 0;

      text += `${index + 1}. ${name}\n`;
      text += `   Category: ${category}\n`;
      text += `   Confidence: ${confidence}%\n`;

      if (detection.matches && detection.matches.length > 0) {
        text += `   Detection Methods:\n`;
        detection.matches.forEach(match => {
          const methodType = (match.type || 'unknown').toUpperCase();
          const value = match.pattern || match.value || match.name || match.selector || 'unknown';
          text += `     - ${methodType}: ${value} (${match.confidence || 0}%)\n`;
        });
      }
      text += '\n';
    });

    return text;
  }

  /**
   * Export single history item to JSON file
   * @param {object} historyItem - History item to export
   */
  exportHistoryItem(historyItem) {
    const exportData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      item: historyItem
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const domain = this.getDomainFromUrl(historyItem.url);
    const timestamp = new Date(historyItem.timestamp).toISOString().split('T')[0];
    a.href = url;
    a.download = `scrapfly-history-${domain}-${timestamp}.json`;
    a.click();

    URL.revokeObjectURL(url);
    NotificationHelper.success('History item exported');
  }

  /**
   * Delete a single history item
   * @param {Object} historyItem - History item to delete
   */
  async deleteHistoryItem(historyItem) {
    try {
      // Show confirmation dialog
      const confirmed = await NotificationHelper.confirm({
        title: 'Delete History Item',
        message: `Are you sure you want to delete this detection from ${this.getDomainFromUrl(historyItem.url)}?`,
        type: 'warning',
        confirmText: 'Delete',
        cancelText: 'Cancel'
      });

      if (!confirmed) return;

      // Remove from array
      const index = this.historyItems.findIndex(h => h.id === historyItem.id);
      if (index > -1) {
        this.historyItems.splice(index, 1);

        // Save updated history to storage
        const historyData = {
          items: this.historyItems,
          lastUpdated: Date.now()
        };
        await chrome.storage.local.set({
          'scrapfly_history': JSON.stringify(historyData)
        });

        // Re-render the history
        this.renderHistory();

        NotificationHelper.success('History item deleted');
        console.log('History: Item deleted successfully');
      }
    } catch (error) {
      console.error('Failed to delete history item:', error);
      NotificationHelper.error('Failed to delete history item');
    }
  }

  /**
   * Render detection details for modal
   * @param {Array} detections - Array of detection objects
   * @returns {string} HTML string
   */
  renderDetectionDetails(detections) {
    if (!detections || detections.length === 0) {
      return '<div class="history-modal-empty">No detections found</div>';
    }

    return detections.map((detection, index) => {
      const name = detection.detector?.name || detection.detector || 'Unknown';
      const category = detection.category || '';
      const confidence = detection.confidence || 0;
      const hasMethods = detection.matches && detection.matches.length > 0;

      // Get detector color from storage
      let detectorColor = '#666666';
      if (this.detectorManager && category && name !== 'Unknown') {
        const detectorObj = this.detectorManager.getDetectorByName(category, name);
        if (detectorObj && detectorObj.color) {
          detectorColor = detectorObj.color;
        }
      }

      // Get category color from CategoryManager
      let categoryColor = '#666666';
      if (this.detectorManager?.categoryManager && category) {
        const normalizedCategory = this.detectorManager.normalizeCategoryName(category);
        categoryColor = this.detectorManager.categoryManager.getCategoryColor(normalizedCategory) || categoryColor;
      }

      // Confidence class
      let confidenceClass = 'confidence-low';
      if (confidence >= 90) confidenceClass = 'confidence-high';
      else if (confidence >= 70) confidenceClass = 'confidence-medium';

      // Render detection methods
      const methodsHtml = this.renderDetectionMethods(detection.matches || []);

      return `
        <div class="history-modal-detection-card ${hasMethods ? 'has-methods' : ''}" data-detection-index="${index}">
          <div class="history-modal-detection-header">
            <div class="history-modal-detection-name">${name}</div>
            <div class="history-modal-detection-badges">
              <span class="history-modal-badge" style="background: ${categoryColor}; color: white;">${category}</span>
              <span class="history-modal-confidence ${confidenceClass}">${confidence}%</span>
              ${hasMethods ? '<span class="history-modal-expand-icon">▼</span>' : ''}
            </div>
          </div>
          ${hasMethods ? `
            <div class="history-modal-detection-methods">
              ${methodsHtml}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  /**
   * Render detection methods for modal
   * @param {Array} matches - Array of match objects
   * @returns {string} HTML string
   */
  renderDetectionMethods(matches) {
    if (!matches || matches.length === 0) {
      return '<div class="history-modal-no-methods">No detection methods</div>';
    }

    return matches.map(match => {
      const methodType = (match.type || 'unknown').toUpperCase();
      const confidence = match.confidence || 0;

      // Determine display value based on method type
      let displayValue = '';
      switch (match.type?.toLowerCase()) {
        case 'cookie':
        case 'cookies':
          displayValue = match.value || match.name || 'unknown';
          break;
        case 'header':
        case 'headers':
          displayValue = match.value || match.name || 'unknown';
          break;
        case 'content':
        case 'script':
        case 'scripts':
          displayValue = match.pattern || match.content || match.value || 'unknown';
          break;
        case 'url':
        case 'urls':
          displayValue = match.pattern || 'unknown';
          break;
        case 'dom':
          displayValue = match.value || match.selector || match.pattern || 'unknown';
          break;
        default:
          displayValue = match.pattern || match.name || match.value || match.selector || 'unknown';
      }

      // Get tag color
      let tagColor = '#666666';
      if (this.detectorManager?.categoryManager) {
        tagColor = this.detectorManager.categoryManager.getTagColor(methodType) || '#666666';
      }

      // Confidence class
      let confidenceClass = 'confidence-low';
      if (confidence >= 90) confidenceClass = 'confidence-high';
      else if (confidence >= 70) confidenceClass = 'confidence-medium';

      return `
        <div class="history-modal-method-item">
          <span class="history-modal-method-badge" style="background: ${tagColor}; color: white;">${methodType}</span>
          <span class="history-modal-method-value">${displayValue}</span>
          <span class="history-modal-method-confidence ${confidenceClass}">${confidence}%</span>
        </div>
      `;
    }).join('');
  }

  /**
   * Setup modal close handlers
   */
  setupModalCloseHandlers() {
    const modal = document.querySelector('#historyDetailModal');
    const closeBtn = document.querySelector('#historyModalClose');
    const overlay = document.querySelector('.history-modal-overlay');

    const closeModal = () => {
      if (modal) modal.style.display = 'none';
      document.body.style.overflow = 'auto';
    };

    if (closeBtn) {
      closeBtn.onclick = closeModal;
    }

    if (overlay) {
      overlay.onclick = closeModal;
    }

    // ESC key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal && modal.style.display === 'flex') {
        closeModal();
      }
    });

    // Setup expand/collapse for detection cards
    document.querySelectorAll('.history-modal-detection-card.has-methods .history-modal-detection-header').forEach(header => {
      header.addEventListener('click', (e) => {
        e.stopPropagation();
        const card = header.closest('.history-modal-detection-card');
        card.classList.toggle('expanded');
      });
    });
  }

  /**
   * Get domain from URL
   * @param {string} url - Full URL
   * @returns {string} Domain name
   */
  getDomainFromUrl(url) {
    if (!url) return 'Unknown';
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  /**
   * Get human-readable time ago string
   * @param {Date} date - Date object
   * @returns {string} Time ago string
   */
  getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 30) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  }

  /**
   * Export history to JSON file
   */
  exportHistory() {
    const exportData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      itemsCount: this.historyItems.length,
      items: this.historyItems
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const timestamp = new Date().toISOString().split('T')[0];
    a.href = url;
    a.download = `scrapfly-history-${timestamp}.json`;
    a.click();

    URL.revokeObjectURL(url);
    NotificationHelper.success(`Exported ${this.historyItems.length} history items`);
  }

  /**
   * Handle import of history from file
   * @param {Event} event - File change event
   */
  async handleImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Validate the imported data
      if (!data.items || !Array.isArray(data.items)) {
        throw new Error('Invalid history file format');
      }

      // Ask if user wants to merge or replace
      const shouldMerge = await NotificationHelper.confirm({
        title: 'Import History',
        message: `Import ${data.items.length} history items? Current history has ${this.historyItems.length} items.`,
        type: 'info',
        confirmText: 'Merge',
        cancelText: 'Replace'
      });

      if (shouldMerge) {
        // Merge with existing history
        const existingIds = new Set(this.historyItems.map(item => item.id));
        const newItems = data.items.filter(item => !existingIds.has(item.id));
        this.historyItems = [...newItems, ...this.historyItems];

        // Sort by timestamp (newest first)
        this.historyItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Keep only last 100 items
        if (this.historyItems.length > 100) {
          this.historyItems = this.historyItems.slice(0, 100);
        }

        NotificationHelper.success(`Merged ${newItems.length} new history items`);
      } else {
        // Replace existing history
        this.historyItems = data.items.slice(0, 100); // Keep max 100 items
        NotificationHelper.success(`Replaced history with ${this.historyItems.length} items`);
      }

      await this.saveHistoryToStorage();
      this.renderHistory();
    } catch (error) {
      NotificationHelper.error('Failed to import history: ' + error.message);
    }

    // Reset the file input
    event.target.value = '';
  }

  /**
   * Initialize history section with event listeners
   */
  async initialize() {
    if (!this.initialized) {
      await this.loadHTML();
      this.setupPagination();
      this.setupEventListeners();
      this.initialized = true;
    }
  }

  /**
   * Setup pagination manager
   */
  setupPagination() {
    this.paginationManager = new PaginationManager('historyPagination', {
      itemsPerPage: 3,
      onPageChange: (page, items) => {
        this.renderHistoryPage(items);
      }
    });
  }

  /**
   * Load HTML template into history tab
   */
  async loadHTML() {
    try {
      const response = await fetch(chrome.runtime.getURL('Sections/History/history.html'));
      const html = await response.text();

      const historyTab = document.querySelector('#historyTab');
      if (historyTab) {
        historyTab.innerHTML = html;
      }
    } catch (error) {
      console.error('Failed to load history HTML:', error);
    }
  }

  /**
   * Setup event listeners after HTML is loaded
   */
  setupEventListeners() {
    // Setup search functionality
    const searchInput = document.querySelector('#historySearch');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.handleSearch(e.target.value);
      });
    }

    // Setup clear history button
    const clearBtn = document.querySelector('#clearHistoryBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', async () => {
        const confirmed = await NotificationHelper.confirm({
          title: 'Clear History',
          message: 'Are you sure you want to clear all history? This action cannot be undone.',
          type: 'danger',
          confirmText: 'Clear All',
          cancelText: 'Cancel'
        });

        if (confirmed) {
          this.clearHistory();
        }
      });
    }

    // Setup export button
    const exportBtn = document.querySelector('#exportHistoryBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportHistory());
    }

    // Setup import button and file input
    const importBtn = document.querySelector('#importHistoryBtn');
    const importFile = document.querySelector('#importHistoryFile');
    if (importBtn && importFile) {
      importBtn.addEventListener('click', () => importFile.click());
      importFile.addEventListener('change', (e) => this.handleImport(e));
    }
  }

  /**
   * Save reCAPTCHA capture data to advanced history (called from background.js)
   * @param {number} tabId - Tab ID
   * @param {Array} captureResults - Array of capture results
   * @param {Object} chrome - Chrome API object
   * @returns {Promise<boolean>} Success status
   */
  static async saveCaptureToHistory(tabId, captureResults, chrome) {
    try {
      if (!captureResults || captureResults.length === 0) {
        console.log('History: No capture results to save to history');
        return false;
      }

      // Get tab information
      const tab = await chrome.tabs.get(tabId);
      if (!tab || !tab.url) {
        console.warn('History: Cannot save capture - no tab URL');
        return false;
      }

      // Get existing advanced history
      const result = await chrome.storage.local.get(['scrapfly_advanced_history']);
      let history = [];

      if (result.scrapfly_advanced_history) {
        if (typeof result.scrapfly_advanced_history === 'string') {
          try {
            const parsed = JSON.parse(result.scrapfly_advanced_history);
            history = parsed.items || [];
            console.log('History: Parsed advanced history from JSON string format');
          } catch (parseError) {
            console.error('History: Error parsing advanced history JSON:', parseError);
            history = [];
          }
        } else if (Array.isArray(result.scrapfly_advanced_history)) {
          history = result.scrapfly_advanced_history;
        } else if (result.scrapfly_advanced_history.items) {
          history = result.scrapfly_advanced_history.items || [];
        }
      }

      if (!Array.isArray(history)) {
        console.warn('History: Advanced history is not an array, resetting');
        history = [];
      }

      // Create URL hash (simple hash for storage key)
      const urlHash = btoa(tab.url).substring(0, 32);

      // Create history entries (one per capture result)
      const now = Date.now();
      const expirationTime = 30 * 60 * 1000; // 30 minutes in milliseconds

      captureResults.forEach((captureData, index) => {
        const expiresAt = now + expirationTime;
        const expiresAtDate = new Date(expiresAt);
        console.log(`[Capture History] Saving capture ${index + 1} - will expire at: ${expiresAtDate.toLocaleTimeString()}`);
        console.log(`[Capture History] Session Mode: ${captureData.hasSession ? 'Enabled' : 'Disabled'}, Required Cookie: ${captureData.requiredCookie || 'None'}`);

        const historyEntry = {
          id: `capture_${now}_${tabId}_${index}`,
          url: tab.url,
          urlHash: urlHash,
          hostname: new URL(tab.url).hostname,
          title: tab.title || 'Untitled',
          timestamp: now,
          expiresAt: expiresAt, // 30 minutes from now
          captureData: {
            siteKey: captureData.siteKey,
            siteUrl: captureData.siteUrl,
            version: captureData.version,
            type: captureData.type,
            action: captureData.action || '',
            isEnterprise: captureData.isEnterprise,
            isInvisible: captureData.isInvisible,
            isSRequired: captureData.isSRequired,
            apiDomain: captureData.apiDomain || '',
            hasSession: captureData.hasSession || false,
            requiredCookie: captureData.requiredCookie || null
          }
        };

        history.unshift(historyEntry);
      });

      // Limit history to 100 items
      if (history.length > 100) {
        history = history.slice(0, 100);
      }

      // Save back to storage
      const historyData = {
        items: history,
        lastUpdated: Date.now()
      };

      await chrome.storage.local.set({
        scrapfly_advanced_history: JSON.stringify(historyData, null, 2)
      });

      console.log(`History: Saved ${captureResults.length} capture(s) to advanced history for ${tab.url}`);
      return true;
    } catch (error) {
      console.error('History: Error saving capture to history:', error);
      console.error('History: Error stack:', error.stack);
      return false;
    }
  }

  /**
   * Save detection results to history (called from background.js)
   * @param {number} tabId - Tab ID
   * @param {Object} pageData - Page data
   * @param {Array} detectionResults - Detection results
   * @param {Object} chrome - Chrome API object
   * @returns {Promise<boolean>} Success status
   */
  static async saveDetectionToHistory(tabId, pageData, detectionResults, chrome) {
    try {
      // Get existing history
      const result = await chrome.storage.local.get(['scrapfly_history']);
      let history = [];

      // Handle different storage formats for backward compatibility
      if (result.scrapfly_history) {
        if (typeof result.scrapfly_history === 'string') {
          // History.js stores as JSON string with { items: [], lastUpdated: ... }
          try {
            const parsed = JSON.parse(result.scrapfly_history);
            history = parsed.items || [];
            console.log('History: Parsed history from JSON string format');
          } catch (parseError) {
            console.error('History: Error parsing history JSON:', parseError);
            history = [];
          }
        } else if (Array.isArray(result.scrapfly_history)) {
          // Direct array format
          history = result.scrapfly_history;
        } else if (result.scrapfly_history.items) {
          // Object with items array
          history = result.scrapfly_history.items || [];
        } else {
          console.warn('History: Unknown history format, starting fresh');
          history = [];
        }
      }

      // Ensure history is an array
      if (!Array.isArray(history)) {
        console.warn('History: History is not an array, resetting');
        history = [];
      }

      // Create history entry
      const historyEntry = {
        id: `detection_${Date.now()}_${tabId}`,
        url: pageData.url,
        hostname: pageData.hostname,
        title: pageData.title || 'Untitled',
        favicon: pageData.favicon,
        timestamp: Date.now(),
        detections: detectionResults,
        detectionCount: detectionResults.length,
        categories: [...new Set(detectionResults.map(d => d.category))]
      };

      // Add to history (newest first)
      history.unshift(historyEntry);

      // Limit history to 100 items
      if (history.length > 100) {
        history = history.slice(0, 100);
      }

      // Save back to storage in the format History.js expects
      const historyData = {
        items: history,
        lastUpdated: Date.now()
      };

      await chrome.storage.local.set({
        scrapfly_history: JSON.stringify(historyData, null, 2)
      });

      console.log(`History: Saved detection to history for ${pageData.url}`);
      return true;
    } catch (error) {
      console.error('History: Error saving to history:', error);
      console.error('History: Error stack:', error.stack);
      return false;
    }
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = History;
} else if (typeof window !== 'undefined') {
  window.History = History;
}