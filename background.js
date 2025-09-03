class BackgroundService {
  constructor() {
    this.detectionResults = new Map();
    this.advancedResults = new Map(); // Store advanced interaction-based results
    this.headersCache = new Map();
    this.captchaParameters = new Map(); // Store captured captcha parameters from network requests
    this.captureMode = new Map(); // Track capture mode per tab
    this.capturedParams = new Map(); // Store captured params per tab
    this.blacklist = []; // Store blacklisted domains
    this.telemetryQueue = []; // Queue for telemetry data
    this.telemetryEnabled = false; // Telemetry opt-in status
    this.telemetryEndpoint = ''; // Configurable telemetry endpoint
    this.contentScriptReady = new Map(); // Track which tabs have content script ready
    this.detectorsCache = null; // Cache for detector data
    this.detectorsCacheTime = 0; // Timestamp of last cache update
    this.CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours cache duration
    
    // Initialize modular capture managers
    this.initCaptureManagers();
    
    this.init();
    this.loadBlacklist();
    this.initTelemetry();
    this.loadDetectorsOnce(); // Load detectors once on startup
  }
  
  async initCaptureManagers() {
    try {
      // Load modular capture managers (would need to be imported in real implementation)
      // For now, we'll use the existing logic but with better organization
      this.recaptchaManager = {
        anchorData: new Map(),
        capturedParams: new Map()
      };
      this.hcaptchaManager = {
        siteConfigData: new Map(), 
        capturedParams: new Map()
      };
      this.funcaptchaManager = {
        capturedParams: new Map()
      };
      this.datadomeManager = {
        capturedParams: new Map()
      };
      
      console.log('🛡️ Background: Capture managers initialized');
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
              
              console.log('🛡️ Background: Checking reCAPTCHA URL:', url.href);
              
              // reCAPTCHA anchor request
              if (/\/recaptcha\/(api2|enterprise)\/anchor/i.test(url.pathname)) {
                console.log('🛡️ Background: Found reCAPTCHA anchor request');
                this.captureRecaptchaAnchorParams(details.tabId, url, details.initiator);
              }
              // reCAPTCHA reload request
              else if (/\/recaptcha\/(api2|enterprise)\/(reload|ubd)/i.test(url.pathname)) {
                console.log('🛡️ Background: Found reCAPTCHA reload request');
                this.captureRecaptchaReloadParams(details.tabId, url, details.requestBody, details.initiator);
              }
              // reCAPTCHA bframe (invisible/v3)
              else if (/\/recaptcha\/(api2|enterprise)\/bframe/i.test(url.pathname)) {
                console.log('🛡️ Background: Found reCAPTCHA bframe (invisible/v3)');
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
            // Process FunCaptcha/Arkose requests
            else if (/\/fc\/[a-zA-Z0-9-]+\/public_key\/[A-Fa-f0-9\-]+$/i.test(url.pathname)) {
              this.captureFunCaptchaParams(details.tabId, url, details.requestBody, details.initiator);
            }
            // Process hCaptcha requests
            else if (url.hostname.includes('hcaptcha.com')) {
              // hCaptcha checksiteconfig
              if (/\/checksiteconfig/i.test(url.pathname)) {
                this.captureHCaptchaCheckSiteConfig(details.tabId, url, details.initiator);
              }
              // hCaptcha getcaptcha
              else if (/\/getcaptcha\/[a-z0-9\-]+/i.test(url.pathname)) {
                this.captureHCaptchaGetCaptcha(details.tabId, url, details.requestBody, details.initiator);
              }
            }
            // Process DataDome requests
            else if (url.hostname.includes('datadome.co') || url.pathname.includes('/captcha-challenge')) {
              this.captureDataDomeParams(details.tabId, url, details.initiator);
            }
          } catch (e) {
            // Silently ignore URL parsing errors
          }
        }
      },
      { 
        urls: [
          "*://*.google.com/recaptcha/*",
          "*://*.recaptcha.net/recaptcha/*",
          "*://*/fc/*/public_key/*",
          "*://*.hcaptcha.com/*",
          "*://*.datadome.co/*",
          "*://*/captcha-challenge/*"
        ] 
      },
      ["requestBody"]
    );
  }

  async setDefaultSettings() {
    const result = await chrome.storage.sync.get([
      'enabled', 'darkMode', 'apiEnabled', 'apiUrl', 'historyLimit'
    ]);
    
    console.log('🛡️ Background: Current storage values:', result);
    
    if (result.enabled === undefined) {
      console.log('🛡️ Background: Setting default enabled to true');
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
          console.log('🛡️ Background: Merging captured params into existing result:', existingResult.name);
          existingResult.advancedParameters = {
            ...param,
            network_captured: true
          };
        } else {
          // Add as new result if not detected via DOM
          console.log('🛡️ Background: Adding new result from captured params:', param.provider);
          mergedMap.set(paramKey, {
            name: param.provider,
            key: paramKey,
            confidence: 100,
            icon: paramKey + '.svg',
            advancedParameters: {
              ...param,
              network_captured: true
            }
          });
        }
      });
      
      const mergedResults = Array.from(mergedMap.values());
      console.log('🛡️ Background: getTabResults for tab', request.tabId, '- detection:', results.length, 'captured:', capturedParams.length, 'merged:', mergedResults.length);
      
      sendResponse({ results: mergedResults });
      return false; // Synchronous response
    }
    
    switch (request.action) {
      case 'contentScriptReady':
        console.log('🛡️ Background: Content script ready for tab', sender.tab?.id);
        // Mark tab as ready for popup to query
        if (sender.tab?.id) {
          this.contentScriptReady.set(sender.tab.id, true);
        }
        sendResponse({ success: true });
        return false;
        
      case 'getDetectors':
        console.log('🛡️ Background: Content script requesting detectors');
        // Ensure detectors are loaded
        if (!this.detectorsCache) {
          console.log('🛡️ Background: Detectors not cached, loading now...');
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
        console.log('🛡️ Background: Received detection results from tab', sender.tab?.id, '- count:', request.results?.length);
        // Check if URL is blacklisted before processing
        if (this.isUrlBlacklisted(request.url)) {
          console.log('🛡️ Background: URL is blacklisted:', request.url);
          sendResponse({ success: false, blacklisted: true });
          return false;
        }
        this.storeResults(sender.tab.id, request.results, request.url);
        this.updateBadge(sender.tab.id, request.results);
        // Collect telemetry
        const url = new URL(request.url);
        this.collectTelemetry(url.hostname, request.results);
        console.log('🛡️ Background: Results stored successfully for tab', sender.tab.id);
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
          console.log('🛡️ Background: Cleared results for tab', request.tabId);
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
          icon: param.provider.toLowerCase() + '.svg',
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
        
      case 'updateTelemetrySettings':
        this.telemetryEnabled = request.enabled;
        this.telemetryEndpoint = request.endpoint || this.telemetryEndpoint;
        chrome.storage.sync.set({ 
          telemetryEnabled: this.telemetryEnabled,
          telemetryEndpoint: this.telemetryEndpoint
        });
        if (this.telemetryEnabled) {
          chrome.alarms.create('sendTelemetry', {
            delayInMinutes: 1,
            periodInMinutes: 30
          });
        } else {
          chrome.alarms.clear('sendTelemetry');
        }
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
        console.log('🛡️ Tab update: Resetting capture mode for tab:', tabId);
        this.captureMode.delete(tabId);
      }
      if (this.capturedParams.has(tabId)) {
        console.log('🛡️ Tab update: Clearing captured parameters for tab:', tabId);
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
      console.log('🛡️ Navigation detected for tab:', tabId, 'to:', details.url);
      
      // Reset capture mode for this tab
      if (this.captureMode.has(tabId)) {
        console.log('🛡️ Resetting capture mode for tab:', tabId);
        this.captureMode.delete(tabId);
      }
      
      // Clear captured parameters for this tab
      if (this.capturedParams.has(tabId)) {
        console.log('🛡️ Clearing captured parameters for tab:', tabId);
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
      if (this.hcaptchaManager) {
        this.hcaptchaManager.siteConfigData.clear();
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
    console.log('Advanced results stored for tab:', tabId, results.length, 'results');
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
        
        console.log('Auto-update for detectors.json enabled - checking every 3 hours');
      }
    } catch (error) {
      console.error('Failed to setup auto-update:', error);
    }
  }

  async handleAlarm(alarm) {
    if (alarm.name === 'updateDetectors') {
      await this.updateDetectors();
    } else if (alarm.name === 'sendTelemetry') {
      await this.sendTelemetry();
    }
  }

  async updateDetectors() {
    try {
      console.log('Checking for detector updates...');
      
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
        console.log('Detectors checked recently, skipping update');
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
        console.log('Remote detectors not available or not modified');
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
        
        console.log('Detectors updated! New version available.');
        
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
        console.log('Detectors are up to date');
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
        console.log('Auto-update re-enabled');
      } else {
        // Clear auto-update alarms
        chrome.alarms.clear('updateDetectors');
        console.log('Auto-update disabled');
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
        console.log('Failed to decode co parameter:', e);
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
    
    console.log('Captured reCAPTCHA anchor:', params);
  }

  // Capture reCAPTCHA reload parameters using modular manager
  captureRecaptchaReloadParams(tabId, url, requestBody, initiator) {
    const site_key = url.searchParams.get('k');
    
    if (!site_key || !this.recaptchaManager.anchorData.has(site_key)) {
      console.log('No anchor data found for site_key:', site_key);
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
        console.log('Could not parse reload body:', e);
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

  // FunCaptcha/Arkose detection (following Capsolver FunCaptcha panel.js)
  captureFunCaptchaParams(tabId, url, requestBody, initiator) {
    if (!requestBody || !requestBody.formData) {
      return;
    }
    
    const formData = requestBody.formData;
    const params = {
      provider: 'FunCaptcha',
      captcha_type: 'funcaptcha',
      site_url: formData.site ? formData.site[0] : (initiator || 'unknown'),
      public_key: formData.public_key ? formData.public_key[0] : '',
      bda: formData.bda ? formData.bda[0] : '',
      userbrowser: formData.userbrowser ? formData.userbrowser[0] : '',
      data_blob: formData['data[blob]'] ? formData['data[blob]'][0] : null,
      funcaptchaApiJSSubdomain: 'https://' + url.hostname,
      is_funcaptcha: true,
      timestamp: Date.now()
    };
    
    // Check if capture mode is active for this tab
    const captureConfig = this.captureMode.get(tabId);
    if (captureConfig && captureConfig.active) {
      // Store to captured params instead of regular storage
      const captures = this.capturedParams.get(tabId) || [];
      captures.push(params);
      this.capturedParams.set(tabId, captures);
    } else {
      // Normal storage
      this.storeCaptchaParams(tabId, params);
    }
  }
  
  // hCaptcha checksiteconfig capture using modular manager
  captureHCaptchaCheckSiteConfig(tabId, url, initiator) {
    const sitekey = url.searchParams.get('sitekey');
    const host = url.searchParams.get('host');
    const version = url.searchParams.get('v');
    
    // Store for later matching with getcaptcha using modular manager
    this.hcaptchaManager.siteConfigData.set(sitekey, {
      provider: 'hCaptcha',
      captcha_type: 'hcaptcha',
      site_url: host || initiator || 'unknown',
      site_key: sitekey,
      version: version,
      is_enterprise: false,
      timestamp: Date.now()
    });
    
    console.log('Captured hCaptcha checksiteconfig:', sitekey);
  }
  
  // hCaptcha getcaptcha capture
  captureHCaptchaGetCaptcha(tabId, url, requestBody, initiator) {
    let sitekey = null;
    let rqdata = null;
    let isEnterprise = false;
    
    // Check for enterprise indicators
    if (requestBody && requestBody.formData) {
      const formData = requestBody.formData;
      if (formData.rqdata) {
        rqdata = formData.rqdata[0];
        isEnterprise = true;
      }
      if (formData.sitekey) {
        sitekey = formData.sitekey[0];
      }
    }
    
    // Try to get sitekey from URL if not in form data
    if (!sitekey) {
      const pathMatch = url.pathname.match(/\/getcaptcha\/([a-z0-9\-]+)/i);
      if (pathMatch) {
        sitekey = pathMatch[1];
      }
    }
    
    // Get stored data from checksiteconfig
    let storedData = {};
    if (this.hcaptchaData && sitekey) {
      storedData = this.hcaptchaData.get(sitekey) || {};
    }
    
    const params = {
      ...storedData,
      provider: 'hCaptcha',
      captcha_type: 'hcaptcha',
      site_key: sitekey || storedData.site_key,
      is_enterprise: isEnterprise || storedData.is_enterprise,
      is_rqdata_required: !!rqdata,
      rqdata: rqdata,
      getcaptcha_url: url.href,
      timestamp: Date.now()
    };
    
    // Check if capture mode is active for this tab
    const captureConfig = this.captureMode.get(tabId);
    if (captureConfig && captureConfig.active) {
      const captures = this.capturedParams.get(tabId) || [];
      captures.push(params);
      this.capturedParams.set(tabId, captures);
    } else {
      this.storeCaptchaParams(tabId, params);
    }
    
    // Clean up stored data
    if (this.hcaptchaData && sitekey) {
      this.hcaptchaData.delete(sitekey);
    }
  }
  
  // DataDome capture
  captureDataDomeParams(tabId, url, initiator) {
    const referer = url.searchParams.get('referer');
    const cid = url.searchParams.get('cid');
    const hash = url.searchParams.get('hash');
    
    const params = {
      provider: 'DataDome',
      captcha_type: 'datadome',
      site_url: referer || initiator || 'unknown',
      captcha_url: url.href,
      cid: cid,
      hash: hash,
      is_datadome: true,
      is_slider: url.pathname.includes('slider'),
      is_interstitial: url.pathname.includes('interstitial'),
      timestamp: Date.now()
    };
    
    // Check if capture mode is active for this tab
    const captureConfig = this.captureMode.get(tabId);
    if (captureConfig && captureConfig.active) {
      const captures = this.capturedParams.get(tabId) || [];
      captures.push(params);
      this.capturedParams.set(tabId, captures);
    } else {
      this.storeCaptchaParams(tabId, params);
    }
  }

  // Store captured parameters
  storeCaptchaParams(tabId, params) {
    console.log('🛡️ storeCaptchaParams called for tab:', tabId, 'params:', params);
    
    // Check if capture mode is active for this tab
    const captureConfig = this.captureMode.get(tabId);
    if (captureConfig && captureConfig.active) {
      console.log('🛡️ Capture mode is ACTIVE, storing in capturedParams');
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
      console.log('🛡️ Stored capture in capturedParams, total captures:', captures.length);
    } else {
      console.log('🛡️ Capture mode NOT active, storing normally');
      // Normal storage when not in capture mode
      let currentParams = this.captchaParameters.get(tabId) || [];
      
      // Check if we already have this captcha (by site_key or public_key)
      const existingIndex = currentParams.findIndex(p => {
        if (params.provider === 'FunCaptcha') {
          return p.public_key === params.public_key && p.provider === params.provider;
        }
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
    
    console.log('🛡️ Captured captcha parameters for tab:', tabId, params);
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

  // Telemetry System
  async initTelemetry() {
    const settings = await chrome.storage.sync.get(['telemetryEnabled', 'telemetryEndpoint']);
    this.telemetryEnabled = settings.telemetryEnabled || false;
    this.telemetryEndpoint = settings.telemetryEndpoint || 'https://api.shieldeye.io/telemetry';
    
    // Set up periodic telemetry sending (every 30 minutes)
    if (this.telemetryEnabled) {
      chrome.alarms.create('sendTelemetry', {
        delayInMinutes: 1,
        periodInMinutes: 30
      });
    }
  }

  async collectTelemetry(domain, detections) {
    if (!this.telemetryEnabled) return;
    
    try {
      // Hash domain for privacy
      const hashedDomain = await this.hashDomain(domain);
      
      const telemetryData = {
        timestamp: Date.now(),
        hashedDomain: hashedDomain,
        detections: detections.map(d => ({
          name: d.name,
          category: d.category,
          confidence: d.confidence
        })),
        version: chrome.runtime.getManifest().version,
        platform: navigator.platform
      };
      
      this.telemetryQueue.push(telemetryData);
      
      // Send immediately if queue is large
      if (this.telemetryQueue.length >= 10) {
        await this.sendTelemetry();
      }
    } catch (error) {
      console.error('Error collecting telemetry:', error);
    }
  }

  async hashDomain(domain) {
    // Simple hash function for privacy
    const encoder = new TextEncoder();
    const data = encoder.encode(domain);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
  }

  async sendTelemetry() {
    if (!this.telemetryEnabled || this.telemetryQueue.length === 0) return;
    
    try {
      const dataToSend = [...this.telemetryQueue];
      this.telemetryQueue = [];
      
      await fetch(this.telemetryEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Extension-Version': chrome.runtime.getManifest().version
        },
        body: JSON.stringify({
          batch: dataToSend,
          batchSize: dataToSend.length
        })
      });
      
      console.log(`Telemetry sent: ${dataToSend.length} records`);
    } catch (error) {
      // Restore queue on error
      this.telemetryQueue.unshift(...dataToSend);
      console.error('Failed to send telemetry:', error);
    }
  }

  // Cache Management
  async clearCache() {
    this.detectionResults.clear();
    this.advancedResults.clear();
    this.headersCache.clear();
    this.captchaParameters.clear();
    await chrome.storage.local.remove(['cachedDetections', 'lastDetectorUpdate']);
    console.log('Cache cleared successfully');
  }

  async getCacheStats() {
    return {
      detectionResults: this.detectionResults.size,
      advancedResults: this.advancedResults.size,
      headersCache: this.headersCache.size,
      captchaParameters: this.captchaParameters.size,
      telemetryQueue: this.telemetryQueue.length
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
      // First check if we have cached detectors in storage
      const cached = await chrome.storage.local.get(['detectorsCache', 'detectorsCacheTime']);
      
      const now = Date.now();
      const isCacheValid = cached.detectorsCache && 
                          cached.detectorsCacheTime && 
                          (now - cached.detectorsCacheTime) < this.CACHE_DURATION;
      
      if (isCacheValid) {
        console.log('🛡️ Background: Using cached detectors from storage');
        this.detectorsCache = cached.detectorsCache;
        this.detectorsCacheTime = cached.detectorsCacheTime;
        return;
      }
      
      console.log('🛡️ Background: Loading fresh detectors...');
      
      // Check for updated detectors from auto-update first
      const storageResult = await chrome.storage.local.get(['updatedDetectors', 'detectorsUpdated']);
      
      let detectorsData = { detectors: {} };
      
      if (storageResult.detectorsUpdated && storageResult.updatedDetectors) {
        console.log('🛡️ Background: Using updated detectors from auto-update');
        detectorsData = storageResult.updatedDetectors;
      } else {
        // Load detectors from modular structure
        console.log('🛡️ Background: Loading modular detectors from files...');
        
        try {
          // Load the index file
          const indexResponse = await fetch(chrome.runtime.getURL('detectors/index.json'));
          const indexData = await indexResponse.json();
          
          // Load each detector file in parallel for better performance
          const detectorPromises = Object.entries(indexData.detectors).map(async ([detectorId, config]) => {
            try {
              const detectorResponse = await fetch(chrome.runtime.getURL(`detectors/${config.file}`));
              const detector = await detectorResponse.json();
              
              return {
                id: detectorId,
                data: {
                  name: detector.name,
                  category: detector.category,
                  confidence: detector.confidence || 100,
                  website: detector.website,
                  icon: detector.icon || 'custom.png',
                  color: detector.color || this.getCategoryColor(detector.category),
                  detection: detector.detection || {}
                }
              };
            } catch (e) {
              console.warn(`Failed to load detector ${detectorId}:`, e);
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
          
          console.log(`🛡️ Background: Loaded ${Object.keys(detectorsData.detectors).length} detectors`);
        } catch (error) {
          console.error('🛡️ Background: Failed to load detectors:', error);
          // Use fallback detectors
          detectorsData.detectors = {
            cloudflare: { 
              name: "Cloudflare", 
              category: "Anti-Bot", 
              color: this.getCategoryColor("Anti-Bot"), 
              detection: {} 
            },
            recaptcha: { 
              name: "reCAPTCHA", 
              category: "CAPTCHA", 
              color: this.getCategoryColor("CAPTCHA"), 
              detection: {} 
            }
          };
        }
      }
      
      // Ensure all detectors have colors
      for (const [key, detector] of Object.entries(detectorsData.detectors)) {
        if (!detector.color && detector.category) {
          detector.color = this.getCategoryColor(detector.category);
        }
      }
      
      // Cache the detectors
      this.detectorsCache = detectorsData;
      this.detectorsCacheTime = now;
      
      // Store in chrome.storage.local for persistence
      await chrome.storage.local.set({
        detectorsCache: detectorsData,
        detectorsCacheTime: now
      });
      
      console.log('🛡️ Background: Detectors cached successfully');
      
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
  
  async refreshDetectorsCache() {
    console.log('🛡️ Background: Force refreshing detectors cache...');
    // Clear cache timestamps to force reload
    this.detectorsCacheTime = 0;
    await chrome.storage.local.remove(['detectorsCacheTime']);
    // Reload detectors
    await this.loadDetectorsOnce();
  }
}

new BackgroundService();