class PopupManager {
  constructor() {
    this.currentResults = [];
    this.isEnabled = true;
    this.darkMode = true;
    this.apiEnabled = false;
    this.apiUrl = '';
    this.historyLimit = 100;
    this.customRules = [];
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
    
    // Bind event handlers to prevent issues with removeEventListener
    this.toggleExtensionHandler = () => this.toggleExtension();
    this.toggleThemeHandler = () => this.toggleTheme();
    
    this.init();
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
    setTimeout(() => {
      // Now load the actual data
      this.loadResults();
      this.loadHistory();
      this.loadCustomRules();
      this.loadAdvancedResults();
    }, 100);
  }

  async loadSettings() {
    const result = await chrome.storage.sync.get([
      'enabled', 'darkMode', 'apiEnabled', 'apiUrl', 'historyLimit', 
      'autoUpdateEnabled', 'blacklist', 'telemetryEnabled', 'telemetryEndpoint',
      'cacheEnabled', 'cacheDuration'
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
    this.telemetryEnabled = result.telemetryEnabled || false;
    this.telemetryEndpoint = result.telemetryEndpoint || 'https://api.shieldeye.io/telemetry';
    this.cacheEnabled = result.cacheEnabled !== false;
    this.cacheDuration = result.cacheDuration || 900;
    
    // Load blacklist UI
    this.loadBlacklistUI();
    this.autoUpdateEnabled = result.autoUpdateEnabled !== false; // Default true
    
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
    
    // Reset rules button
    const resetRulesBtn = document.getElementById('resetRulesBtn');
    if (resetRulesBtn) {
      resetRulesBtn.addEventListener('click', async () => {
        if (confirm('Reset all rules to default? This will remove any custom rules.')) {
          await chrome.storage.local.remove(['customRules', 'rulesVersion']);
          this.customRules = [];
          await this.populateDefaultRules();
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
          // Check if this is the last input group in its container
          const container = inputGroup.parentElement;
          if (container.children.length > 1) {
            inputGroup.remove();
          } else {
            // Don't remove the last one, just clear it
            inputGroup.querySelectorAll('input').forEach(input => input.value = '');
          }
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
    
    // Telemetry settings toggle
    const telemetryToggle = document.getElementById('telemetryToggle');
    if (telemetryToggle) {
      telemetryToggle.addEventListener('change', (e) => {
        const telemetrySettings = document.getElementById('telemetrySettings');
        if (telemetrySettings) {
          telemetrySettings.style.display = e.target.checked ? 'block' : 'none';
        }
        this.toggleTelemetry(e.target.checked);
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
        const url = (item.url || '').toLowerCase();
        const detections = item.detections.map(d => (d.name || '').toLowerCase()).join(' ');
        
        return url.includes(lowerSearchTerm) || detections.includes(lowerSearchTerm);
      });
    }

    // Reset to first page after filtering
    this.historyPage = 1;
    
    // Update the display
    this.displayHistoryPage();
  }

  filterRules(searchTerm) {
    if (!this.allRules) return;

    // Filter the rules data array
    this.filteredRules = this.allRules.filter(rule => {
      const name = (rule.name || '').toLowerCase();
      const category = (rule.category || '').toLowerCase();
      
      const matchesSearch = !searchTerm || 
        name.includes(searchTerm.toLowerCase()) || 
        category.includes(searchTerm.toLowerCase());
      
      return matchesSearch;
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
    const resultsList = document.getElementById('resultsList');
    const detectionsPagination = document.getElementById('detectionsPagination');
    const detectionsPaginationInfo = document.getElementById('detectionsPaginationInfo');
    const detectionsPageNumbers = document.getElementById('detectionsPageNumbers');
    const detectionsPrevBtn = document.getElementById('detectionsPrevBtn');
    const detectionsNextBtn = document.getElementById('detectionsNextBtn');

    if (!resultsList || !this.filteredDetections) return;

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
    
    const uniqueMap = new Map();
    
    matches.forEach(match => {
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
      } else if (match.type === 'global' && match.property) {
        key = `${match.type}-${match.property}`;
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
          statsEl.textContent = `Cached: ${response.stats.detectionResults} sites, ${response.stats.telemetryQueue} telemetry records`;
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
          this.loadAdvancedResults();
        }, 1000);
      }, 500);
    } catch (error) {
      console.error('Failed to refresh analysis:', error);
      this.showEmptyState();
      this.showAdvancedEmptyState();
    }
  }

  async loadResults() {
    
    if (!this.isEnabled) {
      this.showDisabledState();
      return;
    }
    

    // Clear previous results but don't show loading state immediately
    this.currentResults = [];
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Check if this is a valid URL for content script injection
    if (!this.isValidUrl(tab.url)) {
      this.showInvalidUrlState();
      this.updateTabInfo(tab.url);
      return;
    }
    
    try {
      // Try to get existing results first
      const response = await chrome.runtime.sendMessage({
        action: 'getTabResults',
        tabId: tab.id
      });
      
      this.currentResults = (response && response.results) ? response.results : [];
      this.currentTabId = tab.id;
      this.currentTabUrl = tab.url;
      
      // If no results, try to inject content script and analyze
      if (this.currentResults.length === 0) {
        // Show loading state while we ensure content script is ready
        this.showLoadingState();
        
        // Try to ensure content script is loaded and get results
        await this.ensureContentScriptAndAnalyze(tab);
        
        // Check if we got results after ensuring content script
        if (this.currentResults.length > 0) {
        } else {
        }
      }
      
      // Update tab info display
      this.updateTabInfo(tab.url);
      
      // Final UI update based on results
      if (this.currentResults.length > 0) {
        this.showResults();
        // Add to history
        await this.addToHistory(tab.url, this.currentResults);
      } else {
        this.showEmptyState();
      }
    } catch (error) {
      console.error('Failed to load results:', error);
      console.error('Error details:', error.message, error.stack);
      // If there's an error communicating with background script, show empty state
      this.showEmptyState();
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
  
  showInvalidUrlState() {
    this.hideAllDetectionStates();
    
    // Create or update invalid URL message
    let invalidUrlState = document.getElementById('invalidUrlState');
    if (!invalidUrlState) {
      invalidUrlState = document.createElement('div');
      invalidUrlState.id = 'invalidUrlState';
      invalidUrlState.className = 'empty-state';
      invalidUrlState.innerHTML = `
        <div class="empty-icon">🚫</div>
        <h3>Cannot Analyze This Page</h3>
        <p>This extension cannot analyze browser system pages, extension pages, or local files.</p>
        <p class="text-secondary">Try visiting a regular website to see detections.</p>
      `;
      document.getElementById('detectionContent').appendChild(invalidUrlState);
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
      
      this.currentResults = (response && response.results) ? response.results : [];
      
      // If still no results, try one more time with a longer wait
      if (this.currentResults.length === 0) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        const finalResponse = await chrome.runtime.sendMessage({
          action: 'getTabResults',
          tabId: tab.id
        });
        
        this.currentResults = (finalResponse && finalResponse.results) ? finalResponse.results : [];
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

  showResults() {
    this.hideAllDetectionStates();
    document.getElementById('detectionResults').style.display = 'block';
    
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
    
    // Hide refresh button when no results
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
      refreshBtn.style.display = 'none';
    }
  }

  updateResultsDisplay() {
    const countBadge = document.getElementById('detectionCount');
    
    // Store detection data for pagination
    this.allDetections = [...this.currentResults];
    this.filteredDetections = [...this.allDetections];
    
    // Reset to first page
    this.detectionsPage = 1;
    
    countBadge.textContent = this.currentResults.length;
    
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
      // Use the icon from the result or map based on detector name
      let iconFile = result.icon;
      
      // If no icon specified or it's invalid, try to map common detector names to their icon files
      if (!iconFile || iconFile === 'custom.svg' || iconFile === 'undefined') {
        const nameToIcon = {
          'akamai bot manager': 'akamai.png',
          'cloudflare': 'cloudflare.png', 
          'cloudflare bot management': 'cloudflare.png',
          'datadome': 'datadome.png',
          'google recaptcha': 'recaptcha.png',
          'recaptcha': 'recaptcha.png',
          'hcaptcha': 'hcaptcha.png',
          'imperva': 'imperva.png',
          'incapsula': 'imperva.png',
          'perimeterx': 'perimeterx.png',
          'aws waf': 'aws.png',
          'f5 big-ip asm': 'f5.png',
          'webgl fingerprinting': 'custom.png',
          'canvas fingerprinting': 'custom.png',
          'audio fingerprinting': 'custom.png'
        };
        
        const lowerName = (result.name || result.key || '').toLowerCase();
        iconFile = nameToIcon[lowerName] || 'custom.png';
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
    
    // Create one tag per type (max 3 types shown)
    const matchTypes = Object.keys(matchesByType);
    const matchTags = matchTypes.slice(0, 3).map(type => {
      const typeClass = this.getMatchTypeClass(type);
      const typeName = this.getMatchTypeDisplayName(type);
      return `<span class="match-tag ${typeClass}">${typeName}</span>`;
    }).join('');
    
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
    
    // First, ensure the tab itself is visible
    const advancedTab = document.getElementById('advancedTab');
    if (advancedTab) {
      advancedTab.style.display = 'block';
    }
    
    // Initialize capture terms (sets up event listeners)
    this.initializeCaptureTerms();
    
    // First, ensure we have detection results
    // If not, trigger a refresh to get them
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0) {
      const response = await chrome.runtime.sendMessage({
        action: 'getTabResults',
        tabId: tabs[0].id
      });
      
      
      // If no results, try to trigger content script to send them
      if (!response || !response.results || response.results.length === 0) {
        try {
          await chrome.tabs.sendMessage(tabs[0].id, { action: 'getResults' });
          // Wait a bit for the content script to respond
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (e) {
        }
      }
    }
    
    // Load any previously captured parameters
    await this.loadCapturedParameters();
    
    // Now load the actual results
    this.loadAdvancedResults();
    
    // Set up periodic checking for new captures
    if (this.captureCheckInterval) {
      clearInterval(this.captureCheckInterval);
    }
    this.captureCheckInterval = setInterval(() => {
      this.loadCapturedParameters();
    }, 2000); // Check every 2 seconds
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
      case 'global':
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
      case 'global':
        category = 'Global';
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
    
    // Check if we have any selections
    if (this.selectedDetections.size === 0) {
      console.error('🛡️ No detections selected!');
      this.showToast('Please select a detection first!');
      return;
    }
    
    try {
      this.isCapturing = true;
      
      // Notify background script to start capturing
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      const response = await chrome.runtime.sendMessage({
        action: 'startCaptureMode',
        tabId: tab.id,
        targets: Array.from(this.selectedDetections)
      });
      
      
      // Show a quick message before closing
      this.showToast('Capture mode activated! Trigger the captcha now.');
      
      // Close the popup after a short delay to let the user see the message
      setTimeout(() => {
        window.close();
      }, 1500);
    } catch (error) {
      console.error('🛡️ Error in startCapture:', error);
      this.showToast('Error starting capture mode!');
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
    const capturedSection = document.getElementById('capturedParameters');
    const emptyState = document.getElementById('advancedEmpty');
    const tableBody = document.getElementById('captureTableBody');
    const captureCount = document.getElementById('captureCount');
    const captureTable = document.getElementById('captureTable');
    
    
    if (!this.capturedParams || this.capturedParams.length === 0) {
      // No captures yet - hide the table
      if (capturedSection) {
        capturedSection.style.display = 'none';
        capturedSection.style.visibility = 'hidden';
      }
      return;
    }
    
    if (capturedSection) capturedSection.style.display = 'block';
    if (emptyState) emptyState.style.display = 'none';
    if (captureCount) captureCount.textContent = `${this.capturedParams.length} capture${this.capturedParams.length > 1 ? 's' : ''}`;
    
    if (!tableBody || !captureTable) return;
    
    // Group captures by type to determine which columns to show
    const captureTypes = new Set(this.capturedParams.map(c => c.captcha_type || 'recaptcha'));
    
    // Update table headers based on capture types
    const thead = captureTable.querySelector('thead tr');
    if (thead) {
      let headers = '<th>Website</th>';
      
      // Add type-specific headers
      if (captureTypes.has('recaptcha')) {
        headers += '<th>Site Key</th><th>Action</th><th>V2</th><th>Invisible</th><th>V3</th><th>Enterprise</th><th>S Required</th><th>API Domain</th>';
      } else if (captureTypes.has('hcaptcha')) {
        headers += '<th>Site Key</th><th>Type</th><th>Enterprise</th><th>RQData</th><th>API Endpoint</th>';
      } else if (captureTypes.has('funcaptcha')) {
        headers += '<th>Public Key</th><th>Subdomain</th><th>Data Blob</th><th>BDA</th>';
      } else if (captureTypes.has('datadome')) {
        headers += '<th>Captcha URL</th><th>Has Challenge</th><th>Cookie Found</th>';
      }
      
      headers += '<th>Actions</th>';
      thead.innerHTML = headers;
    }
    
    tableBody.innerHTML = '';
    
    this.capturedParams.forEach((capture, index) => {
      const row = document.createElement('tr');
      const boolEmoji = (value) => value ? '✅' : '❌';
      const captchaType = capture.captcha_type || 'recaptcha';
      
      let rowContent = `<td title="${capture.site_url || capture.websiteURL || ''}">${this.truncateUrl(capture.site_url || capture.websiteURL || '-')}</td>`;
      
      if (captchaType === 'recaptcha') {
        rowContent += `
          <td title="${capture.site_key || ''}">${this.formatSiteKey(capture.site_key || '-')}</td>
          <td>${capture.action || '-'}</td>
          <td class="center-cell">${boolEmoji(capture.recaptchaV2Normal)}</td>
          <td class="center-cell">${boolEmoji(capture.isInvisible)}</td>
          <td class="center-cell">${boolEmoji(capture.isReCaptchaV3)}</td>
          <td class="center-cell">${boolEmoji(capture.is_enterprise)}</td>
          <td class="center-cell">${boolEmoji(capture.is_s_required)}</td>
          <td>${capture.apiDomain || '-'}</td>
        `;
      } else if (captchaType === 'hcaptcha') {
        rowContent += `
          <td title="${capture.site_key || capture.websiteKey || ''}">${this.formatSiteKey(capture.site_key || capture.websiteKey || '-')}</td>
          <td>${capture.type || 'HCaptchaTask'}</td>
          <td class="center-cell">${boolEmoji(capture.is_enterprise || capture.isEnterprise)}</td>
          <td class="center-cell">${boolEmoji(capture.rqdata || capture.is_rqdata_required)}</td>
          <td>${capture.apiEndpoint || capture.endpoint || '-'}</td>
        `;
      } else if (captchaType === 'funcaptcha') {
        rowContent += `
          <td title="${capture.websitePublicKey || ''}">${this.formatSiteKey(capture.websitePublicKey || '-')}</td>
          <td>${capture.funcaptchaApiJSSubdomain || '-'}</td>
          <td class="center-cell">${boolEmoji(capture.data || capture.hasDataBlob)}</td>
          <td title="${capture.bda || ''}">${capture.bda ? 'Present' : '-'}</td>
        `;
      } else if (captchaType === 'datadome') {
        rowContent += `
          <td title="${capture.captchaUrl || ''}">${this.truncateUrl(capture.captchaUrl || '-')}</td>
          <td class="center-cell">${boolEmoji(capture.is_datadome_challenge || capture.datadome_challenge)}</td>
          <td class="center-cell">${boolEmoji(capture.datadome || capture.is_datadome)}</td>
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
    // Generate JSON similar to Capsolver format
    let taskType;
    if (capture.isReCaptchaV3) {
      taskType = capture.is_enterprise ? 'ReCaptchaV3EnterpriseTaskProxyless' : 'ReCaptchaV3TaskProxyLess';
    } else {
      taskType = capture.is_enterprise ? 'ReCaptchaV2EnterpriseTaskProxyLess' : 'ReCaptchaV2TaskProxyLess';
    }
    
    const jsonData = {
      clientKey: 'YOUR_API_KEY',
      task: {
        type: taskType,
        websiteURL: capture.site_url,
        websiteKey: capture.site_key
      }
    };
    
    if (capture.anchor) {
      jsonData.task.anchor = capture.anchor;
    }
    
    if (capture.reload) {
      jsonData.task.reload = capture.reload;
    }
    
    if (capture.apiDomain) {
      jsonData.task.apiDomain = capture.apiDomain;
    }
    
    if (capture.isReCaptchaV3 && capture.action) {
      jsonData.task.pageAction = capture.action;
    }
    
    if (capture.isInvisible) {
      jsonData.task.isInvisible = true;
    }
    
    if (capture.is_s_required) {
      jsonData.task.enterprisePayload = {
        s: 'SOME_ADDITIONAL_TOKEN'
      };
    }
    
    return JSON.stringify(jsonData, null, 2);
  }
  
  clearCaptures() {
    this.capturedParams = [];
    this.displayCapturedParameters();
    
    // Clear in background script too
    chrome.runtime.sendMessage({ action: 'clearCaptures' });
  }
  
  async loadCapturedParameters() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = await chrome.runtime.sendMessage({
      action: 'getCapturedParameters',
      tabId: tab.id
    });
    
    
    if (response && response.captures && response.captures.length > 0) {
      this.capturedParams = response.captures;
      this.displayCapturedParameters();
    } else {
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
    
    // Create one tag per type (max 3 types shown)
    const matchTypes = Object.keys(matchesByType);
    const matchTags = matchTypes.slice(0, 3).map(type => {
      const typeClass = this.getMatchTypeClass(type);
      const typeName = this.getMatchTypeDisplayName(type);
      return `<span class="match-tag ${typeClass}">${typeName}</span>`;
    }).join('');
    
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
      'dom': 'DOM Elements',
      'global': 'Global'
    };
    return typeNames[type] || type;
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
      case 'global':
        category = 'Global';
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

  loadExportTab() {
    // Export tab shows "Coming Soon" message - no functionality needed yet
  }

  populateExportDetectionList() {
    const exportDetectionList = document.getElementById('exportDetectionList');
    exportDetectionList.innerHTML = '';
    
    this.currentResults.forEach((detection, index) => {
      const detectionItem = document.createElement('div');
      detectionItem.className = 'detection-select-item';
      detectionItem.dataset.detectionIndex = index;
      detectionItem.innerHTML = `
        <span class="detection-name">${detection.name}</span>
        <span class="detection-confidence">${detection.confidence}% confidence</span>
      `;
      
      detectionItem.addEventListener('click', () => {
        // Remove previous selection
        document.querySelectorAll('#exportDetectionList .detection-select-item').forEach(item => {
          item.classList.remove('selected');
        });
        
        // Add selection to clicked item
        detectionItem.classList.add('selected');
        
        // Store selected detection
        this.selectedExportDetection = detection;
        
        // Clear any previous preview
        this.clearExportPreview();
      });
      
      // Select first detection by default
      if (index === 0) {
        detectionItem.classList.add('selected');
        this.selectedExportDetection = detection;
      }
      
      exportDetectionList.appendChild(detectionItem);
    });
  }
  
  setupExportInterface() {
    // Format selector event listeners
    const formatOptions = document.querySelectorAll('input[name="exportFormat"]');
    const codeLanguageSelector = document.getElementById('codeLanguageSelector');
    
    formatOptions.forEach(option => {
      option.addEventListener('change', (e) => {
        if (e.target.value === 'code') {
          codeLanguageSelector.style.display = 'block';
        } else {
          codeLanguageSelector.style.display = 'none';
        }
        this.selectedFormat = e.target.value;
        this.clearExportPreview();
      });
    });
    
    // Language selector
    const codeLanguageElement = document.getElementById('codeLanguage');
    if (codeLanguageElement) {
      codeLanguageElement.addEventListener('change', (e) => {
        this.selectedLanguage = e.target.value;
        this.clearExportPreview();
      });
    }
    
    // Export action buttons
    const previewExportBtn = document.getElementById('previewExport');
    if (previewExportBtn) {
      previewExportBtn.addEventListener('click', () => this.previewExport());
    }
    
    const copyExportBtn = document.getElementById('copyExport');
    if (copyExportBtn) {
      copyExportBtn.addEventListener('click', () => this.copyExport());
    }
    
    const downloadExportBtn = document.getElementById('downloadExport');
    if (downloadExportBtn) {
      downloadExportBtn.addEventListener('click', () => this.downloadExport());
    }
    
    // Initialize
    this.selectedFormat = 'json';
    this.selectedLanguage = 'javascript';
    this.selectedProvider = null;
  }

  clearExportPreview() {
    const exportPreview = document.getElementById('exportPreview');
    exportPreview.style.display = 'none';
    
    // Enable/disable buttons based on selection
    const buttons = document.querySelectorAll('.export-btn:not(.preview-btn)');
    buttons.forEach(btn => btn.disabled = true);
  }

  async loadProviderButtons() {
    try {
      // Check if providers are already cached
      if (this.cachedProviders) {
        const data = { providers: this.cachedProviders };
        this.renderProviderButtons(data);
        return;
      }
      
      // Load from modular provider structure
      const response = await fetch(chrome.runtime.getURL('providers/index.json'));
      const index = await response.json();
      
      // Load individual provider files
      const providers = {};
      for (const [id, config] of Object.entries(index.providers)) {
        try {
          const providerResponse = await fetch(chrome.runtime.getURL(`providers/${config.file}`));
          providers[id] = await providerResponse.json();
        } catch (e) {
          console.error(`Failed to load provider ${id}:`, e);
        }
      }
      
      // Cache the providers
      this.cachedProviders = providers;
      
      const data = { providers };
      this.renderProviderButtons(data);
      
    } catch (error) {
      console.error('Failed to load export providers:', error);
    }
  }

  renderProviderButtons(data) {
    const providerGrid = document.getElementById('providerQuickGrid');
    if (!providerGrid) return;
    
    providerGrid.innerHTML = '';
    
    Object.entries(data.providers).forEach(([key, provider]) => {
      const button = document.createElement('button');
      button.className = 'provider-quick-btn';
      button.innerHTML = provider.name;
      button.dataset.providerId = key;
      button.addEventListener('click', (e) => this.selectProvider(e.target, key));
      providerGrid.appendChild(button);
    });
    
    // Add generic export button
    const genericBtn = document.createElement('button');
    genericBtn.className = 'provider-quick-btn';
    genericBtn.innerHTML = 'Generic JSON';
    genericBtn.dataset.providerId = 'generic';
    genericBtn.addEventListener('click', (e) => this.selectProvider(e.target, 'generic'));
    providerGrid.appendChild(genericBtn);
  }

  selectProvider(element, providerId) {
    // Remove selected class from all buttons and cards
    document.querySelectorAll('.provider-quick-btn, .provider-card').forEach(el => {
      el.classList.remove('selected');
    });
    
    // Add selected class to clicked element
    element.classList.add('selected');
    this.selectedProvider = providerId;
    
    // Clear preview if in export modal
    if (document.getElementById('exportModal').style.display === 'flex') {
      this.clearExportPreview();
    }
    
    // Show provider config if in settings
    if (element.classList.contains('provider-card')) {
      setTimeout(() => this.showProviderConfig(providerId), 300);
    }
  }

  loadExportSummary() {
    const exportSummary = document.getElementById('exportSummary');
    exportSummary.innerHTML = `
      <h5>Current Detections</h5>
      ${this.currentResults.map(result => `
        <div class="detection-summary-item">
          <span class="name">${result.name}</span>
          <span class="confidence">${result.confidence}%</span>
        </div>
      `).join('')}
    `;
  }

  previewExport() {
    if (!this.selectedProvider) {
      this.showToast('Please select a provider first', 'error');
      return;
    }
    
    this.generateExportData(this.selectedProvider, (exportData) => {
      const exportPreview = document.getElementById('exportPreview');
      const exportOutput = document.getElementById('exportOutput');
      
      let formattedData;
      if (this.selectedFormat === 'json') {
        formattedData = JSON.stringify(exportData, null, 2);
      } else {
        formattedData = this.generateCodeSnippet(exportData, this.selectedLanguage);
      }
      
      exportOutput.value = formattedData;
      exportPreview.style.display = 'block';
      
      // Enable copy and download buttons
      const buttons = document.querySelectorAll('.export-btn:not(.preview-btn)');
      buttons.forEach(btn => btn.disabled = false);
      
      this.currentExportData = formattedData;
    });
  }

  copyExport() {
    if (this.currentExportData) {
      navigator.clipboard.writeText(this.currentExportData).then(() => {
        this.showToast('Export data copied to clipboard!');
      }).catch(err => {
        this.showToast('Failed to copy export data', 'error');
      });
    }
  }

  downloadExport() {
    if (this.currentExportData) {
      const filename = this.getExportFilename();
      const blob = new Blob([this.currentExportData], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      this.showToast(`Export downloaded as ${filename}`);
    }
  }

  getExportFilename() {
    const provider = this.selectedProvider || 'generic';
    const format = this.selectedFormat;
    const timestamp = new Date().toISOString().slice(0, 10);
    
    let extension = format === 'json' ? 'json' : this.getCodeFileExtension();
    return `${provider}_export_${timestamp}.${extension}`;
  }

  getCodeFileExtension() {
    const extensions = {
      'javascript': 'js',
      'python': 'py',
      'curl': 'sh',
      'php': 'php'
    };
    return extensions[this.selectedLanguage] || 'txt';
  }

  generateExportData(providerId, callback) {
    chrome.runtime.sendMessage({
      action: 'exportData',
      tabId: this.currentTabId,
      provider: providerId
    }, (response) => {
      if (response.error) {
        this.showToast('Export failed: ' + response.error, 'error');
      } else {
        callback(response.data);
      }
    });
  }

  generateCodeSnippet(data, language) {
    switch (language) {
      case 'javascript':
        return this.generateJavaScriptCode(data);
      case 'python':
        return this.generatePythonCode(data);
      case 'curl':
        return this.generateCurlCode(data);
      case 'php':
        return this.generatePhpCode(data);
      default:
        return JSON.stringify(data, null, 2);
    }
  }

  generateJavaScriptCode(data) {
    return `// ${data.provider || 'Generic'} API Request
const apiData = ${JSON.stringify(data, null, 2)};

// Using fetch
fetch('API_ENDPOINT_HERE', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(apiData)
})
.then(response => response.json())
.then(data => {
})
.catch(error => {
  console.error('Error:', error);
});`;
  }

  generatePythonCode(data) {
    return `# ${data.provider || 'Generic'} API Request
import requests
import json

api_data = ${JSON.stringify(data, null, 2).replace(/"/g, "'")}

response = requests.post(
    'API_ENDPOINT_HERE',
    headers={'Content-Type': 'application/json'},
    json=api_data
)

if response.status_code == 200:
    result = response.json()
    print("Success:", result)
else:
    print("Error:", response.status_code, response.text)`;
  }

  generateCurlCode(data) {
    return `#!/bin/bash
# ${data.provider || 'Generic'} API Request

curl -X POST 'API_ENDPOINT_HERE' \\
  -H 'Content-Type: application/json' \\
  -d '${JSON.stringify(data).replace(/'/g, "\\'")}'`;
  }

  generatePhpCode(data) {
    return `<?php
// ${data.provider || 'Generic'} API Request

$api_data = json_decode('${JSON.stringify(data)}', true);

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, 'API_ENDPOINT_HERE');
curl_setopt($ch, CURLOPT_POST, 1);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($api_data));
curl_setopt($ch, CURLOPT_HTTPHEADER, array(
    'Content-Type: application/json'
));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

$response = curl_exec($ch);
curl_close($ch);

$result = json_decode($response, true);
if ($result) {
    echo "Success: " . print_r($result, true);
} else {
    echo "Error: " . $response;
}
?>`;
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
    if (!container) {
      return;
    }
    
    // Reload blacklist from storage to ensure it's up to date
    const result = await chrome.storage.sync.get(['blacklist']);
    this.blacklist = result.blacklist || [];
    
    container.innerHTML = '';
    
    if (this.blacklist.length === 0) {
      container.innerHTML = '<div class="empty-blacklist" style="color: var(--text-muted); padding: 10px; text-align: center;">No domains in blacklist</div>';
      return;
    }
    
    this.blacklist.forEach((domain, index) => {
      const item = document.createElement('div');
      item.className = 'blacklist-item';
      item.innerHTML = `
        <span class="blacklist-domain">${domain}</span>
        <button class="remove-blacklist-btn" data-index="${index}">
          <svg width="12" height="12" viewBox="0 0 24 24">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor"/>
          </svg>
        </button>
      `;
      
      item.querySelector('.remove-blacklist-btn').addEventListener('click', () => {
        this.removeBlacklistItem(index);
      });
      
      container.appendChild(item);
    });
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

  getMatchTypeClass(type) {
    const typeMap = {
      'cookie': 'match-type-cookie',
      'header': 'match-type-header',
      'script': 'match-type-script',
      'dom': 'match-type-dom',
      'global': 'match-type-global',
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
      case 'global':
        return match.content ? `${match.content.substring(0, 20)}... (Global)` : 'Global';
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

  // Export methods removed

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

  // Custom Rules Management
  async loadCustomRules() {
    try {
      const result = await chrome.storage.local.get(['customRules', 'rulesVersion']);
      this.customRules = result.customRules || [];
      
      // Force reset if version is outdated or icons are missing
      const CURRENT_VERSION = 5; // Increment this to force reset - Added all missing detectors, removed detectors.json
      const needsReset = result.rulesVersion !== CURRENT_VERSION || 
                        this.customRules.some(rule => rule.isDefault && !rule.icon) ||
                        this.customRules.length === 0;
      
      // Pre-populate with default detectors if reset needed
      if (needsReset) {
        this.customRules = [];
        await this.populateDefaultRules();
        await chrome.storage.local.set({ rulesVersion: CURRENT_VERSION });
      } else {
        // Update existing default rules with icons if missing
        await this.updateDefaultRulesIcons();
        // Also ensure all rules have at least a default icon
        await this.ensureAllRulesHaveIcons();
      }
      
      // Store all rules and initialize filtered rules
      this.allRules = [...this.customRules];
      this.filteredRules = [...this.customRules];
      
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
      const originalIndex = this.customRules.indexOf(rule);
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
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs.length === 0) {
        return;
      }

      
      // Use the same data source as main detection to ensure consistency
      const response = await chrome.runtime.sendMessage({
        action: 'getTabResults',
        tabId: tabs[0].id
      });
      
      
      if (response && response.results && Array.isArray(response.results)) {
        response.results.forEach((result, index) => {
        });
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
    const advancedSection = document.getElementById('capturedParameters');  // Fixed ID
    const advancedEmpty = document.getElementById('advancedEmpty');
    const tableBody = document.getElementById('captureTableBody');  // Fixed ID based on HTML
    const subtitle = document.querySelector('.capture-subtitle');  // Fixed selector
    const triggerBadge = document.getElementById('captchaTriggerBadge');

    if (!advancedSection || !advancedEmpty || !tableBody) {
      return;
    }

    // Debug: Log what we received
    
    // Ensure advancedResults is an array
    if (!Array.isArray(advancedResults)) {
      advancedResults = [];
    }
    
    if (advancedResults.length > 0) {
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

    // Check for any reCAPTCHA detection (including all forms)
    const recaptchaResults = advancedResults.filter(r => {
      if (!r) return false;
      
      // More lenient check - normalize both name and key
      const normalizedName = (r.name || '').toLowerCase().replace(/[\s-_]/g, '');
      const normalizedKey = (r.key || '').toLowerCase().replace(/[\s-_]/g, '');
      
      // Check if any of these conditions match
      const isRecaptcha = 
        normalizedName.includes('recaptcha') ||
        normalizedKey.includes('recaptcha') ||
        normalizedKey === 'recaptcha' ||
        normalizedName.includes('googlerecaptcha') ||
        r.name === 'Google reCAPTCHA' ||
        r.name === 'reCAPTCHA';
      
      if (isRecaptcha) {
        console.log('🛡️ Found reCAPTCHA result:', {
          name: r.name,
          key: r.key,
          normalizedName,
          normalizedKey,
          hasAdvancedParams: !!r.advancedParameters,
          advancedParams: r.advancedParameters
        });
      }
      
      return isRecaptcha;
    });
    

    if (recaptchaResults.length === 0) {
      // No reCAPTCHA detected - show empty state and hide capture interface
      this.showAdvancedEmptyState();
      return;
    }
    
    // Filter network captured results for the table display
    const networkCapturedResults = advancedResults.filter(r => 
      r.advancedParameters && r.advancedParameters.network_captured
    );

    // reCAPTCHA detected - hide empty state and show capture interface
    const captureSelectionSection = document.getElementById('captureSelectionSection');
    const captureTermsSection = document.getElementById('captureTermsSection');
    const captureHeader = document.querySelector('.capture-header');
    
    
    // Hide empty state - make sure it stays hidden
    if (advancedEmpty) {
      advancedEmpty.style.display = 'none !important';
      advancedEmpty.style.visibility = 'hidden';
      advancedEmpty.style.setProperty('display', 'none', 'important');
    }
    
    // Only show captured parameters table if we have actual captured data
    if (advancedSection) {
      if (networkCapturedResults.length > 0) {
        // Only show if we have captured parameters
        advancedSection.style.display = 'block';
        advancedSection.style.visibility = 'visible';
      } else {
        // Hide the table - no captures yet
        advancedSection.style.display = 'none';
        advancedSection.style.visibility = 'hidden';
      }
    }
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
        if (captureTermsSection) {
          captureTermsSection.style.display = 'none';
          captureTermsSection.style.visibility = 'hidden';
        }
        if (captureSelectionSection) {
          captureSelectionSection.style.display = 'block';
          captureSelectionSection.style.visibility = 'visible';
          
          // Set the current results before initializing
          this.currentResults = recaptchaResults; // Use the detected reCAPTCHA results
          
          // IMPORTANT: Initialize capture mode to set up event listeners!
          // This also calls loadDetectionsForCapture() internally
          this.initializeCaptureMode();
        }
      } else {
        if (captureTermsSection) {
          captureTermsSection.style.display = 'block';
          captureTermsSection.style.visibility = 'visible';
        }
        if (captureSelectionSection) {
          captureSelectionSection.style.display = 'none';
          captureSelectionSection.style.visibility = 'hidden';
        }
      }
    });
    
    // Update subtitle based on what we have
    if (subtitle) {
      if (networkCapturedResults.length > 0) {
        subtitle.textContent = `Captured ${networkCapturedResults.length} captcha configuration${networkCapturedResults.length > 1 ? 's' : ''}`;
      } else {
        subtitle.textContent = `reCAPTCHA detected - click "Start Capturing" to capture parameters`;
      }
    }
    
    // Clear existing table rows
    tableBody.innerHTML = '';

    // Get the table header row
    const tableHeaders = document.querySelector('#captureTable thead tr');
    
    // Determine captcha type and set appropriate headers
    if (networkCapturedResults.length > 0) {
      const firstResult = networkCapturedResults[0];
      
      if (firstResult.name === 'reCAPTCHA' && tableHeaders) {
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
        networkCapturedResults.forEach(result => {
          if (result.name === 'reCAPTCHA') {
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
    div.className = 'custom-rule-item';
    
    const methods = [];
    if (rule.cookies && rule.cookies.length) methods.push('Cookies');
    if (rule.headers && rule.headers.length) methods.push('Headers');
    if (rule.urls && rule.urls.length) methods.push('URLs');
    if (rule.scripts && rule.scripts.length) methods.push('Scripts');
    
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
      <div class="rule-category" ${categoryStyle}>${rule.category}</div>
      <div class="rule-methods">
        ${methods.map(method => `<span class="rule-method-badge">${method}</span>`).join('')}
      </div>
      <div class="rule-updated">
        <span class="rule-updated-label">Last Updated:</span>
        <span class="rule-updated-time" title="${rule.lastUpdated ? new Date(rule.lastUpdated).toLocaleString() : 'Never'}">${formatLastUpdated(rule.lastUpdated)}</span>
      </div>
    `;
    
    const deleteBtn = div.querySelector('.delete-rule-btn');
    deleteBtn.addEventListener('click', () => this.deleteCustomRule(index));
    
    const editBtn = div.querySelector('.edit-rule-btn');
    editBtn.addEventListener('click', () => this.editCustomRule(rule, index));
    
    return div;
  }

  editCustomRule(rule, index) {
    // Store the index for updating instead of creating
    this.editingRuleIndex = index;
    
    // Pre-populate the add rule modal with existing rule data
    document.getElementById('ruleName').value = rule.name || '';
    document.getElementById('ruleCategory').value = rule.category || 'Anti-Bot';
    
    const iconSelector = document.getElementById('ruleIcon');
    const iconPreview = document.getElementById('iconPreview');
    
    // Handle custom uploaded icons
    if (rule.icon && rule.icon.startsWith('custom_icon_')) {
      // Add option if it doesn't exist
      let option = iconSelector.querySelector(`option[value="${rule.icon}"]`);
      if (!option) {
        option = document.createElement('option');
        option.value = rule.icon;
        option.text = 'Custom Uploaded';
        iconSelector.appendChild(option);
      }
      iconSelector.value = rule.icon;
    } else {
      iconSelector.value = rule.icon || 'custom.png';
    }
    
    // Update icon preview
    if (iconPreview) {
      this.getProviderIcon(rule.icon || 'custom.png').then(src => iconPreview.src = src);
    }
    
    // Load color
    const colorPicker = document.getElementById('ruleColor');
    const colorPreview = document.getElementById('colorPreview');
    if (rule.color && colorPicker && colorPreview) {
      colorPicker.value = rule.color;
      colorPreview.style.background = rule.color;
    }
    
    // Clear rule inputs first
    document.getElementById('cookieRules').innerHTML = '';
    document.getElementById('headerRules').innerHTML = '';
    document.getElementById('urlRules').innerHTML = '';
    document.getElementById('scriptRules').innerHTML = '';
    
    // Helper function to populate a rule section
    const populateRuleSection = (sectionId, rules, type) => {
      const container = document.getElementById(sectionId);
      if (rules && rules.length > 0) {
        rules.forEach(ruleItem => {
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
      } else {
        // Add empty input group if no rules exist
        container.innerHTML = this.createRuleInputGroup(type);
      }
    };
    
    // Populate each rule section
    populateRuleSection('cookieRules', rule.cookies, 'cookie');
    populateRuleSection('headerRules', rule.headers, 'header');
    populateRuleSection('urlRules', rule.urls, 'url');
    populateRuleSection('scriptRules', rule.scripts, 'script');
    populateRuleSection('domRules', rule.dom, 'dom');
    
    // Show the modal
    this.showAddRuleModal();
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
          const detector = await detectorResponse.json();
          
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
          console.error(`🛡️ Failed to load detector ${detectorId}:`, detectorError);
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
    document.getElementById('addRuleModal').style.display = 'flex';
    this.resetAddRuleForm();
  }

  hideAddRuleModal() {
    document.getElementById('addRuleModal').style.display = 'none';
    // Clear editing state
    delete this.editingRuleIndex;
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
    
    const icon = document.getElementById('ruleIcon').value;
    const color = document.getElementById('ruleColor').value;
    
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
        // Preserve existing properties like isDefault, id, createdAt
        const existingRule = this.customRules[this.editingRuleIndex];
        this.customRules[this.editingRuleIndex] = {
          ...existingRule,
          ...rule,
          lastUpdated: now
        };
        delete this.editingRuleIndex; // Clear editing state
      } else {
        rule.createdAt = now;
        this.customRules.push(rule);
      }
      
      await chrome.storage.local.set({ customRules: this.customRules });
      
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
      'Are you sure you want to delete this custom rule? This action cannot be undone.',
      'Delete',
      'Cancel'
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
  
  showConfirmDialog(title, message, confirmText = 'Confirm', cancelText = 'Cancel') {
    return new Promise((resolve) => {
      // Create modal overlay
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay confirm-dialog-overlay';
      overlay.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;';
      
      // Create dialog
      const dialog = document.createElement('div');
      dialog.className = 'confirm-dialog';
      dialog.innerHTML = `
        <div style="background: var(--bg-primary); border-radius: 12px; padding: 24px; min-width: 320px; max-width: 420px; border: 1px solid var(--border);">
          <h3 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 18px; font-weight: 600;">${title}</h3>
          <p style="margin: 0 0 20px 0; color: var(--text-secondary); font-size: 14px; line-height: 1.5;">${message}</p>
          <div style="display: flex; gap: 12px; justify-content: flex-end;">
            <button class="cancel-btn" style="padding: 8px 16px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 6px; color: var(--text-primary); cursor: pointer; font-size: 14px; transition: all 0.2s;">
              ${cancelText}
            </button>
            <button class="confirm-btn" style="padding: 8px 16px; background: var(--error); border: none; border-radius: 6px; color: white; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.2s;">
              ${confirmText}
            </button>
          </div>
        </div>
      `;
      
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      
      // Handle clicks
      const handleClick = (confirmed) => {
        overlay.remove();
        resolve(confirmed);
      };
      
      dialog.querySelector('.cancel-btn').addEventListener('click', () => handleClick(false));
      dialog.querySelector('.confirm-btn').addEventListener('click', () => handleClick(true));
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) handleClick(false);
      });
    });
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