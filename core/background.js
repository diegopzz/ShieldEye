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
      // Initialize only reCAPTCHA manager
      this.recaptchaManager = {
        anchorData: new Map(),
        capturedParams: new Map()
      };
      
    } catch (error) {
      console.error('🛡️ Background: Failed to initialize capture managers:', error);
    }
  }

  init() {
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
    chrome.tabs.onUpdated.addListener(this.handleTabUpdate.bind(this));
    chrome.tabs.onRemoved.addListener(this.handleTabRemoved.bind(this));
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

    // Capture various captcha network requests with request body
    chrome.webRequest.onBeforeRequest.addListener(
      (details) => {
        if (details.tabId > 0) {
          try {
            const url = new URL(details.url);
            
            // Process reCAPTCHA requests - check both hostname patterns
            if (url.hostname.includes('google.com') || 
                url.hostname.includes('recaptcha.net') || 
                url.hostname.includes('gstatic.com')) {
              
              
              // reCAPTCHA anchor request
              if (/\/recaptcha\/(api2|enterprise)\/anchor/i.test(url.pathname)) {
                this.captureRecaptchaAnchorParams(details.tabId, url, details.initiator);
              }
              // reCAPTCHA reload request
              else if (/\/recaptcha\/(api2|enterprise)\/(reload|ubd)/i.test(url.pathname)) {
                this.captureRecaptchaReloadParams(details.tabId, url, details.requestBody, details.initiator);
              }
              // reCAPTCHA bframe (invisible/v3)
              else if (/\/recaptcha\/(api2|enterprise)\/bframe/i.test(url.pathname)) {
                // For bframe, we should also capture some parameters
                const site_key = url.searchParams.get('k');
                if (site_key) {
                  const params = {
                    provider: 'reCAPTCHA',
                    site_url: details.initiator || 'unknown',
                    site_key: site_key,
                    is_enterprise: url.pathname.includes('enterprise'),
                    is_invisible: true, // bframe usually indicates invisible
                    apiDomain: url.hostname.includes('recaptcha.net') ? 'www.recaptcha.net' : '',
                    bframe_url: url.href,
                    timestamp: Date.now(),
                    tabId: details.tabId,
                    version: 'v2', // May be v2 invisible or v3
                    bframe_detected: true
                  };
                  
                  this.storeCaptchaParams(details.tabId, params);
                }
              }
            }
          } catch (e) {
            // Silently ignore URL parsing errors
          }
        }
      },
      { 
        urls: [
          "*://*.google.com/recaptcha/*",
          "*://*.recaptcha.net/recaptcha/*"
        ] 
      },
      ["requestBody"]
    );
  }

  async setDefaultSettings() {
    const result = await chrome.storage.sync.get([
      'enabled', 'darkMode', 'apiEnabled', 'apiUrl', 'historyLimit'
    ]);
    
    if (result.enabled === undefined) {
      await chrome.storage.sync.set({ enabled: true });
    }
    if (result.darkMode === undefined) {
      await chrome.storage.sync.set({ darkMode: true });
    }
    if (result.apiEnabled === undefined) {
      await chrome.storage.sync.set({ apiEnabled: false });
    }
    if (result.apiUrl === undefined) {
      await chrome.storage.sync.set({ apiUrl: '' });
    }
    if (result.historyLimit === undefined) {
      await chrome.storage.sync.set({ historyLimit: 100 });
    }
  }

  handleMessage(request, sender, sendResponse) {
    // Handle getTabResults immediately for performance
    if (request.action === 'getTabResults') {
      const tabData = this.detectionResults.get(request.tabId);
      const results = tabData ? tabData.results : [];
      
      // Merge with captured parameters for Advanced tab
      const capturedParams = this.captchaParameters.get(request.tabId) || [];
      
      // Create a map to merge results by provider
      const mergedMap = new Map();
      
      // Add detection results first
      results.forEach(result => {
        mergedMap.set(result.key || result.name.toLowerCase(), result);
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
      
      sendResponse({ results: mergedResults });
      return false; // Synchronous response
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
        // Combine both DOM-based advanced results and network-captured parameters
        const advancedData = this.advancedResults.get(request.tabId);
        const capturedParams = this.captchaParameters.get(request.tabId) || [];
        
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
        this.captureMode.set(request.tabId, {
          active: true,
          targets: request.targets || []
        });
        // Clear previous captures for this tab
        this.capturedParams.set(request.tabId, []);
        sendResponse({ success: true });
        return false;
        
      case 'stopCaptureMode':
        if (request.tabId) {
          this.captureMode.delete(request.tabId);
        } else {
          // Stop for all tabs
          this.captureMode.clear();
        }
        sendResponse({ success: true });
        return false;
        
      case 'getCaptureMode':
        const captureMode = this.captureMode.get(request.tabId);
        sendResponse({ active: captureMode ? captureMode.active : false });
        return false;
        
      case 'getCapturedParameters':
        const captures = this.capturedParams.get(request.tabId) || [];
        sendResponse({ captures });
        return false;
        
      case 'clearCaptures':
        if (request.tabId) {
          this.capturedParams.set(request.tabId, []);
        } else {
          this.capturedParams.clear();
        }
        sendResponse({ success: true });
        return false;
        
        
      case 'autoUpdateToggled':
        this.handleAutoUpdateToggle(request.enabled);
        sendResponse({ success: true });
        return false;
        
      case 'advancedResults':
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
        chrome.storage.local.remove(['detectorsCache', 'detectorsCacheTime']).then(() => {
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

  handleTabRemoved(tabId) {
    this.clearResultsForTab(tabId);
    this.headersCache.delete(tabId);
    this.captchaParameters.delete(tabId);
    this.captureMode.delete(tabId); // Clear capture mode
    this.capturedParams.delete(tabId); // Clear captured params
    this.contentScriptReady.delete(tabId); // Clear ready state
  }
  
  handleNavigation(details) {
    // Only handle main frame navigations (not iframes)
    if (details.frameId === 0) {
      const tabId = details.tabId;
      
      // Reset capture mode for this tab
      if (this.captureMode.has(tabId)) {
        this.captureMode.delete(tabId);
      }
      
      // Clear captured parameters for this tab
      if (this.capturedParams.has(tabId)) {
        this.capturedParams.delete(tabId);
      }
      
      // Also clear normal captcha parameters
      if (this.captchaParameters.has(tabId)) {
        this.captchaParameters.delete(tabId);
      }
      
      // Clear modular manager data for this tab
      if (this.recaptchaManager) {
        // Clear any stored anchor data that might be tab-specific
        this.recaptchaManager.anchorData.clear();
      }
    }
  }

  storeResults(tabId, results, url) {
    // Store results using tabId + URL combination for per-URL detection
    const key = `${tabId}:${url}`;
    this.detectionResults.set(key, {
      results,
      url,
      timestamp: Date.now(),
      tabId
    });
    
    // Also maintain a reference by tabId for easy lookup
    this.detectionResults.set(tabId, {
      results,
      url,
      timestamp: Date.now()
    });
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

  // Capture reCAPTCHA anchor parameters using modular manager
  captureRecaptchaAnchorParams(tabId, url, initiator) {
    const site_key = url.searchParams.get('k');
    const size = url.searchParams.get('size') || 'normal';
    const s = url.searchParams.get('s');
    
    // Extract site URL from co parameter
    let site_url = initiator || 'unknown';
    const co = url.searchParams.get('co');
    if (co) {
      try {
        site_url = atob(co.replace(/\./g, '=')).replace(':443', '');
      } catch (e) {
      }
    }

    const params = {
      provider: 'reCAPTCHA',
      site_url: site_url,
      site_key: site_key || '',
      is_enterprise: url.pathname.includes('enterprise'),
      is_invisible: size === 'invisible',
      is_s_required: s != null,
      apiDomain: url.hostname.includes('recaptcha.net') ? 'www.recaptcha.net' : '',
      anchor_url: url.href,
      timestamp: Date.now(),
      tabId: tabId // Include tab ID for proper tracking
    };

    // Store by site_key for reload matching using modular manager
    this.recaptchaManager.anchorData.set(site_key, params);
    
    // Also store immediately for cases where reload doesn't happen
    // This ensures anchor-only reCAPTCHA implementations are captured
    this.storeCaptchaParams(tabId, {
      ...params,
      version: 'v2', // Default to v2, will be updated if reload happens
      anchor_only: true // Mark as anchor-only detection
    });
    
  }

  // Capture reCAPTCHA reload parameters using modular manager
  captureRecaptchaReloadParams(tabId, url, requestBody, initiator) {
    const site_key = url.searchParams.get('k');
    
    if (!site_key || !this.recaptchaManager.anchorData.has(site_key)) {
      return;
    }

    const anchorData = this.recaptchaManager.anchorData.get(site_key);
    
    // Default values
    let action = '';
    let isInvisibleFromMessage = false;
    
    // Try to parse the request body if it exists
    if (requestBody && requestBody.raw && requestBody.raw.length > 0) {
      try {
        // Note: In real implementation, we'd need protobuf parsing
        // For now, we'll use simpler detection
        const bodyStr = String.fromCharCode.apply(null, new Uint8Array(requestBody.raw[0].bytes));
        
        // Check for V3 indicators
        if (bodyStr.includes('action') || url.pathname.includes('reload')) {
          // This is likely V3 if we find action-related content
          action = 'homepage'; // Default action, would need proper parsing
        }
      } catch (e) {
      }
    }
    
    // Determine captcha type
    const isReCaptchaV3 = action.length > 0;
    const isInvisible = !isReCaptchaV3 && anchorData.is_invisible;
    const recaptchaV2Normal = !anchorData.is_invisible && !isReCaptchaV3;
    
    // Create final parameters
    const finalParams = {
      ...anchorData,
      action: action,
      isReCaptchaV3: isReCaptchaV3,
      isInvisible: isInvisible,
      recaptchaV2Normal: recaptchaV2Normal,
      reload_detected: true,
      anchor_only: false, // Update to indicate reload happened
      version: isReCaptchaV3 ? 'v3' : 'v2' // Update version based on detection
    };
    
    // Check if capture mode is active for this tab
    const captureConfig = this.captureMode.get(tabId);
    if (captureConfig && captureConfig.active) {
      // Store to captured params instead of regular storage
      const captures = this.capturedParams.get(tabId) || [];
      captures.push(finalParams);
      this.capturedParams.set(tabId, captures);
    } else {
      // Update existing anchor-only params if they exist
      let currentParams = this.captchaParameters.get(tabId) || [];
      const existingIndex = currentParams.findIndex(p => 
        p.provider === 'reCAPTCHA' && p.site_key === site_key
      );
      
      if (existingIndex !== -1) {
        // Update existing anchor-only params with reload data
        currentParams[existingIndex] = finalParams;
      } else {
        // Store new params if anchor wasn't captured
        currentParams.push(finalParams);
      }
      
      this.captchaParameters.set(tabId, currentParams);
    }
    
    this.recaptchaManager.anchorData.delete(site_key); // Clean up after processing
  }


  // Store captured parameters
  storeCaptchaParams(tabId, params) {
    
    // Check if capture mode is active for this tab
    const captureConfig = this.captureMode.get(tabId);
    if (captureConfig && captureConfig.active) {
      // Store in capturedParams for capture mode
      const captures = this.capturedParams.get(tabId) || [];
      
      // Format the capture for display in Advanced tab
      const formattedCapture = {
        name: 'reCAPTCHA',
        captcha_type: params.provider || 'reCAPTCHA',
        advancedParameters: {
          site_url: params.site_url,
          sitekey: params.site_key,
          site_key: params.site_key,
          action: params.action || '',
          is_invisible: params.is_invisible,
          isInvisible: params.is_invisible,
          recaptchaV2Normal: !params.is_invisible && params.version === 'v2',
          isReCaptchaV3: params.version === 'v3',
          is_enterprise: params.is_enterprise,
          s: params.is_s_required ? 'yes' : '',
          apiDomain: params.apiDomain || '',
          timestamp: params.timestamp || Date.now()
        }
      };
      
      captures.push(formattedCapture);
      this.capturedParams.set(tabId, captures);
    } else {
      // Normal storage when not in capture mode
      let currentParams = this.captchaParameters.get(tabId) || [];
      
      // Check if we already have this captcha (by site_key)
      const existingIndex = currentParams.findIndex(p => {
        return p.site_key === params.site_key && p.provider === params.provider;
      });
      
      if (existingIndex >= 0) {
        // Update existing entry
        currentParams[existingIndex] = { ...currentParams[existingIndex], ...params };
      } else {
        // Add new entry
        currentParams.push(params);
      }
      
      this.captchaParameters.set(tabId, currentParams);
    }
    
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
      
      // Load base detectors first, then merge custom rules
      
      // Check cached detectors from Chrome storage
      const cached = await chrome.storage.local.get(['detectorsCache', 'detectorsCacheTime']);
      const now = Date.now();
      const isCacheValid = cached.detectorsCache && 
                          cached.detectorsCacheTime && 
                          (now - cached.detectorsCacheTime) < this.CACHE_DURATION;
      
      if (isCacheValid) {
        this.detectorsCache = cached.detectorsCache;
        this.detectorsCacheTime = cached.detectorsCacheTime;
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
                  color: detector.color || this.getDetectorColor(detector.name) || this.getCategoryColor(detector.category),
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
              color: this.getDetectorColor("Cloudflare") || this.getCategoryColor("Anti-Bot"),
              icon: "cloudflare.png",
              detection: {} 
            },
            recaptcha: { 
              name: "reCAPTCHA", 
              category: "CAPTCHA", 
              color: this.getDetectorColor("reCAPTCHA") || this.getCategoryColor("CAPTCHA"),
              icon: "recaptcha.png",
              detection: {} 
            }
          };
        }
      }
      
      // Ensure all detectors have colors (detector-specific first, then category)
      for (const [key, detector] of Object.entries(detectorsData.detectors)) {
        if (!detector.color) {
          detector.color = this.getDetectorColor(detector.name) || this.getCategoryColor(detector.category) || '#6b7280';
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
      await chrome.storage.local.set({
        detectorsCache: detectorsData,
        detectorsCacheTime: now
      });
      
      
    } catch (error) {
      console.error('🛡️ Background: Error loading detectors:', error);
    }
  }
  
  getCategoryColor(category) {
    const categoryColors = {
      'CAPTCHA': '#dc2626',           // Red
      'Anti-Bot': '#ea580c',          // Orange  
      'WAF': '#2563eb',               // Blue
      'CDN': '#059669',               // Green
      'Fingerprinting': '#7c3aed',    // Purple
      'Security': '#0891b2',          // Cyan
      'Analytics': '#ca8a04',         // Yellow
      'Marketing': '#ec4899'          // Pink
    };
    return categoryColors[category] || '#6b7280'; // Gray default
  }

  getDetectorColor(detectorName) {
    // Unique color for each specific detector/provider
    const detectorColors = {
      // Anti-Bot Solutions
      'akamai': '#FF6B35',
      'cloudflare': '#F48120',
      'datadome': '#22C55E',        // Green
      'imperva': '#00BCD4',
      'incapsula': '#00ACC1',
      'perimeterx': '#DC2626',      // Red
      'reblaze': '#E91E63',
      'sucuri': '#8BC34A',
      'aws': '#FF9900',
      'f5': '#E53935',
      'kasada': '#3F51B5',
      'radware': '#009688',
      
      // CAPTCHA Solutions
      'recaptcha': '#4285F4',
      'hcaptcha': '#0074BF',
      'funcaptcha': '#9C27B0',
      'geetest': '#5E35B1',
      'friendly captcha': '#22C55E',
      'mtcaptcha': '#FF5722',
      
      // WAF Solutions  
      'akamai waf': '#D32F2F',
      'cloudflare waf': '#FF6F00',
      'aws waf': '#FF8F00',
      'azure waf': '#0078D4',
      'barracuda': '#00695C',
      'fortinet': '#EE0000',
      
      // Default
      'custom': '#9E9E9E'
    };
    
    const normalizedName = detectorName.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    
    if (detectorColors[normalizedName]) {
      return detectorColors[normalizedName];
    }
    
    for (const [key, color] of Object.entries(detectorColors)) {
      if (normalizedName.includes(key) || key.includes(normalizedName)) {
        return color;
      }
    }
    
    return null;
  }
  
  async refreshDetectorsCache() {
    // Clear cache timestamps to force reload
    this.detectorsCacheTime = 0;
    await chrome.storage.local.remove(['detectorsCacheTime']);
    // Reload detectors
    await this.loadDetectorsOnce();
  }
}

new BackgroundService();