class PopupManager {
  constructor() {
    this.currentResults = [];
    this.isEnabled = true;
    this.darkMode = true;
    this.apiEnabled = false;
    this.apiUrl = '';
    this.historyLimit = 100;
    this.customRules = [];
    this.baseDetectors = [];
    this.blacklist = [];
    this.currentTab = 'detection';
    this.currentTabId = null;
    this.cachedProviders = null;
    
    // Pagination state
    this.historyPage = 1;
    this.historyItemsPerPage = 5;
    this.allHistory = [];
    this.filteredHistory = [];
    
    // Detection pagination
    this.detectionsPage = 1;
    this.detectionsItemsPerPage = 3;
    this.allDetections = [];
    this.filteredDetections = [];
    this.currentTabUrl = '';
    
    // Rules pagination
    this.rulesPage = 1;
    this.rulesItemsPerPage = 5;
    this.allRules = [];
    this.filteredRules = [];
    
    // Blacklist pagination
    this.blacklistPage = 1;
    this.blacklistItemsPerPage = 5;
    
    // Bind event handlers to prevent issues with removeEventListener
    this.toggleExtensionHandler = () => this.toggleExtension();
    this.toggleThemeHandler = () => this.toggleTheme();
    
    this.init();
  }

  getCategoryColor(category) {
    // Using shared utility colors for consistency
    const categoryColors = {
      'CAPTCHA': '#dc2626',           // Red
      'Anti-Bot': '#ea580c',          // Orange  
      'WAF': '#2563eb',               // Blue
      'CDN': '#059669',               // Green
      'Fingerprinting': '#f59e0b',    // Amber (updated to match utility)
      'Security': '#10b981',          // Emerald (updated to match utility)
      'Analytics': '#8b5cf6',         // Violet (updated to match utility)
      'Marketing': '#ec4899',         // Pink
      'Bot Management': '#f43f5e',    // Rose
      'Bot Detection': '#ea580c',     // Orange (added from utility)
      'DDoS Protection': '#06b6d4',   // Sky
      'DDoS': '#b91c1c',              // Dark Red (added from utility)
      'Rate Limiting': '#84cc16',     // Lime
      'Fraud Detection': '#d946ef',   // Fuchsia
      'Protection': '#7c3aed'         // Purple (added from utility)
    };
    return categoryColors[category] || '#6b7280'; // Gray default
  }

  async getDetectorColor(detectorName) {
    if (!detectorName) return '#6b7280'; // Default gray
    
    // Colors are now loaded from detector JSON files
    // First, try to get the color from the stored detector data
    try {
      // Get all detectors from storage
      const result = await chrome.storage.local.get(['detectors']);
      const detectors = result.detectors || {};
      
      // Normalize the detector name for matching
      const normalizedName = detectorName.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .trim();
      
      // Look for the detector by name or key
      for (const [key, detector] of Object.entries(detectors)) {
        const detectorNameLower = (detector.name || '').toLowerCase();
        const keyLower = key.toLowerCase();
        
        // Check if we have a match
        if (detectorNameLower === normalizedName || 
            keyLower === normalizedName ||
            detectorNameLower.includes(normalizedName) ||
            normalizedName.includes(detectorNameLower)) {
          // Return the color from the detector JSON if it exists
          if (detector.color) {
            return detector.color;
          }
        }
      }
    } catch (error) {
      console.error('Error getting detector color from storage:', error);
    }
    
    // Fallback to default gray if not found
    return '#6b7280';
  }

  async init() {
    // First load settings and ensure defaults are set
    await this.loadSettings();
    
    // Setup UI and event listeners
    this.setupEventListeners();
    this.setupTabListeners();
    this.applyTheme();
    
    // Update toggle states BEFORE loading results
    this.updateToggleStates();
    
    // Small delay to ensure DOM is fully ready
    setTimeout(async () => {
      // Load custom rules first so we have the enabled status for filtering
      await this.loadCustomRules();
      // Now load the actual data
      this.loadResults();
      this.loadHistory();
      // this.loadAdvancedResults(); // Disabled - Advanced section removed
    }, 100);
  }

  async loadSettings() {
    const result = await chrome.storage.sync.get([
      'enabled', 'darkMode', 'apiEnabled', 'apiUrl', 'historyLimit', 
      'blacklist', 'cacheEnabled', 'cacheDuration'
    ]);
    
    
    // Handle default explicitly - if undefined or null, default to true
    if (result.enabled === undefined || result.enabled === null) {
      this.isEnabled = true;
      // Also set it in storage to avoid future ambiguity
      await chrome.storage.sync.set({ enabled: true });
    } else {
      // Ensure it's a boolean
      this.isEnabled = Boolean(result.enabled);
    }
    
    this.darkMode = result.darkMode !== false;
    this.apiEnabled = result.apiEnabled || false;
    this.apiUrl = result.apiUrl || '';
    this.historyLimit = result.historyLimit || 100;
    this.blacklist = result.blacklist || [];
    this.cacheEnabled = result.cacheEnabled !== false;
    this.cacheDuration = result.cacheDuration || 900;
    
    // Load blacklist UI
    this.loadBlacklistUI();
    
    // Update cache stats
    this.updateCacheStats();
  }

  setupEventListeners() {
    // Tab navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tabButton = e.target.closest('.tab-btn');
        if (tabButton) {
          this.switchTab(tabButton.dataset.tab);
        }
      });
    });

    // Toggle switches
    const enableToggle = document.getElementById('enableToggle');
    if (enableToggle) {
      enableToggle.addEventListener('change', this.toggleExtensionHandler);
    }
    
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
      themeToggle.addEventListener('change', this.toggleThemeHandler);
    }

    // Settings button and modal
    document.getElementById('settingsBtn').addEventListener('click', () => this.showSettingsModal());
    document.getElementById('closeSettingsModal').addEventListener('click', () => this.hideSettingsModal());

    // Export functionality removed
    
    // Refresh button
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.refreshAnalysis());
    }

    // History functionality
    document.getElementById('clearHistoryBtn').addEventListener('click', () => this.clearHistory());
    // Export functionality removed
    
    // Import rules functionality
    const importRulesBtn = document.getElementById('importRulesBtn');
    const importRulesFile = document.getElementById('importRulesFile');
    if (importRulesBtn && importRulesFile) {
      importRulesBtn.addEventListener('click', () => importRulesFile.click());
      importRulesFile.addEventListener('change', (e) => this.importRules(e));
    }
    
    // Export rules functionality
    const exportRulesBtn = document.getElementById('exportRulesBtn');
    if (exportRulesBtn) {
      exportRulesBtn.addEventListener('click', () => this.exportRules());
    }
    
    // Clear rules functionality
    const clearRulesBtn = document.getElementById('clearRulesBtn');
    if (clearRulesBtn) {
      clearRulesBtn.addEventListener('click', () => this.clearAllRules());
    }
    
    // Blacklist functionality - setup with safety checks
    const addBlacklistBtn = document.getElementById('addBlacklistBtn');
    const blacklistInput = document.getElementById('blacklistInput');
    const addCurrentPageBtn = document.getElementById('addCurrentPageBtn');
    
    if (addBlacklistBtn) {
      addBlacklistBtn.addEventListener('click', () => this.addBlacklistItem());
    }
    
    if (addCurrentPageBtn) {
      addCurrentPageBtn.addEventListener('click', () => this.addCurrentPageToBlacklist());
    }
    
    if (blacklistInput) {
      blacklistInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.addBlacklistItem();
      });
    }

    // Custom rules functionality
    document.getElementById('addRuleBtn').addEventListener('click', () => this.showAddRuleModal());
    document.getElementById('closeRuleModal').addEventListener('click', () => this.hideAddRuleModal());
    document.getElementById('cancelRuleBtn').addEventListener('click', () => this.hideAddRuleModal());
    
    // Add event delegation for rule toggle buttons
    const rulesList = document.getElementById('customRulesList');
    if (rulesList) {
      rulesList.addEventListener('click', async (e) => {
        // Check if clicked element is toggle button or its child
        const toggleBtn = e.target.closest('.rule-disable-toggle');
        if (toggleBtn) {
          e.preventDefault();
          e.stopPropagation();
          
          // Prevent double clicks
          if (toggleBtn.dataset.processing === 'true') {
            return;
          }
          
          // Find the rule item and get its data
          const ruleItem = toggleBtn.closest('.custom-rule-item');
          if (ruleItem) {
            // Get the rule index from data attribute
            const ruleIndex = parseInt(ruleItem.dataset.ruleIndex);
            const ruleName = ruleItem.dataset.ruleName;
            
            // Find the rule in our data
            const rule = this.filteredRules.find(r => r.name === ruleName);
            if (rule) {
              // Add visual feedback
              toggleBtn.dataset.processing = 'true';
              toggleBtn.style.opacity = '0.5';
              toggleBtn.style.cursor = 'wait';
              
              try {
                await this.toggleRuleEnabled(rule, ruleIndex);
              } finally {
                // Reset visual feedback
                toggleBtn.dataset.processing = 'false';
                toggleBtn.style.opacity = '';
                toggleBtn.style.cursor = '';
              }
            }
          }
        }
      });
    }
    
    // Reset rules button
    const resetRulesBtn = document.getElementById('resetRulesBtn');
    if (resetRulesBtn) {
      resetRulesBtn.addEventListener('click', async () => {
        if (confirm('Reset all rules to default? This will remove any custom rules.')) {
          await chrome.storage.local.remove(['customRules', 'rulesVersion']);
          this.customRules = [];
          await this.loadBaseDetectorsFromBackground();
          // No overrides after reset, so use all base detectors, sorted by lastUpdated
          const allUnsortedRules = [...this.baseDetectors, ...this.customRules];
          this.allRules = allUnsortedRules.sort((a, b) => {
            const dateA = new Date(a.lastUpdated || a.version || '1970-01-01').getTime();
            const dateB = new Date(b.lastUpdated || b.version || '1970-01-01').getTime();
            return dateB - dateA; // Descending order (newest first)
          });
          this.filteredRules = [...this.allRules];
          this.displayRulesPage();
        }
      });
    }
    document.getElementById('saveRuleBtn').addEventListener('click', () => this.saveCustomRule());

    // Add rule input handlers
    document.getElementById('addCookieRule').addEventListener('click', () => this.addRuleInput('cookieRules', 'cookie'));
    document.getElementById('addHeaderRule').addEventListener('click', () => this.addRuleInput('headerRules', 'header'));
    document.getElementById('addUrlRule').addEventListener('click', () => this.addRuleInput('urlRules', 'url'));
    document.getElementById('addScriptRule').addEventListener('click', () => this.addRuleInput('scriptRules', 'script'));
    document.getElementById('addDomRule').addEventListener('click', () => this.addRuleInput('domRules', 'dom'));
    
    // Event delegation for remove rule buttons in modal
    document.getElementById('addRuleModal').addEventListener('click', (e) => {
      if (e.target.classList.contains('remove-rule-btn') || e.target.parentElement?.classList.contains('remove-rule-btn')) {
        const btn = e.target.classList.contains('remove-rule-btn') ? e.target : e.target.parentElement;
        const inputGroup = btn.closest('.rule-input-group');
        if (inputGroup) {
          inputGroup.remove();
        }
      }
    });

    // Icon selector and upload
    const iconSelector = document.getElementById('ruleIcon');
    const iconPreview = document.getElementById('iconPreview');
    const customIconUpload = document.getElementById('customIconUpload');
    const uploadIconBtn = document.getElementById('uploadIconBtn');
    
    if (iconSelector && iconPreview) {
      // Set initial preview
      this.getProviderIcon('custom.png').then(src => iconPreview.src = src);
      
      iconSelector.addEventListener('change', (e) => {
        if (e.target.value === 'upload') {
          // Show upload button
          uploadIconBtn.style.display = 'block';
          iconSelector.style.display = 'none';
        } else {
          this.getProviderIcon(e.target.value).then(src => iconPreview.src = src);
        }
      });
    }
    
    // Color picker event listener
    const colorPicker = document.getElementById('ruleColor');
    const colorPreview = document.getElementById('colorPreview');
    if (colorPicker && colorPreview) {
      colorPicker.addEventListener('input', (e) => {
        colorPreview.style.background = e.target.value;
      });
    }
    
    if (uploadIconBtn) {
      uploadIconBtn.addEventListener('click', () => {
        customIconUpload.click();
      });
    }
    
    if (customIconUpload) {
      customIconUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
          const base64 = await this.fileToBase64(file);
          // Store the custom icon
          const customIconKey = `custom_icon_${Date.now()}`;
          await chrome.storage.local.set({ [customIconKey]: base64 });
          
          // Update preview
          iconPreview.src = base64;
          
          // Add option to selector
          const option = document.createElement('option');
          option.value = customIconKey;
          option.text = `Custom: ${file.name}`;
          option.selected = true;
          iconSelector.appendChild(option);
          
          // Show selector again, hide upload button
          iconSelector.style.display = 'block';
          uploadIconBtn.style.display = 'none';
          
          // Store the key for this rule
          iconSelector.dataset.customIcon = customIconKey;
        }
      });
    }

    // API settings toggle
    const apiToggle = document.getElementById('apiToggle');
    if (apiToggle) {
      apiToggle.addEventListener('change', (e) => {
        const apiSettings = document.getElementById('apiSettings');
        if (apiSettings) {
          apiSettings.style.display = e.target.checked ? 'block' : 'none';
        }
      });
    }
    
    
    // Cache management
    const clearCacheBtn = document.getElementById('clearCacheBtn');
    if (clearCacheBtn) {
      clearCacheBtn.addEventListener('click', () => this.clearCache());
    }
    
    const cacheToggle = document.getElementById('cacheToggle');
    if (cacheToggle) {
      cacheToggle.addEventListener('change', (e) => this.toggleCache(e.target.checked));
    }
    
    const cacheDuration = document.getElementById('cacheDuration');
    if (cacheDuration) {
      cacheDuration.addEventListener('change', (e) => this.updateCacheDuration(e.target.value));
    }

    // Modal close on backdrop click
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        e.target.style.display = 'none';
      }
    });

    // Save settings when changed
    const apiUrlElement = document.getElementById('apiUrl');
    if (apiUrlElement) {
      apiUrlElement.addEventListener('change', (e) => {
        this.apiUrl = e.target.value;
        chrome.storage.sync.set({ apiUrl: this.apiUrl });
      });
    }

    const historyLimitElement = document.getElementById('historyLimit');
    if (historyLimitElement) {
      historyLimitElement.addEventListener('change', (e) => {
        this.historyLimit = parseInt(e.target.value);
        chrome.storage.sync.set({ historyLimit: this.historyLimit });
      });
    }

    // Event delegation for dynamically added remove buttons
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('remove-rule-btn') || e.target.dataset.action === 'remove') {
        e.preventDefault();
        const ruleGroup = e.target.closest('.rule-input-group');
        if (ruleGroup) {
          ruleGroup.remove();
        }
      }
    });

    // Search functionality
    this.setupSearchFunctionality();

    // Pagination functionality
    this.setupPagination();
  }

  setupSearchFunctionality() {
    // Detection search
    const detectionSearch = document.getElementById('detectionSearch');
    const detectionFilter = document.getElementById('detectionFilter');
    
    if (detectionSearch) {
      detectionSearch.addEventListener('input', (e) => {
        this.filterDetections(e.target.value, detectionFilter?.value || 'all');
      });
    }

    if (detectionFilter) {
      detectionFilter.addEventListener('change', (e) => {
        this.filterDetections(detectionSearch?.value || '', e.target.value);
      });
    }

    // History search
    const historySearch = document.getElementById('historySearch');
    if (historySearch) {
      historySearch.addEventListener('input', (e) => {
        this.filterHistory(e.target.value);
      });
    }

    // Rules search
    const rulesSearch = document.getElementById('rulesSearch');
    if (rulesSearch) {
      rulesSearch.addEventListener('input', (e) => {
        this.filterRules(e.target.value);
      });
    }
  }

  filterDetections(searchTerm, category) {
    if (!this.allDetections) return;

    // Filter the detections data array
    this.filteredDetections = this.allDetections.filter(detection => {
      const name = (detection.name || '').toLowerCase();
      const detectionCategory = (detection.category || '').toLowerCase();
      
      const matchesSearch = !searchTerm || name.includes(searchTerm.toLowerCase());
      const matchesCategory = category === 'all' || detectionCategory === category.toLowerCase();
      
      return matchesSearch && matchesCategory;
    });

    // Reset to first page after filtering
    this.detectionsPage = 1;
    
    // Update count badge
    const countBadge = document.getElementById('detectionCount');
    if (countBadge) {
      countBadge.textContent = this.filteredDetections.length;
    }

    // Update the display
    this.displayDetectionsPage();
  }

  filterHistory(searchTerm) {
    if (!this.allHistory) return;

    // Filter the history data array
    if (!searchTerm || searchTerm.trim() === '') {
      this.filteredHistory = [...this.allHistory];
    } else {
      const lowerSearchTerm = searchTerm.toLowerCase();
      this.filteredHistory = this.allHistory.filter(item => {
        // Search in URL
        const url = (item.url || '').toLowerCase();
        if (url.includes(lowerSearchTerm)) return true;
        
        // Search in detection names and categories (tags)
        for (const detection of item.detections) {
          if (typeof detection === 'string') {
            // Old format - just category
            if (detection.toLowerCase().includes(lowerSearchTerm)) return true;
          } else {
            // New format - check both name and category
            const name = (detection.name || '').toLowerCase();
            const category = (detection.category || '').toLowerCase();
            if (name.includes(lowerSearchTerm) || category.includes(lowerSearchTerm)) return true;
          }
        }
        
        return false;
      });
    }

    // Reset to first page after filtering
    this.historyPage = 1;
    
    // Update the display
    this.displayHistoryPage();
  }

  filterRules(searchTerm) {
    if (!this.allRules) return;

    // Filter the rules data array and maintain sorting by lastUpdated
    this.filteredRules = this.allRules.filter(rule => {
      const name = (rule.name || '').toLowerCase();
      const category = (rule.category || '').toLowerCase();
      
      const matchesSearch = !searchTerm || 
        name.includes(searchTerm.toLowerCase()) || 
        category.includes(searchTerm.toLowerCase());
      
      return matchesSearch;
    }).sort((a, b) => {
      const dateA = new Date(a.lastUpdated || a.version || '1970-01-01').getTime();
      const dateB = new Date(b.lastUpdated || b.version || '1970-01-01').getTime();
      return dateB - dateA; // Descending order (newest first)
    });

    // Reset to first page after filtering
    this.rulesPage = 1;
    
    // Update the display
    this.displayRulesPage();
  }

  setupPagination() {
    // History pagination
    const historyPrevBtn = document.getElementById('historyPrevBtn');
    const historyNextBtn = document.getElementById('historyNextBtn');

    if (historyPrevBtn) {
      historyPrevBtn.addEventListener('click', () => {
        if (this.historyPage > 1) {
          this.historyPage--;
          this.displayHistoryPage();
        }
      });
    }

    if (historyNextBtn) {
      historyNextBtn.addEventListener('click', () => {
        const totalPages = Math.ceil(this.filteredHistory.length / this.historyItemsPerPage);
        if (this.historyPage < totalPages) {
          this.historyPage++;
          this.displayHistoryPage();
        }
      });
    }

    // Detection pagination
    const detectionsPrevBtn = document.getElementById('detectionsPrevBtn');
    const detectionsNextBtn = document.getElementById('detectionsNextBtn');

    if (detectionsPrevBtn) {
      detectionsPrevBtn.addEventListener('click', () => {
        if (this.detectionsPage > 1) {
          this.detectionsPage--;
          this.displayDetectionsPage();
        }
      });
    }

    if (detectionsNextBtn) {
      detectionsNextBtn.addEventListener('click', () => {
        const totalPages = Math.ceil(this.filteredDetections.length / this.detectionsItemsPerPage);
        if (this.detectionsPage < totalPages) {
          this.detectionsPage++;
          this.displayDetectionsPage();
        }
      });
    }

    // Rules pagination
    const rulesPrevBtn = document.getElementById('rulesPrevBtn');
    const rulesNextBtn = document.getElementById('rulesNextBtn');

    if (rulesPrevBtn) {
      rulesPrevBtn.addEventListener('click', () => {
        if (this.rulesPage > 1) {
          this.rulesPage--;
          this.displayRulesPage();
        }
      });
    }

    if (rulesNextBtn) {
      rulesNextBtn.addEventListener('click', () => {
        
        if (!this.filteredRules) {
          console.warn('🛡️ Filtered rules not initialized');
          return;
        }
        
        const totalPages = Math.ceil(this.filteredRules.length / this.rulesItemsPerPage);
        
        if (this.rulesPage < totalPages) {
          this.rulesPage++;
          this.displayRulesPage();
        }
      });
    }

    // Page number clicks for all pagination systems
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('page-number') && !e.target.classList.contains('dots')) {
        const pageNum = parseInt(e.target.textContent);
        if (!isNaN(pageNum)) {
          // Determine which pagination system based on parent container
          const paginationContainer = e.target.closest('.pagination');
          if (paginationContainer && paginationContainer.id === 'historyPagination') {
            this.historyPage = pageNum;
            this.displayHistoryPage();
          } else if (paginationContainer && paginationContainer.id === 'detectionsPagination') {
            this.detectionsPage = pageNum;
            this.displayDetectionsPage();
          } else if (paginationContainer && paginationContainer.id === 'rulesPagination') {
            this.rulesPage = pageNum;
            this.displayRulesPage();
          }
        }
      }
    });
  }

  displayHistoryPage() {
    const historyList = document.getElementById('historyList');
    const historyPagination = document.getElementById('historyPagination');
    const historyPaginationInfo = document.getElementById('historyPaginationInfo');
    const historyPageNumbers = document.getElementById('historyPageNumbers');
    const historyPrevBtn = document.getElementById('historyPrevBtn');
    const historyNextBtn = document.getElementById('historyNextBtn');

    if (!historyList || !this.filteredHistory) return;

    const totalItems = this.filteredHistory.length;
    const totalPages = Math.ceil(totalItems / this.historyItemsPerPage);
    const startIndex = (this.historyPage - 1) * this.historyItemsPerPage;
    const endIndex = Math.min(startIndex + this.historyItemsPerPage, totalItems);

    // Clear current display
    historyList.innerHTML = '';

    // Show items for current page
    for (let i = startIndex; i < endIndex; i++) {
      const item = this.filteredHistory[i];
      const historyItem = this.createHistoryElement(item, i);
      historyList.appendChild(historyItem);
    }

    // Update pagination info
    if (historyPaginationInfo) {
      historyPaginationInfo.textContent = `Showing ${startIndex + 1}-${endIndex} of ${totalItems}`;
    }

    // Update pagination controls
    if (historyPrevBtn) {
      historyPrevBtn.disabled = this.historyPage <= 1;
    }
    if (historyNextBtn) {
      historyNextBtn.disabled = this.historyPage >= totalPages;
    }

    // Update page numbers
    if (historyPageNumbers) {
      historyPageNumbers.innerHTML = this.generatePageNumbers(this.historyPage, totalPages);
    }

    // Show/hide pagination
    if (historyPagination) {
      historyPagination.style.display = totalPages > 1 ? 'flex' : 'none';
    }
  }

  generatePageNumbers(currentPage, totalPages) {
    if (totalPages <= 1) return '';

    let pages = [];
    
    // Always show first page
    if (currentPage > 3) {
      pages.push(1);
      if (currentPage > 4) {
        pages.push('...');
      }
    }

    // Show pages around current page
    const start = Math.max(1, currentPage - 1);
    const end = Math.min(totalPages, currentPage + 1);
    
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    // Always show last page
    if (currentPage < totalPages - 2) {
      if (currentPage < totalPages - 3) {
        pages.push('...');
      }
      pages.push(totalPages);
    }

    return pages.map(page => {
      if (page === '...') {
        return '<span class="page-number dots">...</span>';
      }
      const activeClass = page === currentPage ? 'active' : '';
      return `<span class="page-number ${activeClass}">${page}</span>`;
    }).join('');
  }

  displayDetectionsPage() {
    console.log('🔍 POPUP: displayDetectionsPage() called');
    const resultsList = document.getElementById('resultsList');
    const detectionsPagination = document.getElementById('detectionsPagination');
    const detectionsPaginationInfo = document.getElementById('detectionsPaginationInfo');
    const detectionsPageNumbers = document.getElementById('detectionsPageNumbers');
    const detectionsPrevBtn = document.getElementById('detectionsPrevBtn');
    const detectionsNextBtn = document.getElementById('detectionsNextBtn');

    console.log('🔍 POPUP: filteredDetections:', this.filteredDetections);
    console.log('🔍 POPUP: filteredDetections count:', this.filteredDetections ? this.filteredDetections.length : 0);
    if (!resultsList || !this.filteredDetections) {
      console.log('🔍 POPUP: Missing resultsList or filteredDetections');
      return;
    }

    const totalItems = this.filteredDetections.length;
    const totalPages = Math.ceil(totalItems / this.detectionsItemsPerPage);
    const startIndex = (this.detectionsPage - 1) * this.detectionsItemsPerPage;
    const endIndex = Math.min(startIndex + this.detectionsItemsPerPage, totalItems);

    // Clear current display
    resultsList.innerHTML = '';

    // Show items for current page
    for (let i = startIndex; i < endIndex; i++) {
      const result = this.filteredDetections[i];
      this.createSimpleDetectionElement(result).then(detectionElement => {
        resultsList.appendChild(detectionElement);
      });
    }

    // Update pagination info
    if (detectionsPaginationInfo) {
      detectionsPaginationInfo.textContent = `Showing ${startIndex + 1}-${endIndex} of ${totalItems}`;
    }

    // Update pagination controls
    if (detectionsPrevBtn) {
      detectionsPrevBtn.disabled = this.detectionsPage <= 1;
    }
    if (detectionsNextBtn) {
      detectionsNextBtn.disabled = this.detectionsPage >= totalPages;
    }

    // Update page numbers
    if (detectionsPageNumbers) {
      detectionsPageNumbers.innerHTML = this.generatePageNumbers(this.detectionsPage, totalPages);
    }

    // Show/hide pagination
    if (detectionsPagination) {
      detectionsPagination.style.display = totalPages > 1 ? 'flex' : 'none';
    }
  }

  deduplicateMatches(matches) {
    if (!matches || matches.length === 0) return [];
    
    // Filter out global type matches before deduplication
    const filteredMatches = matches.filter(m => m.type !== 'global');
    
    const uniqueMap = new Map();
    
    filteredMatches.forEach(match => {
      // Create a unique key based on type and significant details
      let key = match.type;
      
      if (match.type === 'cookie' && match.name) {
        key = `${match.type}-${match.name}`;
      } else if (match.type === 'header' && match.name) {
        key = `${match.type}-${match.name}`;
      } else if (match.type === 'script' && match.content) {
        key = `${match.type}-${match.content}`;
      } else if (match.type === 'url' && match.pattern) {
        key = `${match.type}-${match.pattern}`;
      } else if (match.type === 'dom' && match.selector) {
        key = `${match.type}-${match.selector}`;
      }
      
      // Only keep the first occurrence of each unique match
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, match);
      }
    });
    
    return Array.from(uniqueMap.values());
  }

  updateDetectionOverview() {
    const overviewSection = document.getElementById('detectionOverview');
    
    if (this.currentResults.length === 0) {
      overviewSection.style.display = 'none';
      return;
    }
    
    overviewSection.style.display = 'block';
    
    // Update detections count
    const detectionsCount = document.getElementById('detectionsCount');
    if (detectionsCount) {
      detectionsCount.textContent = this.currentResults.length;
    }
    
    // Calculate overall confidence
    const totalConfidence = this.currentResults.reduce((sum, result) => sum + result.confidence, 0);
    const overallConfidence = Math.round(totalConfidence / this.currentResults.length);
    
    // Update overall confidence display
    document.getElementById('overallConfidence').textContent = `${overallConfidence}%`;
    
    // Calculate difficulty level based on detection types and confidence
    const difficultyData = this.calculateDifficultyLevel();
    const difficultyIcon = document.getElementById('difficultyIcon');
    const difficultyLevel = document.getElementById('difficultyLevel');
    
    difficultyIcon.textContent = difficultyData.icon;
    difficultyLevel.textContent = difficultyData.level;
    
    // Update detection timing (mock for now, could be real timing later)
    const detectionTime = document.getElementById('detectionTime');
    const timing = this.calculateDetectionTiming();
    
    detectionTime.textContent = timing.time;
  }

  calculateDifficultyLevel() {
    const antiBotCount = this.currentResults.filter(r => r.category === 'Anti-Bot').length;
    const captchaCount = this.currentResults.filter(r => r.category === 'CAPTCHA').length;
    const wafCount = this.currentResults.filter(r => r.category === 'WAF').length;
    
    const totalConfidence = this.currentResults.reduce((sum, result) => sum + result.confidence, 0);
    const avgConfidence = totalConfidence / this.currentResults.length;
    
    let difficultyScore = 0;
    difficultyScore += antiBotCount * 3; // Anti-bot solutions are high difficulty
    difficultyScore += captchaCount * 2; // CAPTCHAs are medium difficulty
    difficultyScore += wafCount * 1; // WAFs are lower difficulty
    difficultyScore += avgConfidence / 20; // Higher confidence = higher difficulty
    
    if (difficultyScore >= 10) {
      return { level: 'Expert', icon: '🔥' };
    } else if (difficultyScore >= 7) {
      return { level: 'Hard', icon: '🔴' };
    } else if (difficultyScore >= 4) {
      return { level: 'Medium', icon: '🟡' };
    } else {
      return { level: 'Easy', icon: '🟢' };
    }
  }

  calculateDetectionTiming() {
    // Mock timing calculation - in reality this could track actual detection time
    const detectionCount = this.currentResults.length;
    
    if (detectionCount >= 5) {
      return { time: '2.3s' };
    } else if (detectionCount >= 3) {
      return { time: '1.2s' };
    } else {
      return { time: '< 1s' };
    }
  }

  setupTabListeners() {
    // Listen for tab changes to refresh detection results
    if (chrome.tabs && chrome.tabs.onActivated) {
      chrome.tabs.onActivated.addListener(() => {
        if (this.currentTab === 'detection') {
          // Don't show loading state, just refresh results
          this.loadResults();
        }
      });
    }
  }

  switchTab(tabName) {
    // Clear capture check interval if switching away from advanced tab
    if (this.captureCheckInterval && tabName !== 'advanced') {
      clearInterval(this.captureCheckInterval);
      this.captureCheckInterval = null;
    }
    
    // Update active tab button
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    // Show/hide tab content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
      content.style.display = 'none';
    });
    
    const activeTab = document.getElementById(`${tabName}Tab`);
    activeTab.classList.add('active');
    activeTab.style.display = 'block';

    this.currentTab = tabName;
    
    // Handle refresh button visibility when switching tabs
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
      if (tabName === 'detection' && document.getElementById('detectionResults').style.display === 'block') {
        refreshBtn.style.display = 'flex';
      } else {
        refreshBtn.style.display = 'none';
      }
    }

    // Load content for specific tabs
    if (tabName === 'history') {
      this.loadHistory();
    } else if (tabName === 'rules') {
      this.loadCustomRules();
    } else if (tabName === 'advanced') {
      this.loadAdvancedTab();
    } else if (tabName === 'sponsor') {
      this.loadSponsorTab();
    }
  }

  loadSponsorTab() {
    // Set up sponsor button click handlers
    const sponsorCTA = document.querySelector('.sponsor-cta');
    if (sponsorCTA && !sponsorCTA.hasAttribute('data-listener-added')) {
      sponsorCTA.setAttribute('data-listener-added', 'true');
      sponsorCTA.addEventListener('click', () => {
        // Open sponsor website or show more info
        window.open('https://example.com/sponsor-a', '_blank');
      });
    }

    const contactBtn = document.querySelector('.contact-sponsor-btn');
    if (contactBtn && !contactBtn.hasAttribute('data-listener-added')) {
      contactBtn.setAttribute('data-listener-added', 'true');
      contactBtn.addEventListener('click', () => {
        // Open email or contact form
        window.open('mailto:sponsors@shieldeye.com?subject=Sponsorship Inquiry', '_blank');
      });
    }
  }

  applyTheme() {
    document.body.setAttribute('data-theme', this.darkMode ? 'dark' : 'light');
  }

  updateToggleStates() {
    const enableToggle = document.getElementById('enableToggle');
    if (enableToggle) {
      enableToggle.checked = this.isEnabled;
      // Double-check the checkbox state
    }
    
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) themeToggle.checked = this.darkMode;
  }

  async toggleExtension() {
    // Read the actual checkbox state instead of inverting
    const enableToggle = document.getElementById('enableToggle');
    this.isEnabled = enableToggle.checked;
    
    await chrome.storage.sync.set({ enabled: this.isEnabled });
    
    if (this.isEnabled) {
      // When enabling, we need to tell the content script to reanalyze
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // Check if URL is valid for content script
      if (this.isValidUrl(tab.url)) {
        try {
          // Tell content script to reload its enabled state and reanalyze
          await chrome.tabs.sendMessage(tab.id, { action: 'reloadSettings' });
        } catch (error) {
        }
      }
      
      // Small delay to let content script process the change
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Now load results
      await this.loadResults();
    } else {
      // Clear results in background when disabling
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        await chrome.runtime.sendMessage({ action: 'clearTabResults', tabId: tab.id });
      }
      this.showDisabledState();
    }
  }

  async toggleTheme() {
    // Read the actual checkbox state instead of inverting
    const themeToggle = document.getElementById('themeToggle');
    this.darkMode = themeToggle.checked;
    
    await chrome.storage.sync.set({ darkMode: this.darkMode });
    this.applyTheme();
  }

  // API, auto-update and telemetry toggles removed since settings were simplified

  async clearCache() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'clearCache' });
      if (response.success) {
        this.showToast('Cache cleared successfully', 'success');
        this.updateCacheStats();
      }
    } catch (error) {
      this.showToast('Failed to clear cache', 'error');
    }
  }

  async toggleCache(enabled) {
    await chrome.storage.sync.set({ cacheEnabled: enabled });
    this.showToast(enabled ? 'Cache enabled' : 'Cache disabled');
  }

  async updateCacheDuration(duration) {
    await chrome.storage.sync.set({ cacheDuration: parseInt(duration) });
  }

  async updateCacheStats() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getCacheStats' });
      if (response.stats) {
        const statsEl = document.getElementById('cacheStats');
        if (statsEl) {
          statsEl.textContent = `Cached: ${response.stats.detectionResults} sites`;
        }
      }
    } catch (error) {
      console.error('Failed to get cache stats:', error);
    }
  }

  showSettingsModal() {
    document.getElementById('settingsModal').style.display = 'flex';
    
    // Setup blacklist event listeners if they don't exist
    this.setupBlacklistEventListeners();
    
    // Load blacklist UI
    this.loadBlacklistUI();
  }
  
  setupBlacklistEventListeners() {
    const addBlacklistBtn = document.getElementById('addBlacklistBtn');
    const blacklistInput = document.getElementById('blacklistInput');
    
    // Remove existing listeners and add new ones to prevent duplicates
    if (addBlacklistBtn && !addBlacklistBtn.hasAttribute('data-listener-added')) {
      addBlacklistBtn.setAttribute('data-listener-added', 'true');
      addBlacklistBtn.addEventListener('click', () => this.addBlacklistItem());
    }
    
    if (blacklistInput && !blacklistInput.hasAttribute('data-listener-added')) {
      blacklistInput.setAttribute('data-listener-added', 'true');
      blacklistInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.addBlacklistItem();
      });
    }
  }

  hideSettingsModal() {
    document.getElementById('settingsModal').style.display = 'none';
  }

  // Settings tabs removed - simplified interface

  initializeSettingsEventListeners() {
    // Settings event listeners simplified
    return;

    // Toggle switches - save on change
    const toggles = [
      { id: 'autoDetectToggle', key: 'autoDetect' },
      { id: 'customRulesToggle', key: 'customRulesEnabled' },
      { id: 'cacheToggle', key: 'cacheEnabled' },
      { id: 'debugToggle', key: 'debugMode' },
      { id: 'autoCopyToggle', key: 'autoCopy' },
      { id: 'compactViewToggle', key: 'compactView' },
      { id: 'autoUpdateToggle', key: 'autoUpdate' }
    ];

    toggles.forEach(({ id, key }) => {
      const toggle = document.getElementById(id);
      if (toggle) {
        toggle.addEventListener('change', (e) => {
          chrome.storage.sync.set({ [key]: e.target.checked });
        });
      }
    });

    // Select dropdowns - save on change
    const selects = [
      { id: 'historyLimit', key: 'historyLimit', type: 'number' },
      { id: 'autoClearHistory', key: 'autoClearHistory' },
      { id: 'cacheDuration', key: 'cacheDuration', type: 'number' },
      { id: 'defaultFormat', key: 'defaultFormat' }
    ];

    selects.forEach(({ id, key, type }) => {
      const select = document.getElementById(id);
      if (select) {
        select.addEventListener('change', (e) => {
          const value = type === 'number' ? parseInt(e.target.value) : e.target.value;
          chrome.storage.sync.set({ [key]: value });
          
          // Special handling for history limit
          if (key === 'historyLimit') {
            this.historyLimit = value;
          }
        });
      }
    });

    // Clear history button (avoid duplicate)
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    if (clearHistoryBtn && !clearHistoryBtn.hasAttribute('data-initialized')) {
      clearHistoryBtn.setAttribute('data-initialized', 'true');
      clearHistoryBtn.addEventListener('click', () => this.clearHistory());
    }


    // Clear cache button
    const clearCacheBtn = document.getElementById('clearCacheBtn');
    if (clearCacheBtn) {
      clearCacheBtn.addEventListener('click', () => this.clearCache());
    }

    // Test API button
    const testApiBtn = document.getElementById('testApiBtn');
    if (testApiBtn) {
      testApiBtn.addEventListener('click', () => this.testApiConnection());
    }

    // Download logs button
    const downloadLogsBtn = document.getElementById('downloadLogsBtn');
    if (downloadLogsBtn) {
      downloadLogsBtn.addEventListener('click', () => this.downloadDebugLogs());
    }

    // Check updates button
    const checkUpdatesBtn = document.getElementById('checkUpdatesBtn');
    if (checkUpdatesBtn) {
      checkUpdatesBtn.addEventListener('click', () => this.checkForUpdates());
    }

    // Import data button
    const importDataBtn = document.getElementById('importDataBtn');
    const importFile = document.getElementById('importFile');
    if (importDataBtn && importFile) {
      importDataBtn.addEventListener('click', () => importFile.click());
      importFile.addEventListener('change', (e) => this.importAllData(e));
    }

    // Import rules in settings
    const importRulesBtnSettings = document.getElementById('importRulesBtn');
    const importRulesFileSettings = document.getElementById('importRulesFile');
    if (importRulesBtnSettings && importRulesFileSettings && !importRulesBtnSettings.hasAttribute('data-initialized')) {
      importRulesBtnSettings.setAttribute('data-initialized', 'true');
      importRulesBtnSettings.addEventListener('click', () => importRulesFileSettings.click());
      importRulesFileSettings.addEventListener('change', (e) => this.importRules(e));
    }

    // Export functionality removed from settings

    // Load saved settings
    this.loadSettings();
  }

  async loadSettings() {
    const settings = await chrome.storage.sync.get([
      'confidenceThreshold',
      'autoDetect',
      'customRulesEnabled',
      'cacheEnabled',
      'cacheDuration',
      'debugMode',
      'autoClearHistory',
      'defaultProvider',
      'defaultFormat',
      'autoCopy',
      'compactView'
    ]);

    // Apply settings to UI
    if (settings.confidenceThreshold !== undefined) {
      const slider = document.getElementById('confidenceThreshold');
      const value = document.getElementById('confidenceValue');
      if (slider) {
        slider.value = settings.confidenceThreshold;
        value.textContent = settings.confidenceThreshold + '%';
      }
    }

    // Apply other toggles
    const toggles = {
      'autoDetectToggle': settings.autoDetect !== false,
      'customRulesToggle': settings.customRulesEnabled !== false,
      'cacheToggle': settings.cacheEnabled !== false,
      'debugToggle': settings.debugMode === true,
      'autoCopyToggle': settings.autoCopy === true,
      'compactViewToggle': settings.compactView === true
    };

    Object.entries(toggles).forEach(([id, value]) => {
      const toggle = document.getElementById(id);
      if (toggle) toggle.checked = value;
    });

    // Apply select values
    if (settings.cacheDuration) {
      const select = document.getElementById('cacheDuration');
      if (select) select.value = settings.cacheDuration;
    }

    if (settings.autoClearHistory) {
      const select = document.getElementById('autoClearHistory');
      if (select) select.value = settings.autoClearHistory;
    }
  }

  async loadExportProvidersSettings() {
    // Export functionality removed
    return;
  }

  async exportAllData() {
    const data = {
      history: await chrome.storage.local.get('detectionHistory'),
      rules: await chrome.storage.sync.get('customRules'),
      settings: await chrome.storage.sync.get(),
      blacklist: await chrome.storage.sync.get('blacklist'),
      exportDate: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `captcha-detector-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    this.showToast('All data exported successfully');
  }

  async importAllData(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const importData = JSON.parse(text);
      
      if (!importData || typeof importData !== 'object') {
        this.showToast('Invalid backup file format', 'error');
        return;
      }
      
      const shouldRestore = confirm(
        'This will restore all settings, rules, history, and blacklist from the backup.\n\n' +
        'Current data will be replaced. Continue?'
      );
      
      if (!shouldRestore) {
        event.target.value = '';
        return;
      }
      
      // Restore data
      if (importData.history && importData.history.detectionHistory) {
        await chrome.storage.local.set({ detectionHistory: importData.history.detectionHistory });
      }
      
      if (importData.rules && importData.rules.customRules) {
        await chrome.storage.local.set({ customRules: importData.rules.customRules });
      }
      
      if (importData.blacklist && importData.blacklist.blacklist) {
        await chrome.storage.sync.set({ blacklist: importData.blacklist.blacklist });
      }
      
      if (importData.settings) {
        // Remove non-setting keys
        const { detectionHistory, customRules, blacklist, ...settings } = importData.settings;
        await chrome.storage.sync.set(settings);
      }
      
      // Reload everything
      await this.loadSettings();
      await this.loadHistory();
      await this.loadCustomRules();
      await this.loadBlacklistUI();
      
      this.showToast('All data restored successfully');
      
      // Clear file input
      event.target.value = '';
      
    } catch (error) {
      console.error('Failed to import data:', error);
      this.showToast('Failed to import data. Please check the file format.', 'error');
      event.target.value = '';
    }
  }

  async clearCache() {
    await chrome.storage.local.remove(['detectionCache']);
    this.showToast('Cache cleared successfully');
  }

  async testApiConnection() {
    const apiUrl = document.getElementById('apiUrl').value;
    const apiKey = document.getElementById('apiKey').value;
    
    if (!apiUrl) {
      this.showToast('Please enter an API URL', 'error');
      return;
    }
    
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': apiKey ? `Bearer ${apiKey}` : undefined
        },
        body: JSON.stringify({ test: true })
      });
      
      if (response.ok) {
        this.showToast('API connection successful', 'success');
      } else {
        this.showToast(`API error: ${response.status}`, 'error');
      }
    } catch (error) {
      this.showToast('Failed to connect to API', 'error');
    }
  }

  async downloadDebugLogs() {
    const logs = await chrome.storage.local.get('debugLogs');
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `debug-logs-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async checkForUpdates() {
    this.showToast('Checking for updates...');
    // This would normally check a remote endpoint
    setTimeout(() => {
      this.showToast('You are using the latest version');
    }, 1000);
  }

  async refreshAnalysis() {
    // Show loading state while reloading
    this.showLoadingState();
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    try {
      // Reload the page first
      await chrome.tabs.reload(tab.id);
      
      // Wait for the page to load completely
      await new Promise(resolve => {
        const listener = (tabId, changeInfo) => {
          if (tabId === tab.id && changeInfo.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
        
        // Timeout after 10 seconds
        setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }, 10000);
      });
      
      // Now analyze the fresh page
      setTimeout(async () => {
        try {
          await chrome.tabs.sendMessage(tab.id, { action: 'reanalyze' });
        } catch (e) {
          // Content script might not be ready, inject it
          await this.ensureContentScriptAndAnalyze(tab);
        }
        
        // Load results
        setTimeout(() => {
          this.loadResults();
          // this.loadAdvancedResults(); // Disabled - Advanced section removed
        }, 1000);
      }, 500);
    } catch (error) {
      console.error('Failed to refresh analysis:', error);
      this.showEmptyState();
      // this.showAdvancedEmptyState(); // Coming soon
    }
  }

  async loadResults() {
    console.log('🔍 POPUP: loadResults() called');
    
    if (!this.isEnabled) {
      console.log('🔍 POPUP: Extension is disabled');
      this.showDisabledState();
      return;
    }
    

    // Clear previous results but don't show loading state immediately
    this.currentResults = [];
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log('🔍 POPUP: Current tab:', tab.id, tab.url);
    
    // Check if this is a valid URL for content script injection
    if (!this.isValidUrl(tab.url)) {
      console.log('🔍 POPUP: Invalid URL for content script');
      this.showInvalidUrlState();
      this.updateTabInfo(tab.url);
      return;
    }
    
    // Check if URL is blacklisted
    if (await this.isUrlBlacklisted(tab.url)) {
      console.log('🔍 POPUP: URL is blacklisted');
      this.showBlacklistedState();
      this.updateTabInfo(tab.url);
      return;
    }
    
    try {
      console.log('🔍 POPUP: Requesting results from background for tab', tab.id);
      // Try to get existing results first
      const response = await chrome.runtime.sendMessage({
        action: 'getTabResults',
        tabId: tab.id
      });
      
      console.log('🔍 POPUP: Response from background:', response);
      // Filter out any 'global' type matches from results
      let results = (response && response.results) ? response.results : [];
      results = results.map(result => ({
        ...result,
        matches: (result.matches || []).filter(m => m.type !== 'global')
      }));
      this.currentResults = results;
      
      // If no results from background memory, check storage
      if (this.currentResults.length === 0) {
        console.log('🔍 POPUP: No results in memory, checking storage');
        const storageKey = `detection_${tab.id}`;
        const storageData = await chrome.storage.local.get(storageKey);
        if (storageData[storageKey] && storageData[storageKey].results) {
          this.currentResults = storageData[storageKey].results;
          console.log('🔍 POPUP: Found results in storage:', this.currentResults.length);
        }
      }
      
      console.log('🔍 POPUP: Current results count:', this.currentResults.length);
      this.currentTabId = tab.id;
      this.currentTabUrl = tab.url;
      
      // If no results, try to inject content script and analyze
      if (this.currentResults.length === 0) {
        console.log('🔍 POPUP: No results found, trying to inject content script');
        // Show loading state while we ensure content script is ready
        this.showLoadingState();
        
        // Try to ensure content script is loaded and get results
        await this.ensureContentScriptAndAnalyze(tab);
        
        // Check if we got results after ensuring content script
        if (this.currentResults.length > 0) {
          console.log('🔍 POPUP: Got results after content script injection:', this.currentResults.length);
        } else {
          console.log('🔍 POPUP: Still no results after content script injection');
        }
      }
      
      // Update tab info display
      this.updateTabInfo(tab.url);
      
      // Final UI update based on results
      if (this.currentResults.length > 0) {
        console.log('🔍 POPUP: Showing results, count:', this.currentResults.length);
        this.showResults();
        // Add to history
        await this.addToHistory(tab.url, this.currentResults);
      } else {
        console.log('🔍 POPUP: No results to show, displaying empty state');
        this.showEmptyState();
      }
    } catch (error) {
      console.error('Failed to load results:', error);
      console.error('Error details:', error.message, error.stack);
      // If there's an error communicating with background script, show empty state
      this.showEmptyState();
    }
  }

  async isUrlBlacklisted(url) {
    if (!url) return false;
    
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.replace('www.', '');
      
      // Load blacklist from storage
      const result = await chrome.storage.sync.get(['blacklist']);
      const blacklist = result.blacklist || [];
      
      // Check if hostname is in blacklist
      for (const domain of blacklist) {
        if (domain.startsWith('*.')) {
          // Wildcard domain
          const baseDomain = domain.substring(2);
          if (hostname.endsWith(baseDomain) || hostname === baseDomain.replace('*.', '')) {
            return true;
          }
        } else if (hostname === domain) {
          return true;
        }
      }
      
      return false;
    } catch (error) {
      console.error('Error checking blacklist:', error);
      return false;
    }
  }

  isValidUrl(url) {
    if (!url) return false;
    
    // List of restricted URLs where content scripts cannot be injected
    const restrictedPatterns = [
      /^chrome:\/\//,
      /^edge:\/\//,
      /^about:/,
      /^chrome-extension:\/\//,
      /^edge-extension:\/\//,
      /^moz-extension:\/\//,
      /^https:\/\/chrome\.google\.com\/webstore/,
      /^https:\/\/microsoftedge\.microsoft\.com\/addons/,
      /^data:/,
      /^blob:/,
      /^view-source:/
    ];
    
    // Check if URL matches any restricted pattern
    for (const pattern of restrictedPatterns) {
      if (pattern.test(url)) {
        return false;
      }
    }
    
    // Check for file:// URLs (these need special permission)
    if (url.startsWith('file://')) {
      // We could check for file access permission here if needed
      return false;
    }
    
    return true;
  }
  
  showBlacklistedState() {
    this.hideAllDetectionStates();
    
    // Create or update blacklisted state message
    let blacklistedState = document.getElementById('blacklistedState');
    if (!blacklistedState) {
      const detectionTab = document.getElementById('detectionTab');
      if (!detectionTab) {
        console.error('detectionTab element not found');
        return;
      }
      
      blacklistedState = document.createElement('div');
      blacklistedState.id = 'blacklistedState';
      blacklistedState.className = 'empty-state blacklisted-state';
      blacklistedState.innerHTML = `
        <div class="blacklisted-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" style="opacity: 0.8;">
            <path d="M12,1L3,5V11C3,16.55 6.84,21.74 12,23C17.16,21.74 21,16.55 21,11V5L12,1M12,7C13.4,7 14.8,8.1 14.8,9.5V11C15.4,11.6 16,12.3 16,13.3V17C16,18.1 15.1,19 14,19H10C8.9,19 8,18.1 8,17V13.3C8,12.3 8.6,11.6 9.2,11V9.5C9.2,8.1 10.6,7 12,7M12,8.2C11.2,8.2 10.5,8.9 10.5,9.8V11H13.5V9.8C13.5,8.9 12.8,8.2 12,8.2Z" fill="currentColor"/>
          </svg>
        </div>
        <h3 style="color: var(--primary); font-weight: 600;">Domain Excluded</h3>
        <p style="color: var(--text-primary); margin: 10px 0;">This domain is in your exclusion list</p>
        <p class="text-secondary" style="font-size: 12px;">ShieldEye detection is disabled for this website</p>
        <button class="remove-from-blacklist-btn" style="
          margin-top: 16px;
          padding: 8px 20px;
          background: var(--primary);
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        ">
          Remove from Exclusion List
        </button>
      `;
      detectionTab.appendChild(blacklistedState);
      
      // Add event listener for remove button
      const removeBtn = blacklistedState.querySelector('.remove-from-blacklist-btn');
      if (removeBtn) {
        removeBtn.addEventListener('click', async () => {
          await this.removeCurrentPageFromBlacklist();
        });
      }
    }
    blacklistedState.style.display = 'block';
  }

  showInvalidUrlState() {
    this.hideAllDetectionStates();
    
    // Create or update invalid URL message
    let invalidUrlState = document.getElementById('invalidUrlState');
    if (!invalidUrlState) {
      const detectionTab = document.getElementById('detectionTab');
      if (!detectionTab) {
        console.error('detectionTab element not found');
        return;
      }
      
      invalidUrlState = document.createElement('div');
      invalidUrlState.id = 'invalidUrlState';
      invalidUrlState.className = 'empty-state';
      invalidUrlState.innerHTML = `
        <div class="empty-icon">🚫</div>
        <h3>Cannot Analyze This Page</h3>
        <p>This extension cannot analyze browser system pages, extension pages, or local files.</p>
        <p class="text-secondary">Try visiting a regular website to see detections.</p>
      `;
      detectionTab.appendChild(invalidUrlState);
    }
    invalidUrlState.style.display = 'block';
  }
  
  async ensureContentScriptAndAnalyze(tab) {
    try {
      
      // First, try to ping the existing content script
      let contentScriptExists = false;
      try {
        const pingResponse = await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
        contentScriptExists = true;
      } catch (error) {
      }
      
      if (!contentScriptExists) {
        // Content script not responding, inject it
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        
        // Wait for content script to be ready and analyze
        // Use a longer timeout for initial load
        await new Promise(resolve => setTimeout(resolve, 3000));
      } else {
        // Content script exists but no results, trigger reanalysis
        await chrome.tabs.sendMessage(tab.id, { action: 'reanalyze' });
        
        // Wait for analysis to complete
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Try to get results again
      const response = await chrome.runtime.sendMessage({
        action: 'getTabResults',
        tabId: tab.id
      });
      
      // Filter out any 'global' type matches from results
      let results = (response && response.results) ? response.results : [];
      results = results.map(result => ({
        ...result,
        matches: (result.matches || []).filter(m => m.type !== 'global')
      }));
      this.currentResults = results;
      
      // If still no results, try one more time with a longer wait
      if (this.currentResults.length === 0) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        const finalResponse = await chrome.runtime.sendMessage({
          action: 'getTabResults',
          tabId: tab.id
        });
        
        // Filter out any 'global' type matches from results
        let finalResults = (finalResponse && finalResponse.results) ? finalResponse.results : [];
        finalResults = finalResults.map(result => ({
          ...result,
          matches: (result.matches || []).filter(m => m.type !== 'global')
        }));
        this.currentResults = finalResults;
      }
    } catch (error) {
      console.error('🛡️ Popup: Failed to ensure content script:', error);
    }
  }

  showLoadingState() {
    this.hideAllDetectionStates();
    document.getElementById('loadingState').style.display = 'flex';
  }

  showEmptyState() {
    this.hideAllDetectionStates();
    document.getElementById('emptyState').style.display = 'block';
  }

  showDisabledState() {
    this.hideAllDetectionStates();
    document.getElementById('disabledState').style.display = 'block';
  }

  filterDisabledRules(results) {
    // If no rules are loaded yet, check if we have at least base detectors or custom rules
    if ((!this.allRules || this.allRules.length === 0) && 
        (!this.baseDetectors || this.baseDetectors.length === 0) && 
        (!this.customRules || this.customRules.length === 0)) {
      // No rules loaded at all, return all results for now
      console.log('No rules loaded yet, returning all results');
      return results;
    }
    
    // Use allRules if available, otherwise combine base detectors and custom rules
    const rulesToCheck = this.allRules && this.allRules.length > 0 
      ? this.allRules 
      : [...(this.baseDetectors || []), ...(this.customRules || [])];
    
    // Create a map of rule names to their enabled status
    const ruleStatusMap = new Map();
    rulesToCheck.forEach(rule => {
      // Use lowercase for case-insensitive comparison
      const ruleName = rule.name.toLowerCase();
      ruleStatusMap.set(ruleName, rule.enabled !== false);
    });
    
    // Filter results to only include those from enabled rules
    const filtered = results.filter(detection => {
      const detectionName = (detection.name || '').toLowerCase();
      
      // If the rule exists in our map, check if it's enabled
      if (ruleStatusMap.has(detectionName)) {
        const isEnabled = ruleStatusMap.get(detectionName);
        if (!isEnabled) {
          console.log(`Filtering out disabled detection: ${detection.name}`);
        }
        return isEnabled;
      }
      
      // If the rule is not found in our map (shouldn't happen normally),
      // include it by default to avoid losing detections
      console.log(`Detection not found in rules: ${detection.name}, including by default`);
      return true;
    });
    
    console.log(`Filtered ${results.length} detections to ${filtered.length} (${results.length - filtered.length} disabled rules removed)`);
    return filtered;
  }

  showResults() {
    this.hideAllDetectionStates();
    const detectionResults = document.getElementById('detectionResults');
    if (detectionResults) {
      detectionResults.style.display = 'block';
    } else {
      console.error('detectionResults element not found');
    }
    
    // Ensure refresh button is visible when results are shown
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
      refreshBtn.style.display = 'flex';
    }
    
    this.updateResultsDisplay();
  }

  hideAllDetectionStates() {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('disabledState').style.display = 'none';
    document.getElementById('detectionResults').style.display = 'none';
    
    // Hide invalid URL state if it exists
    const invalidUrlState = document.getElementById('invalidUrlState');
    if (invalidUrlState) {
      invalidUrlState.style.display = 'none';
    }
    
    // Hide blacklisted state if it exists
    const blacklistedState = document.getElementById('blacklistedState');
    if (blacklistedState) {
      blacklistedState.style.display = 'none';
    }
    
    // Hide refresh button when no results
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
      refreshBtn.style.display = 'none';
    }
  }

  updateResultsDisplay() {
    console.log('🔍 POPUP: updateResultsDisplay() called');
    console.log('🔍 POPUP: currentResults:', this.currentResults);
    const countBadge = document.getElementById('detectionCount');
    
    // Filter out disabled rules from the detection results
    const enabledResults = this.filterDisabledRules(this.currentResults);
    console.log('🔍 POPUP: enabledResults after filtering:', enabledResults);
    console.log('🔍 POPUP: enabledResults count:', enabledResults.length);
    
    // Store detection data for pagination
    this.allDetections = [...enabledResults];
    this.filteredDetections = [...this.allDetections];
    
    // Reset to first page
    this.detectionsPage = 1;
    
    countBadge.textContent = enabledResults.length;
    
    // Update detection label with site name and format
    const detectionLabel = document.getElementById('detectionLabel');
    if (this.currentTabUrl && detectionLabel) {
      try {
        const urlObj = new URL(this.currentTabUrl);
        const hostname = urlObj.hostname.replace('www.', '');
        detectionLabel.textContent = `Detected Services for ${hostname}:`;
      } catch (e) {
        detectionLabel.textContent = 'Detected Services for site:';
      }
    } else {
      if (detectionLabel) detectionLabel.textContent = 'Detected Solutions for site:';
    }
    
    // Display using pagination
    this.displayDetectionsPage();
    
    // Update overview stats
    this.updateDetectionOverview();
  }

  async createSimpleDetectionElement(result) {
const div = document.createElement('div');
    div.className = 'detection-item simple';
    div.dataset.category = result.category || 'Unknown';
    
    const confidenceClass = result.confidence >= 80 ? 'high' : 
                           result.confidence >= 60 ? 'medium' : 'low';
    
    // Deduplicate matches before display
    const uniqueMatches = this.deduplicateMatches(result.matches || []);
    const matchCount = uniqueMatches.length;
    
    // Create header
    const detectionHeader = document.createElement('div');
    detectionHeader.className = 'detection-header';
    
    // Get icon URL - handle async only for custom icons
    let iconSrc;
    if (result.icon && result.icon.startsWith('custom_icon_')) {
      iconSrc = await this.getProviderIcon(result.icon);
    } else {
      // Use the icon from the result or default to custom.png
      let iconFile = result.icon || 'custom.png';
      
      // If icon is invalid, use custom.png  
      if (iconFile === 'custom.svg' || iconFile === 'undefined' || iconFile === undefined || iconFile === 'null') {
        iconFile = 'custom.png';
      }
      
      iconSrc = chrome.runtime.getURL(`icons/providers/${iconFile}`);
    }
    
    detectionHeader.innerHTML = `
      <div class="detection-info">
        <div class="detection-name-container">
          <img src="${iconSrc}" alt="${result.name}" class="provider-icon" onerror="this.src='${chrome.runtime.getURL('icons/providers/custom.png')}'" />
          <div class="detection-name-simple">${result.name || 'Unknown Service'}</div>
        </div>
        <div class="detection-meta">
          <div class="confidence-display">
            ${this.createConfidenceIndicator(result.confidence, confidenceClass)}
            <span class="confidence-text">${result.confidence}%</span>
          </div>
        </div>
      </div>
      <div class="detection-header-actions">
        <button class="copy-detection-btn copy-btn" title="Copy detection data">
          <svg width="14" height="14" viewBox="0 0 24 24">
            <path d="M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z" fill="currentColor"/>
          </svg>
        </button>
        <svg class="expand-icon" width="14" height="14" viewBox="0 0 24 24">
          <path d="M7 10l5 5 5-5z" fill="currentColor"/>
        </svg>
      </div>
    `;
    
    // Add copy button handler
    const headerCopyBtn = detectionHeader.querySelector('.copy-detection-btn');
    headerCopyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.copyDetection(result);
    });
    
    // Add click handler for expansion
    detectionHeader.addEventListener('click', () => {
      div.classList.toggle('expanded');
    });
    
    // Create preview with detailed match indicators
    const preview = document.createElement('div');
    preview.className = 'detection-preview';
    
    // Category badge should always be gray
    const categoryBadge = `<span class="category-badge-small">${result.category}</span>`;
    
    // Group matches by type
    const matchesByType = {};
    uniqueMatches.forEach(match => {
      if (!matchesByType[match.type]) {
        matchesByType[match.type] = [];
      }
      matchesByType[match.type].push(match);
    });
    
    // Create one tag per type (max 3 types shown) - filter out global
    const matchTypes = Object.keys(matchesByType).filter(type => type !== 'global');
    const matchTags = matchTypes.slice(0, 3).map(type => {
      const typeClass = this.getMatchTypeClass(type);
      const typeName = this.getMatchTypeDisplayName(type);
      if (!typeName) return ''; // Skip null type names
      return `<span class="match-tag ${typeClass}">${typeName}</span>`;
    }).filter(tag => tag).join('');
    
    const moreTypes = matchTypes.length > 3 ? `<span class="more-matches">+${matchTypes.length - 3} more</span>` : '';
    
    preview.innerHTML = `
      ${categoryBadge}
      <div class="match-tags">${matchTags}${moreTypes}</div>
    `;
    
    // Create details section
    const details = document.createElement('div');
    details.className = 'detection-details';
    
    // Create matches list
    const matchesList = document.createElement('div');
    matchesList.className = 'result-matches';
    
    uniqueMatches.forEach(match => {
      // Skip global type matches
      if (match.type === 'global') return;
      
      const matchItem = document.createElement('div');
      matchItem.className = 'match-item';
      
      // Get category and details separately
      const { category, details } = this.getMatchCategoryAndDetails(match);
      
      // Create separate badges for category and value
      matchItem.innerHTML = `
        <span class="match-category match-type-${match.type}">${category}</span>
        <span class="match-value">${details}</span>
        <button class="copy-value-btn" title="Copy value">
          <svg width="12" height="12" viewBox="0 0 24 24">
            <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" fill="currentColor"/>
          </svg>
        </button>
      `;
      
      // Add click event to copy button
      const copyBtn = matchItem.querySelector('.copy-value-btn');
      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(details).then(() => {
          this.showToast('Value copied!');
        });
      });
      
      matchesList.appendChild(matchItem);
    });
    
    details.appendChild(matchesList);
    
    // Create actions
    const actions = document.createElement('div');
    actions.className = 'detection-actions';
    
    const copyBtn = document.createElement('button');
    copyBtn.className = 'action-btn-small';
    copyBtn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24">
        <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" fill="currentColor"/>
      </svg>
      Copy
    `;
    
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.copyDetection(result);
    });
    
    actions.appendChild(copyBtn);
    details.appendChild(actions);
    
    // Assemble the element
    div.appendChild(detectionHeader);
    div.appendChild(preview);
    div.appendChild(details);
    
    return div;
  }

  createParametersSection(parameters, detectorKey) {
    const section = document.createElement('div');
    section.className = 'parameters-section';
    
    let parametersHtml = '<h4 class="parameters-title">Extracted Parameters</h4><div class="parameters-grid">';
    
    if (detectorKey === 'recaptcha') {
      parametersHtml += `
        <div class="param-item">
          <span class="param-label">Site Key:</span>
          <span class="param-value">${parameters.sitekey || 'Not found'}</span>
        </div>
        <div class="param-item">
          <span class="param-label">Version:</span>
          <span class="param-value">${parameters.version || 'Unknown'}</span>
        </div>
        <div class="param-item">
          <span class="param-label">Action:</span>
          <span class="param-value">${parameters.action || 'None'}</span>
        </div>
        <div class="param-item">
          <span class="param-label">Enterprise:</span>
          <span class="param-value">${parameters.enterprise ? '✅' : '❌'}</span>
        </div>
        <div class="param-item">
          <span class="param-label">Invisible:</span>
          <span class="param-value">${parameters.invisible ? '✅' : '❌'}</span>
        </div>
        <div class="param-item">
          <span class="param-label">API Domain:</span>
          <span class="param-value">${parameters.apiDomain || 'google.com'}</span>
        </div>
      `;
    } else if (detectorKey === 'hcaptcha') {
      parametersHtml += `
        <div class="param-item">
          <span class="param-label">Site Key:</span>
          <span class="param-value">${parameters.sitekey || 'Not found'}</span>
        </div>
        <div class="param-item">
          <span class="param-label">Enterprise:</span>
          <span class="param-value">${parameters.enterprise ? '✅' : '❌'}</span>
        </div>
        <div class="param-item">
          <span class="param-label">RQ Data:</span>
          <span class="param-value">${parameters.rqdata ? 'Present' : 'Not required'}</span>
        </div>
      `;
    }
    
    parametersHtml += '</div>';
    section.innerHTML = parametersHtml;
    
    return section;
  }

  async loadAdvancedTab() {
    console.log('🛡️ Advanced Tab: Coming Soon');
    
    // First, ensure the tab itself is visible
    const advancedTab = document.getElementById('advancedTab');
    if (advancedTab) {
      advancedTab.style.display = 'block';
    }
    
    // Advanced features coming soon - no functionality needed
  }

  // Terms of Service handling
  initializeCaptureTerms() {
    const acceptCheckbox = document.getElementById('acceptTermsCheckbox');
    const acceptBtn = document.getElementById('acceptTermsBtn');
    const termsSection = document.getElementById('captureTermsSection');
    const captureSection = document.getElementById('captureSelectionSection');
    
    
    // Handle checkbox change
    if (acceptCheckbox) {
      acceptCheckbox.addEventListener('change', (e) => {
        if (acceptBtn) {
          acceptBtn.disabled = !e.target.checked;
        }
      });
    }
    
    // Handle accept button click
    if (acceptBtn) {
      acceptBtn.addEventListener('click', () => {
        // Store acceptance
        chrome.storage.local.set({ captureTermsAccepted: true }, () => {
          // Hide terms, show capture section with animation
          if (termsSection) {
            termsSection.style.animation = 'fadeOut 0.3s ease';
            setTimeout(() => {
              termsSection.style.display = 'none';
              if (captureSection) {
                captureSection.style.display = 'block';
                captureSection.style.animation = 'fadeIn 0.3s ease';
              }
              this.initializeCaptureMode();
            }, 300);
          }
        });
      });
    }
  }

  // New Capture Mode Functions
  async initializeCaptureMode() {
    this.capturedParams = [];
    this.isCapturing = false;
    this.selectedDetections = new Set();
    
    // Check if capture mode is still active for this tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = await chrome.runtime.sendMessage({
      action: 'getCaptureMode',
      tabId: tab.id
    });
    
    if (response && response.active) {
      this.isCapturing = true;
    } else {
      this.isCapturing = false;
    }
    
    // Setup event listeners
    const startBtn = document.getElementById('startCaptureBtn');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        this.startCapture();
      });
    } else {
      console.error('🛡️ startCaptureBtn not found in DOM!');
    }
    
    document.getElementById('stopCaptureBtn')?.addEventListener('click', () => this.stopCapture());
    document.getElementById('clearCapturesBtn')?.addEventListener('click', () => this.clearCaptures());
    
    // Setup "How this works?" button
    const howItWorksBtn = document.getElementById('howItWorksBtn');
    if (howItWorksBtn) {
      howItWorksBtn.addEventListener('click', async () => await this.showInstructionsModal());
    }
    
    // Ensure we have current results for detection checkboxes
    if (!this.currentResults || this.currentResults.length === 0) {
      // Try to get detection results from the current tab
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs.length > 0) {
        const response = await chrome.runtime.sendMessage({
          action: 'getTabResults',
          tabId: tabs[0].id
        });
        
        if (response && response.results) {
          // Filter for reCAPTCHA results
          this.currentResults = response.results.filter(r => {
            if (!r) return false;
            const normalizedName = (r.name || '').toLowerCase().replace(/[\s-_]/g, '');
            return normalizedName.includes('recaptcha') || r.name === 'Google reCAPTCHA';
          });
        }
      }
    }
    
    // "How this works?" button for empty state removed as it was not working
    
    // Setup instructions modal close buttons (both X and Got it!)
    const closeInstructionsBtn = document.querySelector('.close-instructions-btn');
    if (closeInstructionsBtn) {
      closeInstructionsBtn.addEventListener('click', () => this.hideInstructionsModal());
    }
    
    // Also setup the X close button
    const modalCloseBtn = document.querySelector('.modal-close[data-modal="instructionsModal"]');
    if (modalCloseBtn) {
      modalCloseBtn.addEventListener('click', () => this.hideInstructionsModal());
    }
    
    // Load current detections
    this.loadDetectionsForCapture();
    
    // Load any existing captures
    this.loadCapturedParameters();
  }
  
  async showInstructionsModal() {
    const modal = document.getElementById('instructionsModal');
    if (modal) {
      // Ensure we have current detection results
      if (!this.currentResults || this.currentResults.length === 0) {
        // Try to load detection results
        await this.loadDetectionResultsForModal();
      }
      
      // Add current detection data to the modal
      this.addDetectionDataToModal();
      modal.style.display = 'flex';
      modal.style.animation = 'fadeIn 0.3s ease';
    }
  }
  
  async loadDetectionResultsForModal() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;
      
      const response = await chrome.runtime.sendMessage({
        action: 'getResults',
        tabId: tab.id
      });
      
      if (response && response.results) {
        this.currentResults = response.results;
      }
    } catch (error) {
      console.error('Failed to load detection results for modal:', error);
      this.currentResults = [];
    }
  }
  
  addDetectionDataToModal() {
    // Find or create a detection data section in the modal
    let dataSection = document.getElementById('detectionDataSection');
    if (!dataSection) {
      const modalBody = document.querySelector('.instructions-body');
      if (!modalBody) return;
      
      // Create the detection data section
      dataSection = document.createElement('div');
      dataSection.id = 'detectionDataSection';
      dataSection.className = 'detection-data-section';
      
      // Add it after the instructions content
      const instructionsContent = modalBody.querySelector('.instructions-content');
      if (instructionsContent) {
        modalBody.insertBefore(dataSection, instructionsContent.nextSibling);
      }
    }
    
    // Clear existing content
    dataSection.innerHTML = '';
    
    // Debug: log current results
    
    // Show detection data or a message if no detections
    if (this.currentResults && this.currentResults.length > 0) {
      const dataTitle = document.createElement('h4');
      dataTitle.textContent = '📊 Current Page Detection Data';
      dataSection.appendChild(dataTitle);
      
      const dataContainer = document.createElement('div');
      dataContainer.className = 'detection-data-display';
      
      // Format each detection nicely
      this.currentResults.forEach((detection, index) => {
        const detectionBlock = document.createElement('div');
        detectionBlock.className = 'detection-data-block';
        
        // Add detection name and confidence
        const header = document.createElement('div');
        header.className = 'detection-data-header';
        header.innerHTML = `<strong>${detection.name}</strong> (${detection.confidence}% confidence)`;
        detectionBlock.appendChild(header);
        
        // Add formatted match data
        if (detection.matches && detection.matches.length > 0) {
          const matchesList = document.createElement('div');
          matchesList.className = 'detection-data-matches';
          
          detection.matches.forEach(match => {
            const matchContainer = this.createMatchDisplayElement(match);
            matchesList.appendChild(matchContainer);
          });
          
          detectionBlock.appendChild(matchesList);
        }
        
        dataContainer.appendChild(detectionBlock);
        
        // Add separator between detections
        if (index < this.currentResults.length - 1) {
          const separator = document.createElement('hr');
          separator.className = 'detection-data-separator';
          dataContainer.appendChild(separator);
        }
      });
      
      dataSection.appendChild(dataContainer);
    } else {
      // Show a message if no detections are available
      const noDataMessage = document.createElement('div');
      noDataMessage.className = 'no-detection-data';
      noDataMessage.innerHTML = `
        <h4>📊 Detection Data</h4>
        <div style="color: var(--text-secondary); font-size: 12px; padding: 12px; background: var(--bg-secondary); border-radius: 6px;">
          <p style="margin-bottom: 8px;">No anti-bot solutions detected on the current page yet.</p>
          <p style="margin-bottom: 12px;">Detection data will appear here when captchas or anti-bot systems are found.</p>
          
          <div style="text-align: left; margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border);">
            <strong style="display: block; margin-bottom: 8px;">📋 Supported Captcha Types for Capture:</strong>
            <ul style="list-style: none; padding: 0; margin: 0;">
              <li style="padding: 2px 0;">• reCAPTCHA (v2, v3, Enterprise)</li>
              <li style="padding: 2px 0;">• hCaptcha (Standard & Enterprise)</li>
              <li style="padding: 2px 0;">• FunCaptcha / Arkose Labs</li>
              <li style="padding: 2px 0;">• DataDome</li>
              <li style="padding: 2px 0;">• GeeTest</li>
              <li style="padding: 2px 0;">• Cloudflare Turnstile</li>
            </ul>
          </div>
        </div>
      `;
      dataSection.appendChild(noDataMessage);
    }
  }
  
  createMatchDisplayElement(match) {
    const container = document.createElement('div');
    container.className = 'detection-match-container';
    
    // Create type label
    const typeLabel = document.createElement('div');
    typeLabel.className = 'detection-data-type';
    typeLabel.textContent = `• ${this.getMatchTypeDisplayName(match.type)}`;
    container.appendChild(typeLabel);
    
    // Create details based on match type
    const detailsContainer = document.createElement('div');
    detailsContainer.className = 'detection-data-details';
    
    switch (match.type) {
      case 'cookie':
        this.addDetailLine(detailsContainer, 'Name', match.name);
        this.addDetailLine(detailsContainer, 'Value', match.value || '[any value]');
        break;
        
      case 'header':
        this.addDetailLine(detailsContainer, 'Name', match.name);
        this.addDetailLine(detailsContainer, 'Value', match.value || '[present]');
        break;
        
      case 'url':
        const url = match.url || match.pattern || '[URL pattern]';
        this.addDetailLine(detailsContainer, 'URL', this.truncateText(url, 80));
        break;
        
      case 'script':
        const content = match.content || '[script content]';
        this.addDetailLine(detailsContainer, 'Content', this.truncateText(content, 80));
        break;
        
      case 'dom':
        this.addDetailLine(detailsContainer, 'Selector', match.selector);
        if (match.count) {
          this.addDetailLine(detailsContainer, 'Elements Found', match.count);
        }
        break;
        
      default:
        // For unknown types, show all properties
        const cleanMatch = { ...match };
        delete cleanMatch.type;
        for (const [key, value] of Object.entries(cleanMatch)) {
          if (value !== null && value !== undefined) {
            this.addDetailLine(detailsContainer, key, value);
          }
        }
    }
    
    container.appendChild(detailsContainer);
    return container;
  }
  
  addDetailLine(container, label, value) {
    const line = document.createElement('div');
    line.className = 'detection-data-line';
    
    const labelSpan = document.createElement('span');
    labelSpan.className = 'data-label';
    labelSpan.textContent = `${label}: `;
    
    const valueSpan = document.createElement('span');
    valueSpan.className = 'data-value';
    valueSpan.textContent = String(value);
    
    line.appendChild(labelSpan);
    line.appendChild(valueSpan);
    container.appendChild(line);
  }
  
  truncateText(text, maxLength) {
    if (text.length > maxLength) {
      return text.substring(0, maxLength) + '...';
    }
    return text;
  }
  
  // Keep this for backward compatibility with other parts of the code
  getMatchCategoryAndDetails(match) {
    let category = '';
    let details = '';
    
    switch (match.type) {
      case 'cookie':
        category = 'Cookie';
        details = `${match.name}=${match.value || '*'}`;
        break;
      case 'header':
        category = 'Header';
        details = `${match.name}: ${match.value || '*'}`;
        break;
      case 'url':
        category = 'URL';
        details = match.url || match.pattern;
        break;
      case 'script':
        category = 'Script';
        details = match.content;
        break;
      case 'dom':
        category = 'DOM Element';
        details = match.selector + (match.count ? ` (${match.count} found)` : '');
        break;
      default:
        // Format unknown types more nicely
        category = match.type || 'Unknown';
        const cleanMatch = { ...match };
        delete cleanMatch.type;
        const pairs = Object.entries(cleanMatch)
          .filter(([_, value]) => value !== null && value !== undefined)
          .map(([key, value]) => `${key}: ${value}`);
        details = pairs.join(', ') || JSON.stringify(match);
    }
    
    return { category, details };
  }

  formatMatchDetails(match) {
    const { category, details } = this.getMatchCategoryAndDetails(match);
    return `[${category}] ${details}`;
  }
  
  hideInstructionsModal() {
    const modal = document.getElementById('instructionsModal');
    if (modal) {
      modal.style.animation = 'fadeOut 0.3s ease';
      setTimeout(() => {
        modal.style.display = 'none';
      }, 300);
    }
  }
  
  loadDetectionsForCapture() {
    const checkboxList = document.getElementById('detectionCheckboxList');
    const noDetectionsMsg = document.getElementById('noDetectionsMessage');
    const startBtn = document.getElementById('startCaptureBtn');
    
    if (!checkboxList) return;
    
    
    // Initialize selectedDetections if not already done
    if (!this.selectedDetections) {
      this.selectedDetections = new Set();
    }
    
    checkboxList.innerHTML = '';
    
    // Check if we have any results
    if (!this.currentResults || !Array.isArray(this.currentResults)) {
      if (noDetectionsMsg) noDetectionsMsg.style.display = 'block';
      if (startBtn) startBtn.disabled = true;
      return;
    }
    
    // Define supported captcha types for capture
    // TODO: Enable other capture managers after testing
    const supportedCaptchaTypes = [
      'recaptcha', 'google recaptcha' // Only reCAPTCHA is enabled for now
      // 'hcaptcha', 'funcaptcha', 'arkose', 'datadome', 
      // 'geetest', 'cloudflare', 'turnstile'
    ];
    
    // Filter for captcha-related detections that support capture
    const captchaDetections = this.currentResults.filter(result => {
      if (!result || !result.name) return false;
      const nameLower = result.name.toLowerCase().replace(/[\s-_]/g, '');
      return supportedCaptchaTypes.some(type => nameLower.replace(/[\s-_]/g, '').includes(type.replace(/[\s-_]/g, '')));
    });
    
    if (captchaDetections.length === 0) {
      noDetectionsMsg.style.display = 'block';
      startBtn.disabled = true;
      return;
    }
    
    noDetectionsMsg.style.display = 'none';
    
    captchaDetections.forEach(detection => {
      const detectionItem = document.createElement('div');
      detectionItem.className = 'detection-select-item';
      detectionItem.dataset.detection = detection.name;
      detectionItem.innerHTML = `
        <span class="detection-name">${detection.name}</span>
        <span class="detection-confidence">${detection.confidence}% confidence</span>
      `;
      
      detectionItem.addEventListener('click', () => {
        // Remove previous selection
        document.querySelectorAll('.detection-select-item').forEach(item => {
          item.classList.remove('selected');
        });
        
        // Add selection to clicked item
        detectionItem.classList.add('selected');
        
        // Update selected detections
        this.selectedDetections.clear();
        this.selectedDetections.add(detection.name);
        
        // Enable the start button
        const startBtnCurrent = document.getElementById('startCaptureBtn');
        if (startBtnCurrent) {
          startBtnCurrent.disabled = false;
        } else {
        }
      });
      
      checkboxList.appendChild(detectionItem);
    });
  }
  
  async startCapture() {
    console.log('🛡️ startCapture called');
    console.log('🛡️ Selected detections:', this.selectedDetections);
    
    // Check if we have any selections
    if (!this.selectedDetections || this.selectedDetections.size === 0) {
      console.error('🛡️ No detections selected!');
      this.showToast('Please select a detection first!');
      return;
    }
    
    try {
      this.isCapturing = true;
      
      // Notify background script to start capturing
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      console.log('🛡️ Current tab:', tab.id, tab.url);
      
      const message = {
        action: 'startCaptureMode',
        tabId: tab.id,
        targets: Array.from(this.selectedDetections)
      };
      console.log('🛡️ Sending message to background:', message);
      
      const response = await chrome.runtime.sendMessage(message);
      console.log('🛡️ Background response:', response);
      
      if (!response || !response.success) {
        throw new Error('Failed to start capture mode');
      }
      
      // Show a quick message before closing
      this.showToast('Capture mode activated! Now trigger the captcha on the page.');
      
      // Update UI to show capturing state
      document.getElementById('stopCaptureBtn').style.display = 'inline-flex';
      document.getElementById('startCaptureBtn').style.display = 'none';
      document.getElementById('captureInstructions').style.display = 'block';
      
      // Update instructions to show reload message
      const instructionsDiv = document.getElementById('captureInstructions');
      if (instructionsDiv) {
        instructionsDiv.innerHTML = `
          <div class="instructions-content">
            <svg width="24" height="24" viewBox="0 0 24 24">
              <path d="M13,9H11V7H13M13,17H11V11H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z" fill="#f59e0b"/>
            </svg>
            <div>
              <h4>Capture Mode Active!</h4>
              <p><strong>This popup will close in 2 seconds.</strong></p>
              <p>After it closes:</p>
              <ul style="text-align: left;">
                <li><strong>Press F5 to refresh the page immediately</strong></li>
                <li>The reCAPTCHA will be captured on page reload</li>
                <li>You'll see a notification when capture succeeds</li>
                <li>Capture auto-stops after 15 seconds</li>
              </ul>
            </div>
          </div>
        `;
      }
      
      // Close the popup after a short delay to let the user see the message
      setTimeout(() => {
        window.close();
      }, 2000);
    } catch (error) {
      console.error('🛡️ Error in startCapture:', error);
      this.showToast('Error starting capture mode: ' + error.message);
      this.isCapturing = false;
    }
  }
  
  stopCapture() {
    this.isCapturing = false;
    
    // Update UI
    document.getElementById('stopCaptureBtn').style.display = 'none';
    document.getElementById('startCaptureBtn').style.display = 'inline-flex';
    document.getElementById('captureInstructions').style.display = 'none';
    document.getElementById('captureSelectionSection').style.opacity = '1';
    document.getElementById('captureSelectionSection').style.pointerEvents = 'auto';
    
    // Stop checking for captures
    if (this.captureInterval) {
      clearInterval(this.captureInterval);
    }
    
    // Notify background script
    chrome.runtime.sendMessage({ action: 'stopCaptureMode' });
  }
  
  async checkForCaptures() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = await chrome.runtime.sendMessage({
      action: 'getCapturedParameters',
      tabId: tab.id
    });
    
    if (response && response.captures && response.captures.length > 0) {
      this.capturedParams = response.captures;
      this.displayCapturedParameters();
    }
  }
  
  displayCapturedParameters() {
    console.log('🎯 displayCapturedParameters called with params:', this.capturedParams);
    
    const capturedSection = document.getElementById('capturedParameters');
    const emptyState = document.getElementById('advancedEmpty');
    const tableBody = document.getElementById('captureTableBody');
    const captureCount = document.getElementById('captureCount');
    const captureTable = document.getElementById('captureTable');
    
    console.log('🎯 DOM elements:', {
      capturedSection: !!capturedSection,
      emptyState: !!emptyState,
      tableBody: !!tableBody,
      captureCount: !!captureCount,
      captureTable: !!captureTable
    });
    
    if (!this.capturedParams || this.capturedParams.length === 0) {
      console.log('🎯 No captures - hiding table');
      // No captures yet - hide the table
      if (capturedSection) {
        capturedSection.style.display = 'none';
        capturedSection.style.visibility = 'hidden';
      }
      return;
    }
    
    console.log('🎯 Showing captured parameters table');
    if (capturedSection) {
      capturedSection.style.display = 'block';
      capturedSection.style.visibility = 'visible';
      // Force display with important to override any other styles
      capturedSection.style.setProperty('display', 'block', 'important');
      capturedSection.style.setProperty('visibility', 'visible', 'important');
    }
    if (emptyState) {
      emptyState.style.display = 'none';
      emptyState.style.visibility = 'hidden';
    }
    if (captureCount) captureCount.textContent = `${this.capturedParams.length} capture${this.capturedParams.length > 1 ? 's' : ''}`;
    
    if (!tableBody || !captureTable) return;
    
    // Group captures by type to determine which columns to show
    const captureTypes = new Set(this.capturedParams.map(c => c.captcha_type || 'recaptcha'));
    
    // Update table headers based on capture types
    const thead = captureTable.querySelector('thead tr');
    console.log('🎯 Table header element found:', !!thead);
    console.log('🎯 Capture types:', Array.from(captureTypes));
    
    if (thead) {
      // Always show reCAPTCHA headers since that's what we're capturing
      const headers = `
        <th>Website</th>
        <th>Site Key</th>
        <th>Action</th>
        <th>V2</th>
        <th>V2 Invisible</th>
        <th>V3</th>
        <th>Enterprise</th>
        <th>S</th>
        <th>API Domain</th>
        <th>Actions</th>
      `;
      
      thead.innerHTML = headers;
      console.log('🎯 Headers set to:', headers);
      console.log('🎯 Actual thead HTML after setting:', thead.innerHTML);
    } else {
      console.error('🎯 ERROR: thead tr not found!');
    }
    
    tableBody.innerHTML = '';
    
    this.capturedParams.forEach((capture, index) => {
      const row = document.createElement('tr');
      const boolEmoji = (value) => value ? '✅' : '❌';
      const captchaType = (capture.captcha_type || 'recaptcha').toLowerCase();
      
      // Access parameters from advancedParameters if they exist
      const params = capture.advancedParameters || capture;
      
      let rowContent = `<td title="${params.site_url || params.websiteURL || ''}">${this.truncateUrl(params.site_url || params.websiteURL || '-')}</td>`;
      
      if (captchaType === 'recaptcha') {
        rowContent += `
          <td title="${params.site_key || params.sitekey || ''}">${this.formatSiteKey(params.site_key || params.sitekey || '-')}</td>
          <td>${params.action || '-'}</td>
          <td class="center-cell">${boolEmoji(params.recaptchaV2Normal)}</td>
          <td class="center-cell">${boolEmoji(params.isInvisible || params.is_invisible)}</td>
          <td class="center-cell">${boolEmoji(params.isReCaptchaV3)}</td>
          <td class="center-cell">${boolEmoji(params.is_enterprise)}</td>
          <td class="center-cell">${boolEmoji(params.s === 'yes' || params.is_s_required)}</td>
          <td>${params.apiDomain || '-'}</td>
        `;
      } else if (captchaType === 'hcaptcha') {
        rowContent += `
          <td title="${params.site_key || params.websiteKey || ''}">${this.formatSiteKey(params.site_key || params.websiteKey || '-')}</td>
          <td>${params.type || 'HCaptchaTask'}</td>
          <td class="center-cell">${boolEmoji(params.is_enterprise || params.isEnterprise)}</td>
          <td class="center-cell">${boolEmoji(params.rqdata || params.is_rqdata_required)}</td>
          <td>${params.apiEndpoint || params.endpoint || '-'}</td>
        `;
      } else if (captchaType === 'funcaptcha') {
        rowContent += `
          <td title="${params.websitePublicKey || ''}">${this.formatSiteKey(params.websitePublicKey || '-')}</td>
          <td>${params.funcaptchaApiJSSubdomain || '-'}</td>
          <td class="center-cell">${boolEmoji(params.data || params.hasDataBlob)}</td>
          <td title="${params.bda || ''}">${params.bda ? 'Present' : '-'}</td>
        `;
      } else if (captchaType === 'datadome') {
        rowContent += `
          <td title="${params.captchaUrl || ''}">${this.truncateUrl(params.captchaUrl || '-')}</td>
          <td class="center-cell">${boolEmoji(params.is_datadome_challenge || params.datadome_challenge)}</td>
          <td class="center-cell">${boolEmoji(params.datadome || params.is_datadome)}</td>
        `;
      }
      
      rowContent += `
        <td>
          <button class="export-capture-btn" data-index="${index}" title="Export JSON">
            <svg width="14" height="14" viewBox="0 0 24 24">
              <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" fill="currentColor"/>
            </svg>
          </button>
          <button class="copy-capture-btn" data-index="${index}" title="Copy JSON">
            <svg width="14" height="14" viewBox="0 0 24 24">
              <path d="M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z" fill="currentColor"/>
            </svg>
          </button>
        </td>
      `;
      
      row.innerHTML = rowContent;
      tableBody.appendChild(row);
    });
    
    // Add event listeners for export/copy buttons
    document.querySelectorAll('.export-capture-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.currentTarget.dataset.index);
        this.exportCapture(this.capturedParams[index]);
      });
    });
    
    document.querySelectorAll('.copy-capture-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.currentTarget.dataset.index);
        this.copyCapture(this.capturedParams[index]);
      });
    });
  }
  
  exportCapture(capture) {
    const jsonData = this.generateCaptchaJson(capture);
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `captcha-params-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  
  copyCapture(capture) {
    const jsonData = this.generateCaptchaJson(capture);
    navigator.clipboard.writeText(jsonData).then(() => {
      this.showToast('Capture data copied to clipboard');
    });
  }
  
  generateCaptchaJson(capture) {
    // Access parameters from advancedParameters if they exist
    const params = capture.advancedParameters || capture;
    
    // Generate JSON similar to Capsolver format
    let taskType;
    if (params.isReCaptchaV3) {
      taskType = params.is_enterprise ? 'ReCaptchaV3EnterpriseTaskProxyless' : 'ReCaptchaV3TaskProxyLess';
    } else {
      taskType = params.is_enterprise ? 'ReCaptchaV2EnterpriseTaskProxyLess' : 'ReCaptchaV2TaskProxyLess';
    }
    
    const jsonData = {
      clientKey: 'YOUR_API_KEY',
      task: {
        type: taskType,
        websiteURL: params.site_url,
        websiteKey: params.site_key || params.sitekey
      }
    };
    
    if (params.anchor) {
      jsonData.task.anchor = params.anchor;
    }
    
    if (params.reload) {
      jsonData.task.reload = params.reload;
    }
    
    if (params.apiDomain) {
      jsonData.task.apiDomain = params.apiDomain;
    }
    
    if (params.isReCaptchaV3 && params.action) {
      jsonData.task.pageAction = params.action;
    }
    
    if (params.isInvisible || params.is_invisible) {
      jsonData.task.isInvisible = true;
    }
    
    if (params.s === 'yes' || params.is_s_required) {
      jsonData.task.enterprisePayload = {
        s: 'SOME_ADDITIONAL_TOKEN'
      };
    }
    
    return JSON.stringify(jsonData, null, 2);
  }
  
  async clearCaptures() {
    this.capturedParams = [];
    this.displayCapturedParameters();
    
    // Clear in background script too - need to pass tabId
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.runtime.sendMessage({ 
      action: 'clearCaptures',
      tabId: tab.id 
    });
  }
  
  async loadCapturedParameters() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log('🎯 Loading captured parameters for tab:', tab.id);
    console.log('🎯 Current tab URL:', tab.url);
    
    const response = await chrome.runtime.sendMessage({
      action: 'getCapturedParameters',
      tabId: tab.id
    });
    
    console.log('🎯 getCapturedParameters response:', response);
    console.log('🎯 Response captures array:', response?.captures);
    
    if (response && response.captures && response.captures.length > 0) {
      console.log('🎯 Found captures:', response.captures);
      this.capturedParams = response.captures;
      this.displayCapturedParameters();
    } else {
      console.log('🎯 No captures found');
      this.capturedParams = [];
      // Still call display to update UI (will hide table if no captures)
      this.displayCapturedParameters();
    }
  }

  groupDetectionsByCategory(results) {
    const grouped = {};
    results.forEach(result => {
      const category = result.category || 'Unknown';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(result);
    });
    return grouped;
  }

  createCategorySection(category, detections) {
    const section = document.createElement('div');
    section.className = 'category-section';
    
    const categoryIcons = {
      'Anti-Bot': '🛡️',
      'CAPTCHA': '🧩', 
      'WAF': '🔥',
      'CDN': '☁️'
    };
    
    const icon = categoryIcons[category] || '🔍';
    const isExpanded = detections.length <= 3; // Auto-expand small categories
    
    // Create header
    const header = document.createElement('div');
    header.className = 'category-header';
    header.innerHTML = `
      <div class="category-info">
        <span class="category-icon">${icon}</span>
        <span class="category-name">${category}</span>
        <span class="category-count">${detections.length}</span>
      </div>
      <svg class="expand-icon" width="16" height="16" viewBox="0 0 24 24">
        <path d="M7 10l5 5 5-5z" fill="currentColor"/>
      </svg>
    `;
    
    header.addEventListener('click', () => {
      section.classList.toggle('expanded');
    });
    
    // Create content container
    const content = document.createElement('div');
    content.className = 'category-content';
    
    // Add detection items to content
    detections.forEach(detection => {
      const detectionElement = this.createCompactResultElement(detection);
      content.appendChild(detectionElement);
    });
    
    // Assemble section
    section.appendChild(header);
    section.appendChild(content);
    
    if (isExpanded) {
      section.classList.add('expanded');
    }
    
    return section;
  }

  createCompactResultElement(result) {
    const div = document.createElement('div');
    div.className = 'detection-item';
    
    const confidenceClass = result.confidence >= 80 ? 'high' : 
                           result.confidence >= 60 ? 'medium' : 'low';
    
    const matchCount = result.matches ? result.matches.length : 0;
    const topMatches = result.matches ? result.matches.slice(0, 2) : [];
    
    // Create header
    const detectionHeader = document.createElement('div');
    detectionHeader.className = 'detection-header';
    detectionHeader.innerHTML = `
      <div class="detection-info">
        <div class="detection-name">${result.name}</div>
        <div class="detection-meta">
          <div class="confidence-display">
            ${this.createConfidenceIndicator(result.confidence, confidenceClass)}
            <span class="confidence-text">${result.confidence}%</span>
          </div>
        </div>
      </div>
      <svg class="expand-icon" width="14" height="14" viewBox="0 0 24 24">
        <path d="M7 10l5 5 5-5z" fill="currentColor"/>
      </svg>
    `;
    
    // Add click handler for expansion
    detectionHeader.addEventListener('click', () => {
      div.classList.toggle('expanded');
    });
    
    // Create preview with detailed match indicators
    const preview = document.createElement('div');
    preview.className = 'detection-preview';
    
    // Category badge should always be gray
    const categoryBadge = `<span class="category-badge">${result.category}</span>`;
    
    // Group matches by type
    const matchesByType = {};
    (result.matches || []).forEach(match => {
      if (!matchesByType[match.type]) {
        matchesByType[match.type] = [];
      }
      matchesByType[match.type].push(match);
    });
    
    // Create one tag per type (max 3 types shown) - filter out global
    const matchTypes = Object.keys(matchesByType).filter(type => type !== 'global');
    const matchTags = matchTypes.slice(0, 3).map(type => {
      const typeClass = this.getMatchTypeClass(type);
      const typeName = this.getMatchTypeDisplayName(type);
      if (!typeName) return ''; // Skip null type names
      return `<span class="match-tag ${typeClass}">${typeName}</span>`;
    }).filter(tag => tag).join('');
    
    const moreTypes = matchTypes.length > 3 ? `<span class="more-matches">+${matchTypes.length - 3} more</span>` : '';
    
    preview.innerHTML = `
      ${categoryBadge}
      <div class="match-tags">${matchTags}${moreTypes}</div>
    `;
    
    // Create details section
    const details = document.createElement('div');
    details.className = 'detection-details';
    
    // Create matches list
    const matchesList = document.createElement('div');
    matchesList.className = 'result-matches';
    
    result.matches.forEach(match => {
      const matchItem = document.createElement('div');
      matchItem.className = 'match-item';
      matchItem.innerHTML = `
        <span class="match-details match-type-${match.type}">${this.formatMatchDetails(match)}</span>
      `;
      matchesList.appendChild(matchItem);
    });
    
    // Create actions
    const actions = document.createElement('div');
    actions.className = 'detection-actions';
    
    const copyBtn = document.createElement('button');
    copyBtn.className = 'action-btn-small';
    copyBtn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24">
        <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" fill="currentColor"/>
      </svg>
      Copy
    `;
    
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.copyDetection(result);
    });
    
    actions.appendChild(copyBtn);
    details.appendChild(matchesList);
    details.appendChild(actions);
    
    // Assemble the element
    div.appendChild(detectionHeader);
    div.appendChild(preview);
    div.appendChild(details);
    
    return div;
  }

  createResultElement(result) {
    // This method is now only used for backward compatibility
    return this.createCompactResultElement(result);
  }

  getMatchTypeDisplayName(type) {
    const typeNames = {
      'cookie': 'Cookies',
      'header': 'Headers',
      'url': 'URLs',
      'script': 'Scripts',
      'dom': 'DOM Elements'
    };
    // Filter out global type completely
    if (type === 'global') return null;
    return typeNames[type] || null;
  }

  getMatchCategoryAndDetails(match) {
    let category = '';
    let details = '';
    
    switch (match.type) {
      case 'cookie':
        category = 'Cookie';
        details = `${match.name}=${match.value || '*'}`;
        break;
      case 'header':
        category = 'Header';
        details = `${match.name}: ${match.value || '*'}`;
        break;
      case 'url':
        category = 'URL';
        details = match.url || match.pattern;
        break;
      case 'script':
        category = 'Script';
        details = match.content;
        break;
      case 'dom':
        category = 'DOM Element';
        details = match.selector + (match.count ? ` (${match.count} found)` : '');
        break;
      default:
        // Format unknown types more nicely
        category = match.type || 'Unknown';
        const cleanMatch = { ...match };
        delete cleanMatch.type;
        const pairs = Object.entries(cleanMatch)
          .filter(([_, value]) => value !== null && value !== undefined)
          .map(([key, value]) => `${key}: ${value}`);
        details = pairs.join(', ') || JSON.stringify(match);
    }
    
    return { category, details };
  }

  formatMatchDetails(match) {
    const { category, details } = this.getMatchCategoryAndDetails(match);
    return `[${category}] ${details}`;
  }

  copyDetection(detection) {
    const copyData = {
      name: detection.name,
      category: detection.category,
      confidence: detection.confidence,
      matches: detection.matches.map(match => {
        // Create a formatted object for each match
        const formattedMatch = {
          type: this.getMatchTypeDisplayName(match.type),
          details: this.formatMatchDetails(match)
        };
        // Add any additional fields if present
        if (match.confidence) formattedMatch.confidence = match.confidence;
        return formattedMatch;
      })
    };
    
    const copyText = JSON.stringify(copyData, null, 2);
    
    navigator.clipboard.writeText(copyText).then(() => {
      this.showToast('Detection data copied to clipboard!');
    }).catch(err => {
      console.error('Failed to copy:', err);
      this.showToast('Failed to copy data', 'error');
    });
  }

  showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.classList.add('show');
    }, 100);
    
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        document.body.removeChild(toast);
      }, 300);
    }, 2000);
  }

  updateTabInfo(url) {
    const tabInfo = document.getElementById('currentTabInfo');
    const tabUrl = document.getElementById('currentTabUrl');
    const tabFavicon = document.getElementById('currentTabFavicon');
    
    if (url && url !== 'about:blank') {
      try {
        const urlObj = new URL(url);
        const displayUrl = urlObj.hostname + urlObj.pathname;
        tabUrl.textContent = displayUrl;
        tabInfo.style.display = 'flex';
        
        // Set favicon using Google's favicon service
        const faviconUrl = `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=16`;
        tabFavicon.src = faviconUrl;
        tabFavicon.onerror = function() {
          // Hide favicon if it fails to load
          this.src = '';
        };
      } catch (e) {
        tabInfo.style.display = 'none';
      }
    } else {
      tabInfo.style.display = 'none';
    }
  }


  // History Management
  async loadHistory() {
    try {
      const result = await chrome.storage.local.get(['detectionHistory']);
      const history = result.detectionHistory || [];
      
      const historyList = document.getElementById('historyList');
      const historyEmpty = document.getElementById('historyEmpty');
      const historyPagination = document.getElementById('historyPagination');
      
      if (history.length === 0) {
        historyList.innerHTML = '';
        historyEmpty.style.display = 'block';
        if (historyPagination) historyPagination.style.display = 'none';
        return;
      }
      
      historyEmpty.style.display = 'none';
      
      // Sort by timestamp, most recent first and store both arrays
      this.allHistory = [...history].sort((a, b) => b.timestamp - a.timestamp);
      this.filteredHistory = [...this.allHistory];
      
      // Reset to first page
      this.historyPage = 1;
      
      // Display the first page
      this.displayHistoryPage();
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  }

  createHistoryElement(item, index) {
    const div = document.createElement('div');
    div.className = 'history-item';
    
    const url = new URL(item.url);
    const timeAgo = this.timeAgo(item.timestamp);
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=16`;
    
    div.innerHTML = `
      <div class="history-item-header">
        <img src="${faviconUrl}" alt="${url.hostname}" class="history-favicon" width="16" height="16" onerror="this.style.display='none'">
        <div class="history-url">${url.hostname}${url.pathname}</div>
        <div class="history-actions">
          <button class="copy-history-btn copy-btn" title="Copy detection data">
            <svg width="14" height="14" viewBox="0 0 24 24">
              <path d="M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z" fill="currentColor"/>
            </svg>
          </button>
          <button class="delete-history-btn" title="Delete this entry">
            <svg width="14" height="14" viewBox="0 0 24 24">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="currentColor"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="history-meta">
        <div class="history-detections">
          ${this.renderHistoryDetections(item.detections)}
        </div>
        <span>${timeAgo}</span>
      </div>
    `;
    
    // Add click handler for the main area
    const clickableArea = div.querySelector('.history-url');
    clickableArea.addEventListener('click', () => {
      chrome.tabs.create({ url: item.url });
    });
    
    // Add copy handler
    const copyBtn = div.querySelector('.copy-history-btn');
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.copyHistoryItem(item);
    });
    
    // Add delete handler
    const deleteBtn = div.querySelector('.delete-history-btn');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.deleteHistoryItem(item.url);
    });
    
    return div;
  }

  renderHistoryDetections(detections) {
    const MAX_VISIBLE_TAGS = 3; // Maximum number of tags to show before adding "+X more"
    let html = '';
    
    // Process first MAX_VISIBLE_TAGS detections
    const visibleDetections = detections.slice(0, MAX_VISIBLE_TAGS);
    visibleDetections.forEach(detection => {
      // Handle both old format (string) and new format (object)
      if (typeof detection === 'string') {
        // Old format - just category
        const badgeClass = this.getBadgeClass(detection);
        html += `<span class="history-detection-badge ${badgeClass}">${detection}</span>`;
      } else {
        // New format - show just the name with custom color if available
        const name = detection.name || 'Unknown';
        const category = detection.category || 'Unknown';
        const badgeClass = this.getBadgeClass(category);
        let badgeStyle = '';
        if (detection.color) {
          badgeStyle = `style="background: ${detection.color} !important; color: white !important;"`;
        }
        html += `<span class="history-detection-badge ${badgeClass}" ${badgeStyle}>${name}</span>`;
      }
    });
    
    // Add "+X more" badge if there are more detections
    if (detections.length > MAX_VISIBLE_TAGS) {
      const remaining = detections.length - MAX_VISIBLE_TAGS;
      html += `<span class="history-detection-badge badge-more" title="${detections.slice(MAX_VISIBLE_TAGS).map(d => 
        typeof d === 'string' ? d : d.name
      ).join(', ')}">+${remaining} more</span>`;
    }
    
    return html;
  }

  getBadgeClass(category) {
    const categoryMap = {
      'CAPTCHA': 'badge-captcha',
      'Anti-Bot': 'badge-antibot',
      'WAF': 'badge-waf',
      'CDN': 'badge-cdn',
      'Fingerprinting': 'badge-fingerprinting'
    };
    return categoryMap[category] || 'badge-default';
  }

  copyHistoryItem(item) {
    const copyData = {
      url: item.url,
      timestamp: new Date(item.timestamp).toISOString(),
      detections: item.detections
    };
    
    navigator.clipboard.writeText(JSON.stringify(copyData, null, 2)).then(() => {
      this.showToast('Detection data copied to clipboard');
    }).catch(err => {
      console.error('Failed to copy:', err);
      this.showToast('Failed to copy data', 'error');
    });
  }

  async deleteHistoryItem(url) {
    const confirmed = await this.showConfirmDialog(
      'Delete Entry',
      'Are you sure you want to delete this history entry?'
    );
    
    if (confirmed) {
      try {
        const result = await chrome.storage.local.get(['detectionHistory']);
        let history = result.detectionHistory || [];
        
        // Filter out the item with matching URL
        history = history.filter(item => item.url !== url);
        
        // Save updated history
        await chrome.storage.local.set({ detectionHistory: history });
        
        // Reload the history display
        this.loadHistory();
        this.showToast('History entry deleted');
      } catch (error) {
        console.error('Failed to delete history item:', error);
        this.showToast('Failed to delete entry', 'error');
      }
    }
  }

  showConfirmDialog(title, message) {
    return new Promise((resolve) => {
      const modal = document.getElementById('confirmModal');
      const titleEl = document.getElementById('confirmTitle');
      const messageEl = document.getElementById('confirmMessage');
      const cancelBtn = document.getElementById('confirmCancel');
      const okBtn = document.getElementById('confirmOk');
      
      titleEl.textContent = title;
      messageEl.textContent = message;
      modal.style.display = 'flex';
      
      const handleCancel = () => {
        modal.style.display = 'none';
        resolve(false);
      };
      
      const handleOk = () => {
        modal.style.display = 'none';
        resolve(true);
      };
      
      cancelBtn.onclick = handleCancel;
      okBtn.onclick = handleOk;
      
      // Close on Escape key
      const handleEscape = (e) => {
        if (e.key === 'Escape') {
          handleCancel();
          document.removeEventListener('keydown', handleEscape);
        }
      };
      document.addEventListener('keydown', handleEscape);
    });
  }

  // Blacklist Management
  async loadBlacklistUI() {
    const container = document.getElementById('blacklistItems');
    const paginationContainer = document.getElementById('blacklistPagination');
    if (!container) {
      return;
    }
    
    // Reload blacklist from storage to ensure it's up to date
    const result = await chrome.storage.sync.get(['blacklist']);
    this.blacklist = result.blacklist || [];
    
    container.innerHTML = '';
    if (paginationContainer) {
      paginationContainer.innerHTML = '';
    }
    
    if (this.blacklist.length === 0) {
      container.innerHTML = '<div class="empty-blacklist" style="color: var(--text-muted); padding: 10px; text-align: center;">No domains in blacklist</div>';
      return;
    }
    
    // Calculate pagination
    const totalItems = this.blacklist.length;
    const totalPages = Math.ceil(totalItems / this.blacklistItemsPerPage);
    const startIndex = (this.blacklistPage - 1) * this.blacklistItemsPerPage;
    const endIndex = Math.min(startIndex + this.blacklistItemsPerPage, totalItems);
    
    // Display items for current page
    for (let i = startIndex; i < endIndex; i++) {
      const domain = this.blacklist[i];
      const item = document.createElement('div');
      item.className = 'blacklist-item';
      item.innerHTML = `
        <span class="blacklist-domain">${domain}</span>
        <button class="remove-blacklist-btn" data-index="${i}">
          <svg width="12" height="12" viewBox="0 0 24 24">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor"/>
          </svg>
        </button>
      `;
      
      item.querySelector('.remove-blacklist-btn').addEventListener('click', () => {
        this.removeBlacklistItem(i);
      });
      
      container.appendChild(item);
    }
    
    // Add pagination controls if needed
    if (totalPages > 1 && paginationContainer) {
      paginationContainer.innerHTML = `
        <button class="page-btn ${this.blacklistPage === 1 ? 'disabled' : ''}" id="prevBlacklistPage" ${this.blacklistPage === 1 ? 'disabled' : ''}>
          <svg width="14" height="14" viewBox="0 0 24 24">
            <path d="M15.41,16.58L10.83,12L15.41,7.41L14,6L8,12L14,18L15.41,16.58Z" fill="currentColor"/>
          </svg>
        </button>
        <span class="page-info">
          Page ${this.blacklistPage} of ${totalPages} (${totalItems} items)
        </span>
        <button class="page-btn ${this.blacklistPage === totalPages ? 'disabled' : ''}" id="nextBlacklistPage" ${this.blacklistPage === totalPages ? 'disabled' : ''}>
          <svg width="14" height="14" viewBox="0 0 24 24">
            <path d="M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z" fill="currentColor"/>
          </svg>
        </button>
      `;
      
      // Add event listeners for pagination
      const prevBtn = paginationContainer.querySelector('#prevBlacklistPage');
      const nextBtn = paginationContainer.querySelector('#nextBlacklistPage');
      
      if (prevBtn && this.blacklistPage > 1) {
        prevBtn.addEventListener('click', () => {
          this.blacklistPage--;
          this.loadBlacklistUI();
        });
      }
      
      if (nextBtn && this.blacklistPage < totalPages) {
        nextBtn.addEventListener('click', () => {
          this.blacklistPage++;
          this.loadBlacklistUI();
        });
      }
    }
  }

  async addBlacklistItem() {
    const input = document.getElementById('blacklistInput');
    const domain = input.value.trim().toLowerCase();
    
    if (!domain) return;
    
    // Validate domain pattern
    const domainPattern = /^(\*\.)?[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/i;
    if (!domainPattern.test(domain) && domain !== 'localhost' && !domain.includes(':')) {
      alert('Please enter a valid domain (e.g., example.com or *.example.com)');
      return;
    }
    
    // Check if already exists
    if (this.blacklist.includes(domain)) {
      alert('This domain is already in the blacklist');
      return;
    }
    
    // Add to blacklist
    this.blacklist.push(domain);
    
    // Save to storage
    await chrome.storage.sync.set({ blacklist: this.blacklist });
    
    // Clear input and reload UI
    input.value = '';
    this.loadBlacklistUI();
    
    // Notify background script
    chrome.runtime.sendMessage({ action: 'updateBlacklist', blacklist: this.blacklist });
  }

  async addCurrentPageToBlacklist() {
    // Get the current tab's URL
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) return;
    
    try {
      const url = new URL(tab.url);
      const domain = url.hostname.replace('www.', '');
      
      // Check if it's a valid URL to blacklist
      if (!domain || domain === 'localhost' || 
          url.protocol === 'chrome:' || 
          url.protocol === 'chrome-extension:' ||
          url.protocol === 'about:') {
        this.showToast('Cannot blacklist this type of page');
        return;
      }
      
      // Check if already exists
      if (this.blacklist.includes(domain)) {
        this.showToast('This domain is already blacklisted');
        return;
      }
      
      // Add to blacklist
      this.blacklist.push(domain);
      
      // Save to storage
      await chrome.storage.sync.set({ blacklist: this.blacklist });
      
      // Reload UI
      this.loadBlacklistUI();
      
      // Notify background script
      chrome.runtime.sendMessage({ action: 'updateBlacklist', blacklist: this.blacklist });
      
      // Show success message
      this.showToast(`Added ${domain} to blacklist`);
    } catch (error) {
      console.error('Error adding current page to blacklist:', error);
      this.showToast('Error adding page to blacklist');
    }
  }
  
  async removeBlacklistItem(index) {
    this.blacklist.splice(index, 1);
    await chrome.storage.sync.set({ blacklist: this.blacklist });
    this.loadBlacklistUI();
    
    // Notify background script
    chrome.runtime.sendMessage({ action: 'updateBlacklist', blacklist: this.blacklist });
  }
  
  async removeCurrentPageFromBlacklist() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) return;
    
    try {
      const url = new URL(tab.url);
      const domain = url.hostname.replace('www.', '');
      
      // Load current blacklist
      const result = await chrome.storage.sync.get(['blacklist']);
      this.blacklist = result.blacklist || [];
      
      // Remove domain from blacklist
      const index = this.blacklist.indexOf(domain);
      if (index > -1) {
        this.blacklist.splice(index, 1);
        await chrome.storage.sync.set({ blacklist: this.blacklist });
        
        // Notify background script
        chrome.runtime.sendMessage({ action: 'updateBlacklist', blacklist: this.blacklist });
        
        // Reload the page analysis
        this.showToast(`Removed ${domain} from exclusion list`);
        await this.loadResults();
      }
    } catch (error) {
      console.error('Error removing from blacklist:', error);
      this.showToast('Error removing from exclusion list', 'error');
    }
  }

  getMatchTypeClass(type) {
    const typeMap = {
      'cookie': 'match-type-cookie',
      'header': 'match-type-header',
      'script': 'match-type-script',
      'dom': 'match-type-dom',
      'url': 'match-type-url'
    };
    return typeMap[type] || 'match-type-default';
  }

  getMatchDisplayDetails(match) {
    switch (match.type) {
      case 'cookie':
        return `${match.name} (Cookie)`;
      case 'header':
        return `${match.name} (Header)`;
      case 'script':
        return match.content ? `${match.content.substring(0, 20)}... (Script)` : 'Script';
      case 'url':
        return 'URL Pattern';
      case 'dom':
        return match.selector ? `${match.selector} (DOM)` : 'DOM Element';
      default:
        return match.type;
    }
  }

  createConfidenceIndicator(confidence, confidenceClass) {
    const strokeDasharray = 2 * Math.PI * 8; // circumference for radius 8
    const strokeDashoffset = strokeDasharray - (confidence / 100) * strokeDasharray;
    
    return `
      <div class="confidence-indicator">
        <svg width="20" height="20" viewBox="0 0 20 20" class="confidence-circle">
          <circle
            cx="10" cy="10" r="8"
            stroke="var(--bg-tertiary)"
            stroke-width="2"
            fill="none"
          />
          <circle
            cx="10" cy="10" r="8"
            stroke="var(--confidence-${confidenceClass})"
            stroke-width="2"
            fill="none"
            stroke-dasharray="${strokeDasharray}"
            stroke-dashoffset="${strokeDashoffset}"
            stroke-linecap="round"
            transform="rotate(-90 10 10)"
            class="confidence-progress"
          />
        </svg>
      </div>
    `;
  }

  async getProviderIcon(iconName) {
    if (!iconName) return chrome.runtime.getURL('icons/providers/custom.png');
    
    // Check if it's a custom uploaded icon
    if (iconName.startsWith('custom_icon_')) {
      const result = await chrome.storage.local.get(iconName);
      if (result[iconName]) {
        return result[iconName]; // Return base64 data
      }
    }
    
    return chrome.runtime.getURL(`icons/providers/${iconName}`);
  }
  
  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  timeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  }

  async addToHistory(url, results) {
    if (!url || results.length === 0) return;
    
    try {
      const result = await chrome.storage.local.get(['detectionHistory']);
      let history = result.detectionHistory || [];
      
      // Remove any existing entry for this URL to always update with latest
      history = history.filter(item => item.url !== url);
      
      // Add new entry
      const newEntry = {
        url,
        timestamp: Date.now(),
        detections: results.map(r => ({ name: r.name, category: r.category, confidence: r.confidence, color: r.color }))
      };
      
      history.unshift(newEntry);
      
      // Limit history size
      if (history.length > this.historyLimit) {
        history = history.slice(0, this.historyLimit);
      }
      
      await chrome.storage.local.set({ detectionHistory: history });
      
      // Log to API if enabled
      if (this.apiEnabled && this.apiUrl) {
        this.logToApi(url, results);
      }
    } catch (error) {
      console.error('Failed to add to history:', error);
    }
  }

  async updateHistoryForUrl(url) {
    try {
      const result = await chrome.storage.local.get(['detectionHistory']);
      let history = result.detectionHistory || [];
      
      // Remove the entry for this URL to force re-detection
      history = history.filter(item => item.url !== url);
      
      await chrome.storage.local.set({ detectionHistory: history });
      
      // Reload history display if on history tab
      if (this.currentTab === 'history') {
        this.loadHistory();
      }
    } catch (error) {
      console.error('Failed to update history for URL:', error);
    }
  }

  async clearHistory() {
    if (confirm('Are you sure you want to clear all detection history?')) {
      await chrome.storage.local.remove(['detectionHistory']);
      this.loadHistory();
    }
  }

  async exportRules() {
    try {
      // Get all rules (base + edited + custom) from the merged data
      const exportData = [];
      
      // Export all rules from the allRules array which includes base detectors and custom rules
      for (const rule of this.allRules) {
        const exportRule = {
          name: rule.name,
          category: rule.category,
          icon: rule.icon || 'custom.png',
          color: rule.color,
          enabled: rule.enabled !== false,
          lastUpdated: rule.lastUpdated || new Date().toISOString(),
          cookies: rule.cookies || [],
          headers: rule.headers || [],
          urls: rule.urls || [],
          scripts: rule.scripts || [],
          dom: rule.dom || []
        };
        
        // Add additional fields if they exist
        if (rule.overridesDefault) {
          exportRule.overridesDefault = rule.overridesDefault;
        }
        if (rule.isDefault) {
          exportRule.isDefault = rule.isDefault;
        }
        if (rule.id) {
          exportRule.id = rule.id;
        }
        
        exportData.push(exportRule);
      }
      
      // Create JSON string with proper formatting
      const jsonStr = JSON.stringify(exportData, null, 2);
      
      // Create blob and download
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shieldeye_rules_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      this.showToast(`Exported ${exportData.length} rules successfully`);
    } catch (error) {
      console.error('Failed to export rules:', error);
      this.showToast('Failed to export rules', 'error');
    }
  }

  async clearAllRules() {
    try {
      // Show custom confirmation modal
      const confirmed = await this.showConfirmDialog(
        'Clear All Rules',
        'Are you sure you want to clear ALL rules? This will reset all custom rules and edited base detectors. This action cannot be undone.'
      );
      
      if (!confirmed) {
        return;
      }
      
      // Clear custom rules from storage
      await chrome.storage.sync.set({ customRules: [] });
      
      // Send message to background to reload detectors (will reload base detectors without any custom overrides)
      await chrome.runtime.sendMessage({ action: 'reloadCustomRules' });
      
      // Reload the rules display
      this.allRules = [];
      this.filteredRules = [];
      this.rulesPage = 1;
      await this.loadCustomRules();
      
      // Show success notification
      this.showNotification('All rules cleared successfully', 'success');
      
    } catch (error) {
      console.error('Failed to clear rules:', error);
      this.showNotification('Failed to clear rules', 'error');
    }
  }

  async toggleRuleEnabled(rule, index) {
    try {
      // Toggle the enabled state
      rule.enabled = rule.enabled === false ? true : false;
      
      // If it's a base detector (index === -1), we need to save it as an override
      if (index === -1) {
        // Get current custom rules - use local storage for consistency
        const result = await chrome.storage.local.get(['customRules']);
        const customRules = result.customRules || [];
        
        // Check if we already have an override for this base detector
        const existingOverrideIndex = customRules.findIndex(r => r.overridesDefault === rule.id);
        
        if (existingOverrideIndex !== -1) {
          // Update existing override
          customRules[existingOverrideIndex].enabled = rule.enabled;
        } else {
          // Create new override for base detector
          const override = {
            ...rule,
            overridesDefault: rule.id,
            enabled: rule.enabled
          };
          customRules.push(override);
        }
        
        await chrome.storage.local.set({ customRules });
      } else {
        // It's a custom rule, update it directly
        this.customRules[index].enabled = rule.enabled;
        await chrome.storage.local.set({ customRules: this.customRules });
      }
      
      // Send message to background to reload rules
      await chrome.runtime.sendMessage({ action: 'reloadCustomRules' });
      
      // Also send message to content script to re-analyze with new rules
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]) {
          await chrome.tabs.sendMessage(tabs[0].id, { action: 'reloadCustomRules' });
        }
      } catch (err) {
        // Content script might not be loaded, ignore
      }
      
      // Update UI with smooth transition
      const ruleElement = document.querySelector(`[data-rule-name="${rule.name}"]`);
      if (ruleElement) {
        // Add transition class
        ruleElement.style.transition = 'opacity 0.3s ease';
        ruleElement.style.opacity = '0.5';
        
        setTimeout(async () => {
          // Update UI
          await this.loadCustomRules();
          
          // Show notification
          const status = rule.enabled === false ? 'disabled' : 'enabled';
          this.showToast(`Rule "${rule.name}" ${status}`, 'success');
        }, 300);
      } else {
        // Fallback if element not found
        await this.loadCustomRules();
        const status = rule.enabled === false ? 'disabled' : 'enabled';
        this.showToast(`Rule "${rule.name}" ${status}`, 'success');
      }
      
    } catch (error) {
      console.error('Failed to toggle rule:', error);
      this.showToast('Failed to toggle rule', 'error');
    }
  }

  async importRules(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const importData = JSON.parse(text);
      
      let rulesToImport;
      
      // Handle both direct array format and wrapped format
      if (Array.isArray(importData)) {
        rulesToImport = importData;
      } else if (importData.data && Array.isArray(importData.data)) {
        rulesToImport = importData.data;
      } else {
        this.showToast('Invalid rules file format', 'error');
        return;
      }
      
      // Validate rules structure
      const validRules = rulesToImport.filter(rule => 
        rule.name && 
        rule.category && 
        (rule.cookies || rule.headers || rule.urls || rule.scripts)
      );
      
      if (validRules.length === 0) {
        this.showToast('No valid rules found in file', 'error');
        return;
      }
      
      // Get existing rules
      const result = await chrome.storage.local.get(['customRules']);
      const existingRules = result.customRules || [];
      
      // Ask user about merge strategy
      const shouldMerge = confirm(
        `Found ${validRules.length} rules to import.\n\n` +
        `OK: Merge with existing ${existingRules.length} rules\n` +
        `Cancel: Replace all existing rules`
      );
      
      let finalRules;
      if (shouldMerge) {
        // Merge - avoid duplicates based on name
        const existingNames = new Set(existingRules.map(r => r.name));
        const newRules = validRules.filter(r => !existingNames.has(r.name));
        finalRules = [...existingRules, ...newRules];
        
        const skipped = validRules.length - newRules.length;
        if (skipped > 0) {
          this.showToast(`Imported ${newRules.length} new rules (${skipped} duplicates skipped)`);
        } else {
          this.showToast(`Imported ${newRules.length} new rules`);
        }
      } else {
        // Replace all
        finalRules = validRules;
        this.showToast(`Replaced all rules with ${validRules.length} imported rules`);
      }
      
      // Save rules
      await chrome.storage.local.set({ customRules: finalRules });
      
      // Reload rules display
      this.loadCustomRules();
      
      // Clear file input
      event.target.value = '';
      
    } catch (error) {
      console.error('Failed to import rules:', error);
      this.showToast('Failed to import rules. Please check the file format.', 'error');
      event.target.value = '';
    }
  }

  async logToApi(url, results) {
    try {
      const data = {
        url,
        timestamp: Date.now(),
        detections: results.map(r => ({
          name: r.name,
          category: r.category,
          confidence: r.confidence
        }))
      };
      
      await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
      });
    } catch (error) {
      console.error('Failed to log to API:', error);
    }
  }

  // Load base detectors from background.js for UI display
  async loadBaseDetectorsFromBackground() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getDetectors' });
      if (response && response.success && response.detectors) {
        this.baseDetectors = [];
        
        // Check if detectors exist
        const detectors = response.detectors.detectors || {};
        if (Object.keys(detectors).length === 0) {
          console.warn('No detectors found in response');
        }
        
        for (const [detectorId, detector] of Object.entries(detectors)) {
          // Skip if detector doesn't have required properties
          if (!detector.name) continue;
          
          // Get unique detector color from JSON file or fallback to category color
          const detectorColor = detector.color || this.getCategoryColor(detector.category) || '#6b7280';
          
          const rule = {
            id: detectorId,
            name: detector.name,
            category: detector.category || 'Unknown',
            icon: detector.icon || 'custom.png',
            color: detectorColor,
            enabled: detector.enabled !== false,
            isDefault: true, // Mark as default for UI purposes only
            lastUpdated: detector.lastUpdated || detector.version || new Date().toISOString(),
            cookies: detector.detection?.cookies || [],
            headers: detector.detection?.headers || [],
            urls: detector.detection?.urls || [],
            scripts: detector.detection?.scripts || [],
            dom: detector.detection?.dom || [],
            patterns: detector.detection?.patterns || {},
            detection: detector.detection || {}
          };
          this.baseDetectors.push(rule);
        }
        
        // Successfully loaded base detectors
      } else {
        console.warn('Failed to get detectors from background.js:', response);
        this.baseDetectors = [];
      }
    } catch (error) {
      console.error('Error loading base detectors from background:', error);
      this.baseDetectors = [];
    }
  }

  // Custom Rules Management
  async loadCustomRules() {
    try {
      const result = await chrome.storage.local.get(['customRules', 'rulesVersion']);
      this.customRules = result.customRules || [];
      
      // Ensure all custom rules have proper colors
      this.customRules = this.customRules.map(rule => {
        if (!rule.color) {
          // Use category color as fallback - colors are now in detector JSON files
          rule.color = this.getCategoryColor(rule.category) || '#6b7280';
        }
        return rule;
      });
      
      // Force reset to remove old custom rules created from base detectors
      const CURRENT_VERSION = 6; // Increment this to clear old conflicting custom rules
      const needsReset = result.rulesVersion !== CURRENT_VERSION;
      
      if (needsReset) {
        // Clearing old custom rules that conflict with base detectors
        // Only keep actual user-created custom rules
        this.customRules = (result.customRules || []).filter(rule => !rule.isDefault);
        
        // Get base detectors from background.js for UI display
        await this.loadBaseDetectorsFromBackground();
        
        await chrome.storage.local.set({ 
          customRules: this.customRules,
          rulesVersion: CURRENT_VERSION 
        });
      } else {
        // No reset needed, but still load base detectors for UI
        await this.loadBaseDetectorsFromBackground();
      }
      
      // Always ensure base detectors are loaded
      if (!this.baseDetectors.length) {
        await this.loadBaseDetectorsFromBackground();
      }
      
      // Filter out base detectors that have custom overrides
      const customOverrides = new Set(
        this.customRules
          .filter(rule => rule.overridesDefault)
          .map(rule => rule.overridesDefault)
      );
      
      const filteredBaseDetectors = this.baseDetectors.filter(baseRule => {
        const ruleId = baseRule.id || baseRule.name;
        return !customOverrides.has(ruleId);
      });
      
      // Store all rules and initialize filtered rules, sorted by lastUpdated (newest first)
      const allUnsortedRules = [...filteredBaseDetectors, ...this.customRules];
      this.allRules = allUnsortedRules.sort((a, b) => {
        const dateA = new Date(a.lastUpdated || a.version || '1970-01-01').getTime();
        const dateB = new Date(b.lastUpdated || b.version || '1970-01-01').getTime();
        return dateB - dateA; // Descending order (newest first)
      });
      this.filteredRules = [...this.allRules];
      
      // Reset to page 1
      this.rulesPage = 1;
      
      // Display the first page
      this.displayRulesPage();
    } catch (error) {
      console.error('Failed to load custom rules:', error);
    }
  }

  async displayRulesPage() {
    const rulesList = document.getElementById('customRulesList');
    const rulesEmpty = document.getElementById('rulesEmpty');
    const rulesPagination = document.getElementById('rulesPagination');
    const rulesPaginationInfo = document.getElementById('rulesPaginationInfo');
    const rulesPageNumbers = document.getElementById('rulesPageNumbers');
    const rulesPrevBtn = document.getElementById('rulesPrevBtn');
    const rulesNextBtn = document.getElementById('rulesNextBtn');

    if (!rulesList || !this.filteredRules) return;

    const totalItems = this.filteredRules.length;
    const totalPages = Math.ceil(totalItems / this.rulesItemsPerPage);
    const startIndex = (this.rulesPage - 1) * this.rulesItemsPerPage;
    const endIndex = Math.min(startIndex + this.rulesItemsPerPage, totalItems);

    // Clear current display
    rulesList.innerHTML = '';

    if (totalItems === 0) {
      rulesEmpty.style.display = 'block';
      rulesPagination.style.display = 'none';
      return;
    }

    rulesEmpty.style.display = 'none';

    // Show items for current page
    const elements = [];
    for (let i = startIndex; i < endIndex; i++) {
      const rule = this.filteredRules[i];
      
      // Calculate the correct index for editing
      let originalIndex;
      if (rule.isDefault) {
        // Base detectors use -1 to indicate they're not in customRules
        originalIndex = -1;
      } else {
        // Custom rules use their actual index in customRules
        originalIndex = this.customRules.indexOf(rule);
      }
      
      elements.push(this.createCustomRuleElement(rule, originalIndex));
    }
    
    // Wait for all elements to be created
    const createdElements = await Promise.all(elements);
    createdElements.forEach(element => rulesList.appendChild(element));

    // Update pagination visibility and info
    if (totalItems > this.rulesItemsPerPage) {
      rulesPagination.style.display = 'flex';
      
      // Update info text
      if (rulesPaginationInfo) {
        const showing = totalItems === 0 ? 0 : startIndex + 1;
        rulesPaginationInfo.textContent = `Showing ${showing}-${endIndex} of ${totalItems}`;
      }

      // Update page numbers
      if (rulesPageNumbers) {
        rulesPageNumbers.innerHTML = this.generatePageNumbers(this.rulesPage, totalPages);
      }

      // Update button states
      if (rulesPrevBtn) {
        rulesPrevBtn.disabled = this.rulesPage === 1;
      }
      if (rulesNextBtn) {
        rulesNextBtn.disabled = this.rulesPage === totalPages;
      }
    } else {
      rulesPagination.style.display = 'none';
    }
  }

  async loadAdvancedResults() {
    return; // Disabled - Advanced section removed
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs.length === 0) {
        return;
      }

      // Load detection results to check if captchas are present
      // This is needed to show the capture UI, but we won't display DOM parameters
      const response = await chrome.runtime.sendMessage({
        action: 'getTabResults',
        tabId: tabs[0].id
      });
      
      if (response && response.results && Array.isArray(response.results)) {
        // Pass the results to updateAdvancedSection which will:
        // 1. Check if captchas are detected
        // 2. Show the capture UI if captchas are found
        // 3. NOT display automatic DOM-extracted parameters
        this.updateAdvancedSection(response.results);
      } else {
        this.updateAdvancedSection([]);
      }
    } catch (error) {
      console.error('🛡️ Advanced: Failed to load results:', error);
      this.showAdvancedEmptyState();
    }
  }

  boolToEmoji(value) {
    return value ? '✅' : '❌';
  }

  formatSiteKey(key) {
    if (!key) return '-';
    if (key.length > 20) {
      return key.substring(0, 8) + '...' + key.substring(key.length - 8);
    }
    return key;
  }
  
  truncateUrl(url) {
    if (!url || url === '-') return '-';
    if (url.length > 40) {
      return url.substring(0, 37) + '...';
    }
    return url;
  }

  updateAdvancedSection(advancedResults) {
    return; // Disabled - Advanced section removed
    const advancedSection = document.getElementById('capturedParameters');  // Fixed ID
    const advancedEmpty = document.getElementById('advancedEmpty');
    const tableBody = document.getElementById('captureTableBody');  // Fixed ID based on HTML
    const subtitle = document.querySelector('.capture-subtitle');  // Fixed selector
    const triggerBadge = document.getElementById('captchaTriggerBadge');
    const captureSelectionSection = document.getElementById('captureSelectionSection');
    const captureTermsSection = document.getElementById('captureTermsSection');
    const captureHeader = document.querySelector('.capture-header');

    if (!advancedSection || !advancedEmpty || !tableBody) {
      console.error('🛡️ Advanced: Missing required elements', {
        advancedSection: !!advancedSection,
        advancedEmpty: !!advancedEmpty,
        tableBody: !!tableBody
      });
      return;
    }

    // START CLEAN - Hide everything first
    console.log('🛡️ Advanced: Starting clean - hiding all sections');
    if (advancedSection) {
      advancedSection.style.display = 'none';
      advancedSection.style.visibility = 'hidden';
    }
    if (advancedEmpty) {
      advancedEmpty.style.display = 'none';
      advancedEmpty.style.visibility = 'hidden';
    }
    if (captureSelectionSection) {
      captureSelectionSection.style.display = 'none';
      captureSelectionSection.style.visibility = 'hidden';
    }
    if (captureTermsSection) {
      captureTermsSection.style.display = 'none';
      captureTermsSection.style.visibility = 'hidden';
    }
    if (captureHeader) {
      captureHeader.style.display = 'none';
      captureHeader.style.visibility = 'hidden';
    }

    // Debug: Log what we received
    console.log('🛡️ Advanced: updateAdvancedSection called with:', advancedResults);
    
    // Ensure advancedResults is an array
    if (!Array.isArray(advancedResults)) {
      advancedResults = [];
    }
    
    // Keep the results to check for captcha detection
    // But don't show DOM-extracted parameters automatically
    const originalResults = [...advancedResults];
    
    if (originalResults.length > 0) {
      advancedResults.forEach((result, index) => {
        console.log(`🛡️ Result ${index}:`, {
          name: result.name,
          key: result.key,
          category: result.category,
          hasAdvancedParameters: !!result.advancedParameters,
          hasNetworkCaptured: result.advancedParameters?.network_captured
        });
      });
    }

    // Check for any CAPTCHA detection (reCAPTCHA, hCaptcha, FunCaptcha, etc.)
    const captchaResults = originalResults.filter(r => {
      if (!r) return false;
      
      // More lenient check - normalize both name and key
      const normalizedName = (r.name || '').toLowerCase().replace(/[\s-_]/g, '');
      const normalizedKey = (r.key || '').toLowerCase().replace(/[\s-_]/g, '');
      const category = (r.category || '').toLowerCase();
      
      // Check if it's any type of captcha
      const isCaptcha = 
        category === 'captcha' ||
        normalizedName.includes('captcha') ||
        normalizedKey.includes('captcha') ||
        normalizedName.includes('recaptcha') ||
        normalizedKey.includes('recaptcha') ||
        normalizedKey === 'recaptcha' ||
        normalizedName.includes('googlerecaptcha') ||
        r.name === 'Google reCAPTCHA' ||
        r.name === 'reCAPTCHA' ||
        r.name === 'hCaptcha' ||
        r.name === 'FunCaptcha' ||
        r.name === 'GeeTest';
      
      if (isCaptcha) {
        console.log('🛡️ Found CAPTCHA result:', {
          name: r.name,
          key: r.key,
          category: r.category,
          normalizedName,
          normalizedKey
        });
      }
      
      return isCaptcha;
    });
    

    if (captchaResults.length === 0) {
      // No CAPTCHA detected - show empty state and hide capture interface
      this.showAdvancedEmptyState();
      return;
    }
    
    // Don't filter for DOM-extracted parameters - we don't want to display them
    // Only network-captured parameters should be shown via displayCapturedParameters()
    const advancedCapturedResults = []; // Empty - we don't display DOM params
    
    console.log('🛡️ Advanced: Not displaying DOM-extracted parameters');
    
    // Network captures are handled by displayCapturedParameters() separately
    const networkCapturedResults = [];
    
    console.log('🛡️ Advanced: Network captures will be shown via displayCapturedParameters()');

    // CAPTCHA detected - show capture header
    console.log('🛡️ Advanced: CAPTCHA detected, preparing to show capture UI');
    
    // Show capture header
    if (captureHeader) {
      captureHeader.style.display = 'block';
      captureHeader.style.visibility = 'visible';
    }
    if (triggerBadge) {
      triggerBadge.style.display = 'none';
      triggerBadge.style.visibility = 'hidden';
    }
    
    // Show appropriate capture interface based on terms acceptance
    chrome.storage.local.get(['captureTermsAccepted'], (result) => {
      if (result.captureTermsAccepted) {
        // User accepted terms - show capture selection UI
        if (captureTermsSection) {
          captureTermsSection.style.display = 'none';
          captureTermsSection.style.visibility = 'hidden';
        }
        if (captureSelectionSection) {
          captureSelectionSection.style.display = 'block';
          captureSelectionSection.style.visibility = 'visible';
          
          // Set the current results before initializing
          this.currentResults = captchaResults; // Use the detected CAPTCHA results
          
          // IMPORTANT: Initialize capture mode to set up event listeners!
          // This also calls loadDetectionsForCapture() internally
          this.initializeCaptureMode();
        }
        // Ensure captured parameters table stays hidden until we have captures
        if (advancedSection) {
          advancedSection.style.display = 'none';
          advancedSection.style.visibility = 'hidden';
        }
      } else {
        // User hasn't accepted terms - show terms first
        if (captureTermsSection) {
          captureTermsSection.style.display = 'block';
          captureTermsSection.style.visibility = 'visible';
        }
        if (captureSelectionSection) {
          captureSelectionSection.style.display = 'none';
          captureSelectionSection.style.visibility = 'hidden';
        }
        // Hide captured parameters table
        if (advancedSection) {
          advancedSection.style.display = 'none';
          advancedSection.style.visibility = 'hidden';
        }
      }
    });
    
    // Update subtitle - always show capture prompt since we don't display DOM params
    if (subtitle) {
      const captchaNames = [...new Set(captchaResults.map(r => r.name))].join(', ');
      subtitle.textContent = `${captchaNames} detected - click "Start Capturing" to capture parameters`;
    }
    
    // Clear existing table rows
    tableBody.innerHTML = '';

    // Skip displaying DOM-extracted parameters in the table
    // Network-captured parameters are displayed via displayCapturedParameters()
    
    // Don't populate the table with DOM-extracted data
    if (false) { // Disabled - we don't show DOM parameters
      const firstResult = advancedCapturedResults[0];
      
      if ((firstResult.name === 'reCAPTCHA' || firstResult.name === 'Google reCAPTCHA') && tableHeaders) {
        // Set reCAPTCHA headers (from panel.html)
        tableHeaders.innerHTML = `
          <th>Site URL</th>
          <th>Site Key</th>
          <th>pageAction for reCaptcha V3</th>
          <th>reCaptcha V2 Invisible</th>
          <th>reCaptcha V2</th>
          <th>reCaptcha V3</th>
          <th>Enterprise</th>
          <th>S</th>
          <th>ApiDomain</th>
        `;
        
        // Display reCAPTCHA rows
        advancedCapturedResults.forEach(result => {
          if (result.name === 'reCAPTCHA' || result.name === 'Google reCAPTCHA') {
            const params = result.advancedParameters || {};
            const row = document.createElement('tr');
            row.innerHTML = `
              <td title="${params.site_url}">${this.truncateUrl(params.site_url || '-')}</td>
              <td title="${params.sitekey || params.site_key}">${this.formatSiteKey(params.sitekey || params.site_key || '-')}</td>
              <td>${params.action || '-'}</td>
              <td class="center-cell">${this.boolToEmoji(params.isInvisible || params.is_invisible)}</td>
              <td class="center-cell">${this.boolToEmoji(params.recaptchaV2Normal)}</td>
              <td class="center-cell">${this.boolToEmoji(params.isReCaptchaV3)}</td>
              <td class="center-cell">${this.boolToEmoji(params.is_enterprise)}</td>
              <td class="center-cell">${this.boolToEmoji(params.is_s_required)}</td>
              <td class="center-cell">${this.boolToEmoji(!!params.apiDomain)}</td>
            `;
            tableBody.appendChild(row);
          }
        });
      } else if (firstResult.name === 'FunCaptcha') {
        // Set FunCaptcha headers (from FunCaptcha panel.html)
        tableHeaders.innerHTML = `
          <th>Url</th>
          <th>Public Key</th>
          <th>FunCaptcha</th>
          <th>FuncaptchaApiJSSubdomain</th>
          <th>Data Blob</th>
          <th>bda</th>
          <th>user-agent</th>
        `;
        
        // Display FunCaptcha rows
        networkCapturedResults.forEach(result => {
          if (result.name === 'FunCaptcha') {
            const params = result.advancedParameters || {};
            const row = document.createElement('tr');
            row.innerHTML = `
              <td title="${params.site_url}">${this.truncateUrl(params.site_url || 'Please reload the page and try again')}</td>
              <td title="${params.public_key}">${this.formatSiteKey(params.public_key || 'Please reload the page and try again')}</td>
              <td class="center-cell">${this.boolToEmoji(params.is_funcaptcha)}</td>
              <td>${params.funcaptchaApiJSSubdomain || '-'}</td>
              <td class="center-cell">${this.boolToEmoji(!!params.data_blob)}</td>
              <td><textarea readonly class="bda-output">${params.bda || '-'}</textarea></td>
              <td><textarea readonly class="useragent-output">${params.userbrowser || '-'}</textarea></td>
            `;
            tableBody.appendChild(row);
          }
        });
      }
    } else {
      // reCAPTCHA detected but no network parameters captured yet
      // Show default reCAPTCHA headers with a message
      const tableHeadersEmpty = document.querySelector('#captureTable thead tr');
      if (tableHeadersEmpty) {
        tableHeadersEmpty.innerHTML = `
          <th colspan="9" style="text-align: center; font-style: italic; color: var(--text-secondary);">
            reCAPTCHA detected - Start capturing to see parameters
          </th>
        `;
      }
      
      // Clear table body
      tableBody.innerHTML = '';
    }
  }

  showAdvancedEmptyState() {
    return; // Disabled - Advanced section removed
    
    // Get all elements that should be hidden when no reCAPTCHA is detected
    const advancedSection = document.getElementById('capturedParameters');  // Fixed ID
    const advancedEmpty = document.getElementById('advancedEmpty');
    const triggerBadge = document.getElementById('captchaTriggerBadge');
    const captureSelectionSection = document.getElementById('captureSelectionSection');
    const capturedParameters = document.getElementById('capturedParameters');
    const captureInstructions = document.getElementById('captureInstructions');
    const captureTermsSection = document.getElementById('captureTermsSection');
    const captureHeader = document.querySelector('.capture-header');

    // Hide ALL capture-related sections with force visibility
    if (advancedSection) {
      advancedSection.style.display = 'none';
      advancedSection.style.visibility = 'hidden';
    }
    if (captureSelectionSection) {
      captureSelectionSection.style.display = 'none';
      captureSelectionSection.style.visibility = 'hidden';
    }
    if (capturedParameters) {
      capturedParameters.style.display = 'none';
      capturedParameters.style.visibility = 'hidden';
    }
    if (captureInstructions) {
      captureInstructions.style.display = 'none';
      captureInstructions.style.visibility = 'hidden';
    }
    if (captureTermsSection) {
      captureTermsSection.style.display = 'none';
      captureTermsSection.style.visibility = 'hidden';
    }
    if (captureHeader) {
      captureHeader.style.display = 'none';
      captureHeader.style.visibility = 'hidden';
    }
    if (triggerBadge) {
      triggerBadge.style.display = 'none';
      triggerBadge.style.visibility = 'hidden';
    }
    
    // Show empty state
    if (advancedEmpty) {
      advancedEmpty.style.display = 'block';
      advancedEmpty.style.visibility = 'visible';
    }
  }

  async createCustomRuleElement(rule, index) {
    const div = document.createElement('div');
    div.className = `custom-rule-item ${rule.enabled === false ? 'disabled' : ''}`;
    
    // Add data attributes for event delegation
    div.dataset.ruleIndex = index;
    div.dataset.ruleName = rule.name;
    
    // Detection properties can be directly on rule or nested in detection object
    const methods = [];
    
    // Check both direct properties and nested detection object
    const detection = rule.detection || rule;
    
    // Check for detection methods
    if ((detection.cookies && detection.cookies.length > 0) || 
        (rule.cookies && rule.cookies.length > 0)) {
      methods.push('COOKIES');
    }
    if ((detection.headers && detection.headers.length > 0) || 
        (rule.headers && rule.headers.length > 0)) {
      methods.push('HEADERS');
    }
    if ((detection.urls && detection.urls.length > 0) || 
        (rule.urls && rule.urls.length > 0)) {
      methods.push('URLs');
    }
    if ((detection.scripts && detection.scripts.length > 0) || 
        (rule.scripts && rule.scripts.length > 0)) {
      methods.push('SCRIPTS');
    }
    if ((detection.dom && detection.dom.length > 0) || 
        (rule.dom && rule.dom.length > 0)) {
      methods.push('DOM');
    }
    if ((detection.patterns && Object.keys(detection.patterns).length > 0) || 
        (rule.patterns && Object.keys(rule.patterns).length > 0)) {
      methods.push('PATTERNS');
    }
    
    const defaultBadge = rule.isDefault ? '<span class="default-rule-badge">Built-in</span>' : '';
    
    // Get icon URL - handle async only for custom icons
    let iconSrc;
    if (rule.icon && rule.icon.startsWith('custom_icon_')) {
      iconSrc = await this.getProviderIcon(rule.icon);
    } else {
      // Ensure icon path is correct
      const iconFile = rule.icon || 'custom.png';
      iconSrc = chrome.runtime.getURL(`icons/providers/${iconFile}`);
    }
    
    // Format the lastUpdated timestamp
    const formatLastUpdated = (timestamp) => {
      if (!timestamp) return 'Never';
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);
      
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
      if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
      if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
      
      // Show full date and time
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    };
    
    // Apply custom color if available
    let categoryStyle = '';
    if (rule.color) {
      categoryStyle = `style="background: ${rule.color} !important; color: white !important;"`;
    }
    
    div.innerHTML = `
      <div class="rule-header">
        <div class="rule-name-section">
          <div class="rule-name-container">
            <img src="${iconSrc}" alt="${rule.name}" class="provider-icon" onerror="this.src='${chrome.runtime.getURL('icons/providers/custom.png')}'" />
            <div class="rule-name">${rule.name}</div>
          </div>
          ${defaultBadge}
        </div>
        <div class="rule-actions">
          <div class="rule-disable-toggle ${rule.enabled === false ? 'disabled' : ''}" title="${rule.enabled === false ? 'Enable rule' : 'Disable rule'}"></div>
          <button class="edit-rule-btn" title="Edit rule">
            <svg width="14" height="14" viewBox="0 0 24 24">
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor"/>
            </svg>
          </button>
          <button class="delete-rule-btn" title="Delete rule">
            <svg width="14" height="14" viewBox="0 0 24 24">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="currentColor"/>
            </svg>
          </button>
        </div>
      </div>
      ${rule.enabled === false ? '<div class="disabled-overlay">DISABLED</div>' : ''}
      <div class="rule-category" ${categoryStyle}>${rule.name}</div>
      <div class="rule-methods">
        ${methods.length > 0 ? methods.map(method => `<span class="rule-method-badge">${method}</span>`).join('') : '<span class="rule-method-badge" style="opacity: 0.5">No detection methods</span>'}
      </div>
      <div class="rule-updated">
        <span class="rule-updated-label">Last Updated:</span>
        <span class="rule-updated-time" title="${rule.lastUpdated ? new Date(rule.lastUpdated).toLocaleString() : 'Never'}">${formatLastUpdated(rule.lastUpdated)}</span>
      </div>
    `;
    
    const deleteBtn = div.querySelector('.delete-rule-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => this.deleteCustomRule(index));
    }
    
    const editBtn = div.querySelector('.edit-rule-btn');
    if (editBtn) {
      editBtn.addEventListener('click', () => this.editCustomRule(rule, index));
    }
    
    // Toggle button events are handled via event delegation in setupEventListeners
    
    return div;
  }

  editCustomRule(rule, index) {
    // Set title for editing rule
    const modalTitle = document.querySelector('#addRuleModal .modal-header h3');
    if (modalTitle) {
      modalTitle.textContent = 'Edit Custom Detection Rule';
    }
    
    // Store the index for updating instead of creating
    this.editingRuleIndex = index;
    // Store the original rule for base detector overrides
    this.editingRule = rule;
    
    // Pre-populate the add rule modal with existing rule data
    document.getElementById('ruleName').value = rule.name || '';
    document.getElementById('ruleCategory').value = rule.category || 'Anti-Bot';
    
    const iconSelector = document.getElementById('ruleIcon');
    const iconPreview = document.getElementById('iconPreview');
    
    // First, remove any previously dynamically added options (except upload option)
    const dynamicOptions = iconSelector.querySelectorAll('option[data-dynamic="true"]');
    dynamicOptions.forEach(opt => opt.remove());
    
    // Handle custom uploaded icons and icons not in the dropdown
    if (rule.icon && rule.icon !== 'custom.png') {
      // Check if the icon exists in the dropdown
      let existingOption = iconSelector.querySelector(`option[value="${rule.icon}"]`);
      
      if (!existingOption) {
        // Icon is not in the dropdown, add it as a custom option
        const option = document.createElement('option');
        option.value = rule.icon;
        option.setAttribute('data-dynamic', 'true'); // Mark as dynamically added
        
        if (rule.icon.startsWith('custom_icon_')) {
          option.text = 'Custom Uploaded';
        } else {
          // Extract name from icon filename for display
          let iconName = rule.icon.replace(/\.(png|svg|jpg|jpeg)$/i, '');
          
          // Special cases for known icons
          const iconNameMap = {
            'funcaptcha': 'FunCaptcha (Arkose Labs)',
            'geetest': 'GeeTest',
            'aws': 'AWS WAF',
            'f5': 'F5 Networks',
            'sucuri': 'Sucuri',
            'reblaze': 'Reblaze',
            'aws-waf': 'AWS WAF'
          };
          
          iconName = iconNameMap[iconName] || iconName.replace(/-/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());
          
          option.text = iconName;
        }
        
        // Add before the "Upload Custom Logo" option
        const uploadOption = iconSelector.querySelector('option[value="upload"]');
        if (uploadOption) {
          iconSelector.insertBefore(option, uploadOption);
        } else {
          iconSelector.appendChild(option);
        }
        
        existingOption = option;
      }
      
      // Set the value after ensuring the option exists
      iconSelector.value = rule.icon;
      
      // Double-check that it was selected
      if (iconSelector.value !== rule.icon) {
        console.warn(`Failed to select icon: ${rule.icon}`);
      }
    } else {
      iconSelector.value = 'custom.png';
    }
    
    // Update icon preview
    if (iconPreview) {
      this.getProviderIcon(rule.icon || 'custom.png').then(src => iconPreview.src = src);
    }
    
    // Load color - use detector-specific color, category color, or fallback
    const colorPicker = document.getElementById('ruleColor');
    const colorPreview = document.getElementById('colorPreview');
    if (colorPicker && colorPreview) {
      // Ensure rule has a color - use existing or category fallback
      const ruleColor = rule.color || this.getCategoryColor(rule.category) || '#6b7280';
      colorPicker.value = ruleColor;
      colorPreview.style.background = ruleColor;
    }
    
    // Clear rule inputs first
    document.getElementById('cookieRules').innerHTML = '';
    document.getElementById('headerRules').innerHTML = '';
    document.getElementById('urlRules').innerHTML = '';
    document.getElementById('scriptRules').innerHTML = '';
    document.getElementById('domRules').innerHTML = '';
    
    // Helper function to populate a rule section
    const populateRuleSection = (sectionId, rules, type) => {
      const container = document.getElementById(sectionId);
      
      // Filter out empty rule entries
      const validRules = rules ? rules.filter(rule => {
        if (type === 'cookie' || type === 'header') {
          return rule.name && rule.name.trim() !== '';
        } else if (type === 'url') {
          return rule.pattern && rule.pattern.trim() !== '';
        } else if (type === 'script') {
          return rule.content && rule.content.trim() !== '';
        } else if (type === 'dom') {
          return rule.selector && rule.selector.trim() !== '';
        }
        return false;
      }) : [];
      
      if (validRules.length > 0) {
        validRules.forEach(ruleItem => {
          const inputGroupHTML = this.createRuleInputGroup(type);
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = inputGroupHTML;
          const inputGroup = tempDiv.firstElementChild;
          
          // Populate the inputs based on type
          if (type === 'cookie' || type === 'header') {
            const nameInput = inputGroup.querySelector('.rule-input[data-field="name"]');
            const valueInput = inputGroup.querySelector('.rule-input[data-field="value"]');
            const confidenceInput = inputGroup.querySelector('.rule-input[data-field="confidence"]');
            if (nameInput) nameInput.value = ruleItem.name || '';
            if (valueInput) valueInput.value = ruleItem.value || '';
            if (confidenceInput) confidenceInput.value = ruleItem.confidence || 80;
          } else if (type === 'url') {
            const patternInput = inputGroup.querySelector('.rule-input[data-field="pattern"]');
            const confidenceInput = inputGroup.querySelector('.rule-input[data-field="confidence"]');
            if (patternInput) patternInput.value = ruleItem.pattern || '';
            if (confidenceInput) confidenceInput.value = ruleItem.confidence || 80;
          } else if (type === 'script') {
            const contentInput = inputGroup.querySelector('.rule-input[data-field="content"]');
            const confidenceInput = inputGroup.querySelector('.rule-input[data-field="confidence"]');
            if (contentInput) contentInput.value = ruleItem.content || '';
            if (confidenceInput) confidenceInput.value = ruleItem.confidence || 80;
          } else if (type === 'dom') {
            const selectorInput = inputGroup.querySelector('.rule-input[data-field="selector"]');
            const confidenceInput = inputGroup.querySelector('.rule-input[data-field="confidence"]');
            if (selectorInput) selectorInput.value = ruleItem.selector || '';
            if (confidenceInput) confidenceInput.value = ruleItem.confidence || 80;
          }
          
          container.appendChild(inputGroup);
        });
      }
      // If no valid rules, container remains empty - no default rows
    };
    
    // Populate each rule section
    populateRuleSection('cookieRules', rule.cookies, 'cookie');
    populateRuleSection('headerRules', rule.headers, 'header');
    populateRuleSection('urlRules', rule.urls, 'url');
    populateRuleSection('scriptRules', rule.scripts, 'script');
    populateRuleSection('domRules', rule.dom, 'dom');
    
    // Show the modal (don't call showAddRuleModal as it resets the title)
    document.getElementById('addRuleModal').style.display = 'flex';
  }

  async updateDefaultRulesIcons() {
    try {
      const response = await fetch(chrome.runtime.getURL('detectors.json'));
      const detectorsData = await response.json();
      
      let updated = false;
      const now = new Date().toISOString();
      
      this.customRules.forEach(rule => {
        // Only update default rules that don't have an icon or need updating
        if (rule.isDefault) {
          const detector = detectorsData.detectors[rule.id];
          if (detector && detector.icon && (!rule.icon || rule.icon === 'custom.png' || rule.icon !== detector.icon)) {
            rule.icon = detector.icon;
            rule.lastUpdated = now;
            updated = true;
          }
          // Add lastUpdated if missing
          if (!rule.lastUpdated) {
            rule.lastUpdated = now;
            updated = true;
          }
        }
      });
      
      // Save if we updated any rules
      if (updated) {
        await chrome.storage.local.set({ customRules: this.customRules });
      }
    } catch (error) {
      console.error('Failed to update rule icons:', error);
    }
  }

  async ensureAllRulesHaveIcons() {
    let updated = false;
    
    // Map of known service IDs to their icon files
    const knownIcons = {
      'akamai': 'akamai.png',
      'cloudflare': 'cloudflare.png',
      'incapsula': 'imperva.png',
      'imperva': 'imperva.png',
      'datadome': 'datadome.png',
      'perimeterx': 'perimeterx.png',
      'recaptcha': 'recaptcha.png',
      'hcaptcha': 'hcaptcha.png'
    };
    
    this.customRules.forEach(rule => {
      if (!rule.icon) {
        // Try to find icon based on rule ID or name
        const ruleIdLower = (rule.id || '').toLowerCase();
        const ruleNameLower = (rule.name || '').toLowerCase();
        
        // Check if we have a known icon for this rule
        let iconFound = false;
        for (const [key, iconFile] of Object.entries(knownIcons)) {
          if (ruleIdLower.includes(key) || ruleNameLower.includes(key)) {
            rule.icon = iconFile;
            iconFound = true;
            updated = true;
            break;
          }
        }
        
        // If no specific icon found, use custom.png as fallback
        if (!iconFound) {
          rule.icon = 'custom.png';
          updated = true;
        }
      }
    });
    
    // Save if we updated any rules
    if (updated) {
      await chrome.storage.local.set({ customRules: this.customRules });
    }
  }

  async populateDefaultRules() {
    try {
      
      // First load the detector index
      const indexResponse = await fetch(chrome.runtime.getURL('detectors/index.json'));
      const indexData = await indexResponse.json();
      
      const defaultRules = [];
      const now = new Date().toISOString();
      
      // Process each detector from the index
      for (const [detectorId, detectorConfig] of Object.entries(indexData.detectors)) {
        try {
          // Load the individual detector file
          const detectorUrl = chrome.runtime.getURL(`detectors/${detectorConfig.file}`);
          
          const detectorResponse = await fetch(detectorUrl);
          if (!detectorResponse.ok) {
            throw new Error(`HTTP ${detectorResponse.status}: ${detectorResponse.statusText} for ${detectorUrl}`);
          }
          
          const detector = await detectorResponse.json();
          
          if (!detector.icon) {
            console.warn(`⚠️ Detector ${detectorId} has no icon property in JSON`);
          }
          
          const rule = {
            id: detector.id || detectorId,
            name: detector.name,
            category: detector.category,
            icon: detector.icon || 'custom.png',
            enabled: detectorConfig.enabled !== false,
            isDefault: true,
            lastUpdated: detector.lastUpdated || now,
            cookies: detector.detection?.cookies || [],
            headers: detector.detection?.headers || [],
            urls: detector.detection?.urls || [],
            scripts: detector.detection?.scripts || [],
            dom: detector.detection?.dom || [],
            patterns: detector.detection?.patterns || {}
          };
          defaultRules.push(rule);
        } catch (detectorError) {
          console.error(`❌ Failed to load detector ${detectorId} from ${detectorConfig.file}:`, detectorError.message);
        }
      }
      
      // Also load legacy detectors.json as fallback
      try {
        const legacyResponse = await fetch(chrome.runtime.getURL('detectors.json'));
        const legacyData = await legacyResponse.json();
        
        // Add any detectors from legacy that aren't in the modular system
        Object.entries(legacyData.detectors).forEach(([key, detector]) => {
          if (!defaultRules.find(r => r.id === key)) {
            const rule = {
              id: key,
              name: detector.name,
              category: detector.category,
              icon: detector.icon || 'custom.png',
              enabled: true,
              isDefault: true,
              lastUpdated: now,
              cookies: detector.detection?.cookies || [],
              headers: detector.detection?.headers || [],
              urls: detector.detection?.urls || [],
              scripts: detector.detection?.scripts || []
            };
            defaultRules.push(rule);
          }
        });
      } catch (legacyError) {
        console.warn('Failed to load legacy detectors:', legacyError);
      }
      
      this.customRules = defaultRules;
      await chrome.storage.local.set({ customRules: this.customRules });
      
      // Refresh the display
      this.loadCustomRules();
    } catch (error) {
      console.error('🛡️ Failed to populate default rules:', error);
    }
  }

  showAddRuleModal() {
    // Set title for adding new rule
    const modalTitle = document.querySelector('#addRuleModal .modal-header h3');
    if (modalTitle) {
      modalTitle.textContent = 'Add Custom Detection Rule';
    }
    
    // Clean up any dynamically added options from previous edits
    const iconSelector = document.getElementById('ruleIcon');
    const dynamicOptions = iconSelector.querySelectorAll('option[data-dynamic="true"]');
    dynamicOptions.forEach(opt => opt.remove());
    
    document.getElementById('addRuleModal').style.display = 'flex';
    this.resetAddRuleForm();
  }

  hideAddRuleModal() {
    document.getElementById('addRuleModal').style.display = 'none';
    // Clear editing state
    delete this.editingRuleIndex;
    delete this.editingRule;
  }

  resetAddRuleForm() {
    // Only reset if we're not in editing mode
    if (this.editingRuleIndex === undefined) {
      document.getElementById('ruleName').value = '';
      document.getElementById('ruleCategory').value = 'Anti-Bot';
      document.getElementById('ruleIcon').value = 'custom.png';
      
      // Update icon preview
      const iconPreview = document.getElementById('iconPreview');
      if (iconPreview) {
        this.getProviderIcon('custom.png').then(src => iconPreview.src = src);
      }
      
      // Reset color to default
      const colorPicker = document.getElementById('ruleColor');
      const colorPreview = document.getElementById('colorPreview');
      if (colorPicker && colorPreview) {
        const defaultColor = this.getCategoryColor('Anti-Bot');
        colorPicker.value = defaultColor;
        colorPreview.style.background = defaultColor;
      }
      
      // Reset rule input sections
      document.getElementById('cookieRules').innerHTML = this.createRuleInputGroup('cookie');
      document.getElementById('headerRules').innerHTML = this.createRuleInputGroup('header');
      document.getElementById('urlRules').innerHTML = this.createRuleInputGroup('url');
      document.getElementById('scriptRules').innerHTML = this.createRuleInputGroup('script');
      document.getElementById('domRules').innerHTML = this.createRuleInputGroup('dom');
    }
  }

  createRuleInputGroup(type) {
    const fields = {
      cookie: `
        <input type="text" class="rule-input" data-field="name" placeholder="Cookie name">
        <input type="text" class="rule-input" data-field="value" placeholder="Value (optional)">
      `,
      header: `
        <input type="text" class="rule-input" data-field="name" placeholder="Header name">
        <input type="text" class="rule-input" data-field="value" placeholder="Value (optional)">
      `,
      url: `
        <input type="text" class="rule-input" data-field="pattern" placeholder="URL pattern">
      `,
      script: `
        <input type="text" class="rule-input" data-field="content" placeholder="Script content to detect">
      `,
      dom: `
        <input type="text" class="rule-input" data-field="selector" placeholder="CSS selector (e.g., .g-recaptcha, [data-sitekey])">
      `
    };
    
    const typeClass = (type === 'url') ? 'url-input-group' : 
                     (type === 'script') ? 'script-input-group' :
                     (type === 'dom') ? 'dom-input-group' : '';
    
    return `
      <div class="rule-input-group ${typeClass}">
        ${fields[type]}
        <input type="number" class="rule-input" data-field="confidence" placeholder="%" min="1" max="100" value="80">
        <button type="button" class="remove-rule-btn" data-action="remove">×</button>
      </div>
    `;
  }

  addRuleInput(containerId, type) {
    const container = document.getElementById(containerId);
    const inputGroup = document.createElement('div');
    inputGroup.innerHTML = this.createRuleInputGroup(type);
    container.appendChild(inputGroup.firstElementChild);
  }

  async saveCustomRule() {
    const name = document.getElementById('ruleName').value.trim();
    const category = document.getElementById('ruleCategory').value;
    
    if (!name) {
      alert('Please enter a rule name');
      return;
    }
    
    // Get the selected icon value
    let icon = document.getElementById('ruleIcon').value;
    
    // Don't use "upload" as an icon value
    if (icon === 'upload') {
      icon = 'custom.png';
    }
    let color = document.getElementById('ruleColor').value;
    
    // Use category default if no custom color provided
    if (!color || color === '#000000') {
      color = this.getCategoryColor(category) || '#6b7280';
    }
    
    const now = new Date().toISOString();
    const rule = {
      name,
      category,
      icon,
      color,
      lastUpdated: now,
      cookies: this.extractRuleInputs('cookieRules', 'cookie'),
      headers: this.extractRuleInputs('headerRules', 'header'),
      urls: this.extractRuleInputs('urlRules', 'url'),
      scripts: this.extractRuleInputs('scriptRules', 'script'),
      dom: this.extractRuleInputs('domRules', 'dom')
    };
    
    // Check if at least one detection method is defined
    const hasRules = rule.cookies.length > 0 || rule.headers.length > 0 || rule.urls.length > 0 || rule.scripts.length > 0 || rule.dom.length > 0;
    if (!hasRules) {
      alert('Please define at least one detection method');
      return;
    }
    
    try {
      // Check if we're editing an existing rule
      if (this.editingRuleIndex !== undefined) {
        // Check if editing a base detector (index -1 means it's not in customRules)
        if (this.editingRuleIndex === -1 && this.editingRule && this.editingRule.isDefault) {
          // Create new custom rule that overrides the base detector
          rule.createdAt = now;
          rule.overridesDefault = this.editingRule.id || this.editingRule.name;
          rule.originalRule = {
            id: this.editingRule.id,
            name: this.editingRule.name,
            category: this.editingRule.category
          };
          this.customRules.push(rule);
        } else if (this.editingRuleIndex >= 0) {
          // Editing existing custom rule
          const existingRule = this.customRules[this.editingRuleIndex];
          this.customRules[this.editingRuleIndex] = {
            ...existingRule,
            ...rule,
            lastUpdated: now
          };
        }
        delete this.editingRuleIndex; // Clear editing state
        delete this.editingRule; // Clear editing rule reference
      } else {
        rule.createdAt = now;
        this.customRules.push(rule);
      }
      
      await chrome.storage.local.set({ customRules: this.customRules });
      
      // Notify background script to refresh detectors cache
      await chrome.runtime.sendMessage({ action: 'reloadCustomRules' });
      
      // Notify content script to reload rules
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'reloadCustomRules' });
      } catch (e) {
        // Content script might not be ready, that's ok
      }
      
      this.hideAddRuleModal();
      this.loadCustomRules();
      
      // Clear history for current URL and refresh analysis
      if (tab && tab.url) {
        await this.updateHistoryForUrl(tab.url);
      }
      
      // Re-analyze current page with new rule
      setTimeout(() => {
        this.refreshAnalysis();
      }, 500);
    } catch (error) {
      console.error('Failed to save custom rule:', error);
      alert('Failed to save rule. Please try again.');
    }
  }

  extractRuleInputs(containerId, type) {
    const container = document.getElementById(containerId);
    const groups = container.querySelectorAll('.rule-input-group');
    const rules = [];
    
    groups.forEach(group => {
      const confidenceInput = group.querySelector('.rule-input[data-field="confidence"]');
      const confidence = parseInt(confidenceInput?.value) || 80;
      
      if (type === 'cookie') {
        const nameInput = group.querySelector('.rule-input[data-field="name"]');
        const valueInput = group.querySelector('.rule-input[data-field="value"]');
        const name = nameInput?.value.trim();
        const value = valueInput?.value.trim();
        if (name) {
          const rule = { name, confidence };
          if (value) rule.value = value;
          rules.push(rule);
        }
      } else if (type === 'header') {
        const nameInput = group.querySelector('.rule-input[data-field="name"]');
        const valueInput = group.querySelector('.rule-input[data-field="value"]');
        const name = nameInput?.value.trim();
        const value = valueInput?.value.trim();
        if (name) {
          const rule = { name, confidence };
          if (value) rule.value = value;
          rules.push(rule);
        }
      } else if (type === 'url') {
        const patternInput = group.querySelector('.rule-input[data-field="pattern"]');
        const pattern = patternInput?.value.trim();
        if (pattern) {
          rules.push({ pattern, confidence });
        }
      } else if (type === 'script') {
        const contentInput = group.querySelector('.rule-input[data-field="content"]');
        const content = contentInput?.value.trim();
        if (content) {
          rules.push({ content, confidence });
        }
      } else if (type === 'dom') {
        const selectorInput = group.querySelector('.rule-input[data-field="selector"]');
        const selector = selectorInput?.value.trim();
        if (selector) {
          rules.push({ selector, confidence });
        }
      }
    });
    
    return rules;
  }

  async deleteCustomRule(index) {
    // Use the showConfirmDialog method for consistent styling
    const confirmed = await this.showConfirmDialog(
      'Delete Rule',
      'Are you sure you want to delete this custom rule? This action cannot be undone.'
    );
    
    if (confirmed) {
      this.customRules.splice(index, 1);
      await chrome.storage.local.set({ customRules: this.customRules });
      
      // Notify content script to reload rules
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'reloadCustomRules' });
      } catch (e) {
        // Content script might not be ready, that's ok
      }
      
      this.loadCustomRules();
      this.showNotification('Rule deleted successfully', 'success');
    }
  }
  
  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 16px;
      background: ${type === 'success' ? 'var(--success)' : type === 'error' ? 'var(--error)' : 'var(--accent)'};
      color: white;
      border-radius: 6px;
      font-size: 14px;
      z-index: 10001;
      animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  // Enhanced Export functionality
  async showExportModal() {
    if (this.currentResults.length === 0) return;
    
    document.getElementById('exportModal').style.display = 'flex';
    await this.loadProviders();
    this.renderProviderGrid();
    this.showExportStep('providerStep');
  }

  // Export modal removed

  async loadProviders() {
    try {
      // Load from modular provider structure
      const response = await fetch(chrome.runtime.getURL('providers/index.json'));
      const index = await response.json();
      
      // Load individual provider files
      const providers = {};
      const templates = {};
      
      for (const [id, config] of Object.entries(index.providers)) {
        try {
          const providerResponse = await fetch(chrome.runtime.getURL(`providers/${config.file}`));
          const provider = await providerResponse.json();
          providers[id] = provider;
          
          // Extract templates from provider if available
          if (provider.requestTemplate) {
            templates[id] = provider.requestTemplate;
          }
        } catch (e) {
          console.error(`Failed to load provider ${id}:`, e);
        }
      }
      
      this.exportProviders = providers;
      this.exportTemplates = templates;
      
      this.renderProviderGrid();
    } catch (error) {
      console.error('Failed to load providers:', error);
    }
  }

  renderProviderGrid() {
    const grid = document.getElementById('providerGrid');
    if (!grid) {
      console.error('Provider grid element not found');
      return;
    }
    grid.innerHTML = '';
    
    if (!this.exportProviders) {
      console.error('Export providers not loaded');
      return;
    }
    
    Object.entries(this.exportProviders).forEach(([key, provider]) => {
      const card = document.createElement('div');
      card.className = 'provider-card';
      card.dataset.provider = key;
      
      card.innerHTML = `
        <h5>${provider.name}</h5>
        <p>${provider.description}</p>
      `;
      
      card.addEventListener('click', (e) => {
        // Find the card element if click was on a child
        const cardElement = e.target.closest('.provider-card');
        this.selectProvider(cardElement, key);
      });
      grid.appendChild(card);
    });
  }

  // Removed duplicate - using unified selectProvider at line 1574

  // All export-related functionality has been removed
}

document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
});