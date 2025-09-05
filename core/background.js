class BackgroundService {
  constructor() {
    this.detectionResults = new Map();
    this.advancedResults = new Map(); // Store advanced interaction-based results
    this.headersCache = new Map();
    this.captchaParameters = new Map(); // Store captured captcha parameters from network requests
    this.captureMode = new Map(); // Track capture mode per tab
    this.capturedParams = new Map(); // Store captured params per tab
    this.blacklist = []; // Store blacklisted domains
    this.contentScriptReady = new Map(); // Track which tabs have content script ready
    this.detectorsCache = null; // Cache for detector data
    this.detectorsCacheTime = 0; // Timestamp of last cache update
    this.CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours cache duration
    
    // Initialize modular capture managers
    this.initCaptureManagers();
    
    this.init();
    this.loadBlacklist();
    this.loadDetectorsOnce(); // Load detectors once on startup
  }
  
  async initCaptureManagers() {
    try {
      // RecaptchaCaptureManager removed - Advanced features coming soon
      // this.recaptchaManager = new RecaptchaCaptureManager();
      
    } catch (error) {
      console.error('🛡️ Background: Failed to initialize capture managers:', error);
    }
  }

  init() {
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
    chrome.tabs.onUpdated.addListener(this.handleTabUpdate.bind(this));
    chrome.tabs.onRemoved.addListener(this.handleTabRemoved.bind(this));
    chrome.tabs.onActivated.addListener(this.handleTabActivated.bind(this));
    chrome.alarms.onAlarm.addListener(this.handleAlarm.bind(this));
    
    // Add navigation listener to reset capture mode on page change
    chrome.webNavigation.onBeforeNavigate.addListener(this.handleNavigation.bind(this));
    
    // Set up webRequest listeners to capture headers
    this.setupHeaderCapture();
    
    this.setDefaultSettings();
    this.setupAutoUpdate();
  }

  setupHeaderCapture() {
    // Capture response headers
    chrome.webRequest.onHeadersReceived.addListener(
      (details) => {
        if (details.tabId > 0 && details.type === 'main_frame') {
          const headers = {};
          details.responseHeaders.forEach(header => {
            headers[header.name.toLowerCase()] = header.value;
          });
          
          this.headersCache.set(details.tabId, {
            url: details.url,
            headers: headers,
            timestamp: Date.now()
          });
          
          // Clean old headers after 5 minutes
          setTimeout(() => {
            this.headersCache.delete(details.tabId);
          }, 5 * 60 * 1000);
        }
      },
      { urls: ["<all_urls>"] },
      ["responseHeaders"]
    );

  }

  async setDefaultSettings() {
    const result = await chrome.storage.sync.get([
      'enabled', 'darkMode', 'apiEnabled', 'apiUrl', 'historyLimit'
    ]);
    
    // Batch all default settings into a single storage operation
    const defaults = {};
    
    if (result.enabled === undefined) {
      defaults.enabled = true;
    }
    if (result.darkMode === undefined) {
      defaults.darkMode = true;
    }
    if (result.apiEnabled === undefined) {
      defaults.apiEnabled = false;
    }
    if (result.apiUrl === undefined) {
      defaults.apiUrl = '';
    }
    if (result.historyLimit === undefined) {
      defaults.historyLimit = 100;
    }
    
    // Only make one storage call if there are defaults to set
    if (Object.keys(defaults).length > 0) {
      await chrome.storage.sync.set(defaults);
    }
  }

  handleMessage(request, sender, sendResponse) {
    // Handle getTabResults immediately for performance
    if (request.action === 'getTabResults') {
      console.log('🔍 BACKGROUND: getTabResults for tab', request.tabId);
      console.log('🔍 BACKGROUND: All stored tab data:', Array.from(this.detectionResults.keys()));
      
      (async () => {
        let tabData = this.detectionResults.get(request.tabId);
        let results = tabData ? tabData.results : [];
        
        // If no results in memory, try to load from storage
        if (!results || results.length === 0) {
          console.log('🔍 BACKGROUND: No results in memory, checking storage');
          const storageKey = `detection_${request.tabId}`;
          const storageData = await chrome.storage.local.get(storageKey);
          if (storageData[storageKey] && storageData[storageKey].results) {
            results = storageData[storageKey].results;
            // Also update memory cache
            this.detectionResults.set(request.tabId, storageData[storageKey]);
            console.log('🔍 BACKGROUND: Loaded results from storage:', results.length);
          }
        }
        
        console.log('🔍 BACKGROUND: Basic detection results:', results);
        console.log('🔍 BACKGROUND: Results count:', results.length);
        
        // Get advanced results from content script
        const advancedData = this.advancedResults.get(request.tabId);
        const advancedResults = advancedData ? advancedData.results : [];
        console.log('🔍 BACKGROUND: Advanced results from storage:', advancedResults);
        
        // Don't merge automatic captures - only show manual captures
        const capturedParams = []; // Empty - we don't send automatic captures
        
        // Create a map to merge results by provider
        const mergedMap = new Map();
        
        // Add detection results first
        results.forEach(result => {
          mergedMap.set(result.key || result.name.toLowerCase(), result);
        });
        
        // Merge advanced results from content script
        advancedResults.forEach(advResult => {
          const resultKey = advResult.key || advResult.name.toLowerCase();
          let existingResult = mergedMap.get(resultKey);
          
          if (existingResult) {
            // Merge advanced parameters from content script
            existingResult.advancedParameters = {
              ...existingResult.advancedParameters,
              ...advResult.advancedParameters,
              trigger: advResult.trigger || 'automatic'
            };
          } else {
            // Add new result with advanced parameters
            mergedMap.set(resultKey, advResult);
          }
        });
        
        // Merge captured parameters into matching results
        capturedParams.forEach(param => {
          const paramKey = param.provider.toLowerCase().replace(/[^a-z]/g, ''); // Normalize: "reCAPTCHA" -> "recaptcha"
          
          // Try to find matching result by various keys
          let existingResult = null;
          for (const [key, result] of mergedMap.entries()) {
            const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, '');
            const normalizedName = result.name ? result.name.toLowerCase().replace(/[^a-z]/g, '') : '';
            
            if (normalizedKey === paramKey || normalizedName === paramKey || 
                (paramKey === 'recaptcha' && (normalizedName.includes('recaptcha') || normalizedKey.includes('recaptcha')))) {
              existingResult = result;
              break;
            }
          }
          
          if (existingResult) {
            // Merge parameters into existing detection
            existingResult.advancedParameters = {
              ...existingResult.advancedParameters,
              ...param,
              network_captured: true
            };
          } else {
            // Add as new result if not detected via DOM
            mergedMap.set(paramKey, {
              name: param.provider,
              key: paramKey,
              confidence: 100,
              icon: paramKey + '.png',
              advancedParameters: {
                ...param,
                network_captured: true
              }
            });
          }
        });
        
        const mergedResults = Array.from(mergedMap.values());
        console.log('🔍 BACKGROUND: Final merged results:', mergedResults);
        
        sendResponse({ results: mergedResults });
      })();
      return true; // Will respond asynchronously
    }
    
    switch (request.action) {
      case 'contentScriptReady':
        // Mark tab as ready for popup to query
        if (sender.tab?.id) {
          this.contentScriptReady.set(sender.tab.id, true);
        }
        sendResponse({ success: true });
        return false;
        
      case 'getDetectors':
        // Ensure detectors are loaded
        if (!this.detectorsCache) {
          this.loadDetectorsOnce().then(() => {
            sendResponse({ 
              success: true, 
              detectors: this.detectorsCache 
            });
          }).catch(error => {
            console.error('🛡️ Background: Failed to load detectors:', error);
            sendResponse({ 
              success: false, 
              error: 'Failed to load detectors' 
            });
          });
          return true; // Will respond asynchronously
        } else {
          sendResponse({ 
            success: true, 
            detectors: this.detectorsCache 
          });
          return false;
        }
        
      case 'detectionResults':
        console.log('🔍 BACKGROUND: Received detectionResults from content script');
        console.log('🔍 BACKGROUND: Tab ID:', sender.tab.id);
        console.log('🔍 BACKGROUND: Results:', request.results);
        console.log('🔍 BACKGROUND: Results count:', request.results ? request.results.length : 0);
        // Check if URL is blacklisted before processing
        if (this.isUrlBlacklisted(request.url)) {
          sendResponse({ success: false, blacklisted: true });
          return false;
        }
        this.storeResults(sender.tab.id, request.results, request.url);
        this.updateBadge(sender.tab.id, request.results);
        sendResponse({ success: true });
        return false;
        
      case 'updateBlacklist':
        this.blacklist = request.blacklist || [];
        chrome.storage.sync.set({ blacklist: this.blacklist });
        sendResponse({ success: true });
        return false;
        
      case 'getHeaders':
        // Use sender.tab.id if request.tabId is not provided (for content script calls)
        const tabId = request.tabId || (sender && sender.tab ? sender.tab.id : null);
        const headersData = this.headersCache.get(tabId);
        sendResponse({ headers: headersData?.headers || {} });
        return false;
        
      case 'isContentScriptReady':
        const isReady = this.contentScriptReady.get(request.tabId) || false;
        sendResponse({ ready: isReady });
        return false;
        
      case 'clearTabResults':
        // Clear results for a specific tab (used when disabling extension)
        if (request.tabId) {
          this.clearResultsForTab(request.tabId);
          this.updateBadge(request.tabId, []);
        }
        sendResponse({ success: true });
        return false;
        
      case 'getAdvancedResults':
        // Don't send automatic captures - only manual capture mode results
        const advancedData = this.advancedResults.get(request.tabId);
        const capturedParams = []; // Empty - we don't send automatic captures
        
        // Convert captured parameters to the format expected by the popup
        const networkResults = capturedParams.map(param => ({
          name: param.provider,
          key: param.provider.toLowerCase(),
          confidence: 100,
          icon: param.provider.toLowerCase() + '.png',
          advancedParameters: {
            ...param,
            network_captured: true
          }
        }));
        
        // Combine DOM and network results
        const allResults = [
          ...(advancedData ? advancedData.results : []),
          ...networkResults
        ];
        
        sendResponse({ results: allResults });
        return false;
        
      case 'startCaptureMode':
        console.log('🎯 Starting capture mode for tab', request.tabId, 'with targets:', request.targets);
        
        // Clear any existing data for this tab before starting new capture
        // this.recaptchaManager.clearTabData(request.tabId); // Coming soon
        
        // Set capture mode with timeout and domain tracking
        const captureWindowMs = 15000; // 15 seconds capture window
        this.captureMode.set(request.tabId, {
          active: true,
          targets: request.targets || [],
          startTime: Date.now(),
          endTime: Date.now() + captureWindowMs,
          domain: sender.tab.url || '' // Store the domain where capture started
        });
        
        // Clear previous captures for this tab when starting new capture session
        this.capturedParams.set(request.tabId, []);
        
        // Show notification that capture mode is active
        chrome.notifications.create(`capture-${request.tabId}`, {
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icons/icon128.png'),
          title: 'ShieldEye Capture Mode Active',
          message: 'Refresh the page now (F5) to capture reCAPTCHA parameters. Auto-stops in 15 seconds.',
          priority: 2,
          requireInteraction: false
        });
        
        // Set timer to auto-stop capture mode
        setTimeout(() => {
          const captureConfig = this.captureMode.get(request.tabId);
          if (captureConfig && captureConfig.active) {
            this.captureMode.delete(request.tabId);
            console.log('🎯 Auto-stopping capture mode for tab', request.tabId, 'after timeout');
            
            // Check if we captured anything
            const captures = this.capturedParams.get(request.tabId) || [];
            if (captures.length === 0) {
              chrome.notifications.create(`capture-timeout-${request.tabId}`, {
                type: 'basic',
                iconUrl: chrome.runtime.getURL('icons/icon128.png'),
                title: 'Capture Mode Timed Out',
                message: 'No reCAPTCHA detected. Try refreshing the page faster next time.',
                priority: 1
              });
            }
          }
        }, captureWindowMs);
        
        console.log('🎯 Capture mode set for tab', request.tabId, 'with', captureWindowMs/1000, 'second window');
        sendResponse({ success: true });
        return false;
        
      case 'stopCaptureMode':
        if (request.tabId) {
          this.captureMode.delete(request.tabId);
          // Clear RecaptchaCaptureManager's internal storage for this tab
          // this.recaptchaManager.clearTabData(request.tabId); // Coming soon
        } else {
          // Stop for all tabs
          this.captureMode.clear();
          // Clear all RecaptchaCaptureManager's internal storage
          // this.recaptchaManager.clearAllData(); // Coming soon
        }
        sendResponse({ success: true });
        return false;
        
      case 'getCaptureMode':
        const captureMode = this.captureMode.get(request.tabId);
        sendResponse({ active: captureMode ? captureMode.active : false });
        return false;
        
      case 'getCapturedParameters':
        const captures = this.capturedParams.get(request.tabId) || [];
        console.log('🎯 getCapturedParameters for tab', request.tabId, '- returning captures:', captures);
        sendResponse({ captures });
        return false;
        
      case 'clearCaptures':
        if (request.tabId) {
          // Clear all capture-related data for the tab
          this.capturedParams.set(request.tabId, []);
          this.captchaParameters.delete(request.tabId);
          this.advancedResults.delete(request.tabId);
          console.log('🗑️ Cleared all captures for tab', request.tabId);
        } else {
          // Clear all
          this.capturedParams.clear();
          this.captchaParameters.clear();
          this.advancedResults.clear();
        }
        sendResponse({ success: true });
        return false;
        
        
      case 'autoUpdateToggled':
        this.handleAutoUpdateToggle(request.enabled);
        sendResponse({ success: true });
        return false;
        
      case 'advancedResults':
        console.log('📥 BACKGROUND: Received advancedResults from tab', sender.tab.id);
        console.log('📥 BACKGROUND: Advanced results:', request.results);
        this.storeAdvancedResults(sender.tab.id, request.results, request.url);
        sendResponse({ success: true });
        return false;
        
      case 'clearCache':
        this.clearCache().then(() => {
          sendResponse({ success: true });
        });
        return true;
        
      case 'getCacheStats':
        this.getCacheStats().then(stats => {
          sendResponse({ stats });
        });
        return true;
        
      case 'forceDetectorUpdate':
        this.updateDetectors().then(() => {
          sendResponse({ success: true });
        });
        return true;
        
      case 'getCookies':
        this.getCookiesForUrl(request.url).then(cookies => {
          sendResponse({ cookies });
        }).catch(error => {
          console.error('Failed to get cookies:', error);
          sendResponse({ cookies: [] });
        });
        return true;
        
      case 'reloadCustomRules':
        // Clear the detector cache so it will reload from Chrome storage
        this.detectorsCache = null;
        this.detectorsCacheTime = 0;
        // Also clear from storage to force full reload
        chrome.storage.local.remove(['detectors', 'detectorsTime', 'detectorsCache', 'detectorsCacheTime']).then(() => {
          return this.loadDetectorsOnce();
        }).then(() => {
          sendResponse({ success: true });
        }).catch(error => {
          console.error('🛡️ Background: Failed to reload custom rules:', error);
          sendResponse({ success: false, error: error.message });
        });
        return true;
        
      default:
        sendResponse({ error: 'Unknown action' });
        return false;
    }
  }

  handleTabUpdate(tabId, changeInfo, tab) {
    if (changeInfo.status === 'loading' || changeInfo.url) {
      // Clear results when loading new page OR when URL changes
      this.clearResultsForTab(tabId);
      this.updateBadge(tabId, []);
      this.contentScriptReady.delete(tabId); // Clear ready state
      
      // Also reset capture mode and captured params
      if (this.captureMode.has(tabId)) {
        this.captureMode.delete(tabId);
      }
      if (this.capturedParams.has(tabId)) {
        this.capturedParams.delete(tabId);
      }
      if (this.captchaParameters.has(tabId)) {
        this.captchaParameters.delete(tabId);
      }
    }
  }

  async handleTabRemoved(tabId) {
    this.clearResultsForTab(tabId);
    this.headersCache.delete(tabId);
    this.captchaParameters.delete(tabId);
    this.captureMode.delete(tabId); // Clear capture mode
    this.capturedParams.delete(tabId); // Clear captured params
    this.contentScriptReady.delete(tabId); // Clear ready state
    // this.recaptchaManager.clearTabData(tabId); // Clear RecaptchaCaptureManager data - Coming soon
    
    // Also clean up storage for this tab
    try {
      const storageKey = `detection_${tabId}`;
      await chrome.storage.local.remove([storageKey]);
      console.log('🔍 BACKGROUND: Cleaned up storage for tab', tabId);
    } catch (error) {
      console.error('🔍 BACKGROUND: Failed to clean storage for tab', tabId, error);
    }
  }
  
  handleTabActivated(activeInfo) {
    // When user switches tabs, stop capture mode on the previous tab
    // This prevents capture mode from staying active on background tabs
    const { tabId } = activeInfo;
    
    // Get all tabs with active capture mode
    for (const [captureTabId, captureConfig] of this.captureMode.entries()) {
      if (captureTabId !== tabId && captureConfig.active) {
        console.log('🎯 Stopping capture mode on tab', captureTabId, 'due to tab switch');
        this.captureMode.delete(captureTabId);
      }
    }
  }
  
  handleNavigation(details) {
    // Only handle main frame navigations (not iframes)
    if (details.frameId === 0) {
      const tabId = details.tabId;
      
      // Check if capture mode is active for this tab
      const captureMode = this.captureMode.get(tabId);
      
      // Check if we're navigating to a different domain
      let isDomainChange = false;
      if (captureMode && captureMode.domain && details.url) {
        try {
          const currentDomain = new URL(details.url).hostname;
          const captureDomain = new URL(captureMode.domain).hostname;
          isDomainChange = currentDomain !== captureDomain;
          
          if (isDomainChange) {
            console.log('🎯 Domain changed from', captureDomain, 'to', currentDomain, '- stopping capture mode');
          }
        } catch (e) {
          // If URL parsing fails, assume domain changed to be safe
          isDomainChange = true;
        }
      }
      
      if (captureMode && captureMode.active && !isDomainChange) {
        // Keep capture mode active through navigation/refresh on same domain
        // This allows capturing parameters when the page reloads to trigger captcha
        console.log('🎯 Keeping capture mode active for tab', tabId, 'during same-domain navigation');
        
        // Don't clear capturedParams - we want to accumulate captures
        // User must manually stop capture or close tab to clear
      } else {
        // Domain changed or normal navigation - clear capture-related data
        if (isDomainChange || !captureMode || !captureMode.active) {
          console.log('🎯 Clearing capture data for tab', tabId, isDomainChange ? 'due to domain change' : 'normal navigation');
          
          // Stop capture mode if domain changed
          if (isDomainChange) {
            this.captureMode.delete(tabId);
          }
          
          // Clear captured params
          if (this.capturedParams.has(tabId)) {
            this.capturedParams.delete(tabId);
          }
          
          // Clear RecaptchaCaptureManager internal data
          // this.recaptchaManager.clearTabData(tabId); // Coming soon
          
          // Clear advanced results
          if (this.advancedResults.has(tabId)) {
            this.advancedResults.delete(tabId);
          }
        }
      }
      
      // Always clear normal captcha parameters on navigation
      if (this.captchaParameters.has(tabId)) {
        this.captchaParameters.delete(tabId);
      }
      
      // Clear modular manager data for this tab ONLY if not in capture mode or domain changed
      // Coming soon - RecaptchaCaptureManager integration
      // if (this.recaptchaManager && (isDomainChange || !(captureMode && captureMode.active))) {
      //   this.recaptchaManager.clearTabData(tabId);
      // }
    }
  }

  async storeResults(tabId, results, url) {
    // Store results using tabId + URL combination for per-URL detection
    const key = `${tabId}:${url}`;
    const detectionData = {
      results,
      url,
      timestamp: Date.now(),
      tabId
    };
    
    this.detectionResults.set(key, detectionData);
    
    // Also maintain a reference by tabId for easy lookup
    this.detectionResults.set(tabId, {
      results,
      url,
      timestamp: Date.now()
    });
    
    // Store in chrome.storage.local for persistence
    try {
      const storageKey = `detection_${tabId}`;
      await chrome.storage.local.set({
        [storageKey]: {
          results,
          url,
          timestamp: Date.now()
        }
      });
      console.log('🔍 BACKGROUND: Stored detection results in storage for tab', tabId);
    } catch (error) {
      console.error('🔍 BACKGROUND: Failed to store results in storage:', error);
    }
  }

  storeAdvancedResults(tabId, results, url) {
    // Store advanced results using tabId + URL combination
    const key = `${tabId}:${url}`;
    this.advancedResults.set(key, {
      results,
      url,
      timestamp: Date.now(),
      tabId
    });
    
    // Also maintain a reference by tabId for easy lookup
    this.advancedResults.set(tabId, {
      results,
      url,
      timestamp: Date.now()
    });
  }

  updateBadge(tabId, results) {
    const count = results.length;
    const text = count > 0 ? count.toString() : '';
    const color = count > 0 ? '#ff6b6b' : '#808080';
    
    chrome.action.setBadgeText({
      tabId: tabId,
      text: text
    });
    
    chrome.action.setBadgeBackgroundColor({
      tabId: tabId,
      color: color
    });
  }







  async setupAutoUpdate() {
    try {
      // Check if auto-update is enabled (default: true)
      const result = await chrome.storage.sync.get(['autoUpdateEnabled']);
      if (result.autoUpdateEnabled !== false) {
        // Set up alarm for every 3 hours
        chrome.alarms.create('updateDetectors', {
          delayInMinutes: 1, // First check after 1 minute
          periodInMinutes: 180 // Then every 3 hours (180 minutes)
        });
        
      }
    } catch (error) {
      console.error('Failed to setup auto-update:', error);
    }
  }

  async handleAlarm(alarm) {
    if (alarm.name === 'updateDetectors') {
      await this.updateDetectors();
    }
  }

  async updateDetectors() {
    try {
      
      // Get detector update URL from settings or use default
      const settings = await chrome.storage.sync.get(['detectorUpdateUrl']);
      const remoteUrl = settings.detectorUpdateUrl || 
        'https://raw.githubusercontent.com/shieldeye/detectors/main/detectors.json';
      
      // Get last update timestamp
      const result = await chrome.storage.local.get(['lastDetectorUpdate']);
      const lastUpdate = result.lastDetectorUpdate || 0;
      const now = Date.now();
      
      // Check if enough time has passed (minimum 1 hour to avoid spam)
      if (now - lastUpdate < 60 * 60 * 1000) {
        return;
      }
      
      // Fetch remote detectors
      const response = await fetch(remoteUrl, {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache',
          'If-Modified-Since': new Date(lastUpdate).toUTCString()
        }
      });
      
      if (!response.ok) {
        await chrome.storage.local.set({ lastDetectorUpdate: now });
        return;
      }
      
      const remoteDetectors = await response.json();
      
      // Load current detectors for comparison
      const currentResponse = await fetch(chrome.runtime.getURL('detectors.json'));
      const currentDetectors = await currentResponse.json();
      
      // Compare versions or hashes to see if update is needed
      const remoteVersion = remoteDetectors.version || JSON.stringify(remoteDetectors).length;
      const currentVersion = currentDetectors.version || JSON.stringify(currentDetectors).length;
      
      if (remoteVersion !== currentVersion) {
        // Store updated detectors in storage
        await chrome.storage.local.set({ 
          updatedDetectors: remoteDetectors,
          detectorsUpdated: true,
          lastDetectorUpdate: now
        });
        
        
        // Clear the cached detectors to force reload
        this.detectorsCache = null;
        this.detectorsCacheTime = 0;
        await chrome.storage.local.remove(['detectorsCache', 'detectorsCacheTime']);
        
        // Reload detectors with the new data
        await this.loadDetectorsOnce();
        
        // Optionally notify user (could show notification)
        this.notifyDetectorUpdate();
        
        // Trigger re-analysis of current tabs
        this.triggerReanalysis();
      } else {
        await chrome.storage.local.set({ lastDetectorUpdate: now });
      }
      
    } catch (error) {
      console.error('Failed to update detectors:', error);
      // Store failed attempt to avoid repeated failures
      await chrome.storage.local.set({ lastDetectorUpdate: Date.now() });
    }
  }

  notifyDetectorUpdate() {
    // Create a simple notification or badge update
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
    
    // Clear the notification after 10 seconds
    setTimeout(() => {
      chrome.action.setBadgeText({ text: '' });
    }, 10000);
  }

  async triggerReanalysis() {
    try {
      // Get all active tabs
      const tabs = await chrome.tabs.query({ active: true });
      
      // Send message to content scripts to re-analyze with new detectors
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { 
          action: 'detectorsUpdated',
          reload: true 
        }).catch(() => {
          // Content script might not be loaded, ignore error
        });
      });
    } catch (error) {
      console.error('Failed to trigger re-analysis:', error);
    }
  }

  async handleAutoUpdateToggle(enabled) {
    try {
      if (enabled) {
        // Re-enable auto-update alarms
        chrome.alarms.create('updateDetectors', {
          delayInMinutes: 1,
          periodInMinutes: 180
        });
      } else {
        // Clear auto-update alarms
        chrome.alarms.clear('updateDetectors');
      }
    } catch (error) {
      console.error('Failed to handle auto-update toggle:', error);
    }
  }

  clearResultsForTab(tabId) {
    // Clear all results for a specific tab (both tabId-based and tabId:URL-based entries)
    const keysToDelete = [];
    
    for (const key of this.detectionResults.keys()) {
      if (key === tabId || key.toString().startsWith(`${tabId}:`)) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => {
      this.detectionResults.delete(key);
    });
    
    const advancedKeysToDelete = [];
    for (const key of this.advancedResults.keys()) {
      if (key === tabId || key.toString().startsWith(`${tabId}:`)) {
        advancedKeysToDelete.push(key);
      }
    }
    
    advancedKeysToDelete.forEach(key => {
      this.advancedResults.delete(key);
    });
    
    // Also clear captured captcha parameters
    this.captchaParameters.delete(tabId);
  }

  calculateOverallConfidence(detections) {
    if (detections.length === 0) return 0;
    const sum = detections.reduce((acc, det) => acc + det.confidence, 0);
    return Math.round(sum / detections.length);
  }

  async loadBlacklist() {
    const result = await chrome.storage.sync.get(['blacklist']);
    this.blacklist = result.blacklist || [];
  }

  isUrlBlacklisted(url) {
    if (!url || this.blacklist.length === 0) return false;
    
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      
      return this.blacklist.some(pattern => {
        const patternLower = pattern.toLowerCase();
        
        // Handle wildcard patterns (*.example.com)
        if (patternLower.startsWith('*.')) {
          const domain = patternLower.substring(2);
          return hostname === domain || hostname.endsWith('.' + domain);
        }
        
        // Exact match
        return hostname === patternLower;
      });
    } catch (e) {
      console.error('Error checking blacklist:', e);
      return false;
    }
  }


  // Cache Management
  async clearCache() {
    this.detectionResults.clear();
    this.advancedResults.clear();
    this.headersCache.clear();
    this.captchaParameters.clear();
    await chrome.storage.local.remove(['cachedDetections', 'lastDetectorUpdate']);
  }

  async getCacheStats() {
    return {
      detectionResults: this.detectionResults.size,
      advancedResults: this.advancedResults.size,
      headersCache: this.headersCache.size,
      captchaParameters: this.captchaParameters.size,
    };
  }

  /**
   * Get all cookies for a specific URL including HttpOnly cookies
   */
  async getCookiesForUrl(url) {
    try {
      const cookies = await chrome.cookies.getAll({ url });
      return cookies.map(cookie => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        sameSite: cookie.sameSite
      }));
    } catch (error) {
      console.error('Error getting cookies:', error);
      return [];
    }
  }
  
  async loadDetectorsOnce() {
    try {
      // IMPORTANT: Data flow for detectors
      // 1. First load: Read from JSON files → Store in chrome.storage.local
      // 2. All subsequent usage: Read from chrome.storage.local only
      // 3. Colors are defined in each detector's JSON file
      // 4. All detector data (including colors) comes from storage
      
      // Load base detectors first, then merge custom rules
      
      // Check cached detectors from Chrome storage
      // Using 'detectors' as the single source of truth for all detector data
      const cached = await chrome.storage.local.get(['detectors', 'detectorsTime']);
      const now = Date.now();
      const isCacheValid = cached.detectors && 
                          cached.detectorsTime && 
                          (now - cached.detectorsTime) < this.CACHE_DURATION;
      
      if (isCacheValid) {
        // Wrap the detectors object back into the expected format
        this.detectorsCache = { detectors: cached.detectors };
        this.detectorsCacheTime = cached.detectorsTime;
        return;
      }
      
      
      // Check for updated detectors from auto-update first
      const storageResult = await chrome.storage.local.get(['updatedDetectors', 'detectorsUpdated']);
      
      let detectorsData = { detectors: {} };
      
      if (storageResult.detectorsUpdated && storageResult.updatedDetectors) {
        detectorsData = storageResult.updatedDetectors;
      } else {
        // Load detectors from modular structure
        
        try {
          // Load the index file
          const indexResponse = await fetch(chrome.runtime.getURL('detectors/index.json'));
          const indexData = await indexResponse.json();
          
          // Load each detector file in parallel for better performance
          const detectorPromises = Object.entries(indexData.detectors).map(async ([detectorId, config]) => {
            try {
              const detectorUrl = chrome.runtime.getURL(`detectors/${config.file}`);
              const detectorResponse = await fetch(detectorUrl);
              
              if (!detectorResponse.ok) {
                throw new Error(`HTTP ${detectorResponse.status}: ${detectorResponse.statusText} for ${detectorUrl}`);
              }
              
              const detector = await detectorResponse.json();
              
              if (!detector.icon) {
                console.warn(`⚠️ Detector ${detectorId} has no icon property in JSON`);
              }
              
              return {
                id: detectorId,
                data: {
                  name: detector.name,
                  category: detector.category,
                  confidence: detector.confidence || 100,
                  website: detector.website,
                  icon: detector.icon || 'custom.png',
                  color: detector.color || this.getCategoryColor(detector.category),
                  lastUpdated: detector.lastUpdated,
                  version: detector.version,
                  detection: detector.detection || {}
                }
              };
            } catch (e) {
              console.error(`❌ Failed to load detector ${detectorId} from ${config.file}:`, e.message);
              return null;
            }
          });
          
          const results = await Promise.all(detectorPromises);
          
          // Build detectors object from results
          results.forEach(result => {
            if (result) {
              detectorsData.detectors[result.id] = result.data;
            }
          });
          
        } catch (error) {
          console.error('🛡️ Background: Failed to load detectors:', error);
          // Use fallback detectors
          detectorsData.detectors = {
            cloudflare: { 
              name: "Cloudflare", 
              category: "Anti-Bot", 
              color: "#F48120", // Cloudflare color from JSON
              icon: "cloudflare.png",
              detection: {} 
            },
            recaptcha: { 
              name: "reCAPTCHA", 
              category: "CAPTCHA", 
              color: "#4285F4", // reCAPTCHA color from JSON
              icon: "recaptcha.png",
              detection: {} 
            }
          };
        }
      }
      
      // Ensure all detectors have colors (detector-specific first, then category)
      for (const [key, detector] of Object.entries(detectorsData.detectors)) {
        if (!detector.color) {
          // Use color from JSON or fallback to category color
          detector.color = detector.color || this.getCategoryColor(detector.category) || '#6b7280';
        }
      }
      
      // Process custom rules and overrides
      const customRulesResult = await chrome.storage.local.get(['customRules']);
      if (customRulesResult.customRules && customRulesResult.customRules.length > 0) {
        customRulesResult.customRules.forEach(rule => {
          // Check if this rule overrides a base detector
          if (rule.overridesDefault) {
            const baseId = rule.overridesDefault;
            
            // If the override disables the detector, remove it entirely
            if (rule.enabled === false && detectorsData.detectors[baseId]) {
              delete detectorsData.detectors[baseId];
              return;
            }
            
            // Replace the base detector with the edited version
            if (detectorsData.detectors[baseId]) {
              // Only include detection methods that have content (not empty arrays)
              const detection = {};
              
              // Only add detection methods if they exist and have content
              if (rule.cookies && rule.cookies.length > 0) {
                detection.cookies = rule.cookies;
              }
              if (rule.headers && rule.headers.length > 0) {
                detection.headers = rule.headers;
              }
              if (rule.urls && rule.urls.length > 0) {
                detection.urls = rule.urls;
              }
              if (rule.scripts && rule.scripts.length > 0) {
                detection.scripts = rule.scripts;
              }
              if (rule.dom && rule.dom.length > 0) {
                detection.dom = rule.dom;
              }
              if (rule.patterns && Object.keys(rule.patterns).length > 0) {
                detection.patterns = rule.patterns;
              }
              
              // Completely replace with edited detection parameters
              detectorsData.detectors[baseId] = {
                name: rule.name,
                category: rule.category,
                icon: rule.icon || detectorsData.detectors[baseId].icon || 'custom.png',
                color: rule.color || detectorsData.detectors[baseId].color,
                enabled: rule.enabled !== false,
                detection: detection, // Use filtered detection object
                lastUpdated: rule.lastUpdated,
                version: rule.version || detectorsData.detectors[baseId].version
              };
            }
          } else if (!rule.isDefault) {
            // Skip disabled custom rules
            if (rule.enabled === false) return;
            
            // Add as new custom rule
            const ruleId = rule.id || rule.name.toLowerCase().replace(/\s+/g, '_');
            detectorsData.detectors[ruleId] = {
              name: rule.name,
              category: rule.category,
              icon: rule.icon || 'custom.png',
              color: rule.color,
              enabled: rule.enabled !== false,
              detection: {
                cookies: rule.cookies || [],
                headers: rule.headers || [],
                urls: rule.urls || [],
                scripts: rule.scripts || [],
                dom: rule.dom || [],
                patterns: rule.patterns || {}
              },
              behaviors: rule.behaviors,
              gameTypes: rule.gameTypes,
              challengeTypes: rule.challengeTypes,
              mitigation: rule.mitigation,
              bypass: rule.bypass
            };
          }
        });
      }
      
      // Cache the detectors
      this.detectorsCache = detectorsData;
      this.detectorsCacheTime = now;
      
      // Store in chrome.storage.local for persistence
      // Use 'detectors' as the main key for consistency across all components
      await chrome.storage.local.set({
        detectors: detectorsData.detectors, // Store just the detectors object (the actual detector definitions)
        detectorsTime: now,
        // Keep old keys for backward compatibility temporarily
        detectorsCache: detectorsData,
        detectorsCacheTime: now
      });
      
      console.log('📦 Stored detectors in storage:', Object.keys(detectorsData.detectors || {}).length, 'detectors');
      
    } catch (error) {
      console.error('🛡️ Background: Error loading detectors:', error);
    }
  }
  
  getCategoryColor(category) {
    // Consistent colors across all extension files
    const categoryColors = {
      'CAPTCHA': '#dc2626',           // Red
      'Anti-Bot': '#ea580c',          // Orange
      'Bot Detection': '#ea580c',     // Orange
      'WAF': '#2563eb',               // Blue
      'CDN': '#059669',               // Green
      'Fingerprinting': '#f59e0b',    // Amber (consistent)
      'Security': '#10b981',          // Emerald (consistent)
      'Analytics': '#8b5cf6',         // Violet (consistent)
      'Marketing': '#ec4899',         // Pink
      'Protection': '#7c3aed',        // Purple
      'DDoS': '#b91c1c'              // Dark Red
    };
    return categoryColors[category] || '#6b7280'; // Gray default
  }

  // Colors are now loaded from detector JSON files and stored in storage
  // No hardcoded colors needed
  
  async refreshDetectorsCache() {
    // Clear cache timestamps to force reload
    this.detectorsCacheTime = 0;
    await chrome.storage.local.remove(['detectorsTime', 'detectorsCacheTime']);
    // Reload detectors
    await this.loadDetectorsOnce();
  }
}

new BackgroundService();