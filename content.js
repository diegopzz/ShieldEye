class AntiBotDetector {
  constructor() {
    console.log('🛡️ ShieldEye: Constructing AntiBotDetector...');
    this.detectors = {};
    this.customRules = [];
    this.detectedSolutions = [];
    this.advancedDetections = []; // For interaction-based detections
    this.isEnabled = true;
    this.cachedHeaders = {};
    this.captchaInteractionDetected = false;
    this.interactionMonitors = [];
    this.currentUrl = window.location.href;
    
    console.log('🛡️ ShieldEye: Current URL:', this.currentUrl);
    console.log('🛡️ ShieldEye: Document ready state:', document.readyState);
    
    // Wait for document to be ready before initializing
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init());
    } else {
      this.init();
    }
  }
  
  async init() {
    console.log('🛡️ ShieldEye Content Script: Initializing...');
    
    // Immediately send an initial empty result to indicate we're starting
    this.sendInitialResults();
    
    try {
      console.log('🛡️ Step 1: Checking if enabled...');
      await this.checkEnabled();
      
      console.log('🛡️ Step 2: Loading detectors...');
      await this.loadDetectors();
      
      console.log('🛡️ Step 3: Loading headers...');
      await this.loadHeaders();
      
      console.log('🛡️ Step 4: Setting up advanced detection...');
      this.setupAdvancedDetection();
      
      console.log('🛡️ Step 5: Setting up URL change detection...');
      this.setupUrlChangeDetection();
      
      console.log('🛡️ ShieldEye Content Script: Initialization complete!');
      console.log('🛡️ Total detectors loaded:', Object.keys(this.detectors).length);
      console.log('🛡️ Initial detection results:', this.detectedSolutions.length);
      
      // Force send results even if empty to indicate we're ready
      // This prevents the popup from being stuck in loading state
      this.sendResults();
    } catch (error) {
      console.error('🛡️ ShieldEye Content Script: Initialization failed:', error);
      // Even if initialization fails, send empty results to popup
      this.detectedSolutions = [];
      this.sendResults();
    }
  }
  
  sendInitialResults() {
    // Send a special message to indicate content script is initializing
    chrome.runtime.sendMessage({
      action: 'contentScriptReady',
      url: window.location.href,
      tabId: null // Will be filled by background script
    }).catch(err => {
      console.log('🛡️ Could not send initial ready message:', err);
    });
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

  async loadDetectors() {
    try {
      // Request detectors from background service instead of fetching files
      console.log('🛡️ Requesting detectors from background service...');
      
      const response = await chrome.runtime.sendMessage({ action: 'getDetectors' });
      
      if (response && response.success && response.detectors) {
        console.log('🛡️ Received detectors from background service');
        
        const detectorsData = response.detectors;
        
        // Ensure all detectors have colors based on their category
        for (const [key, detector] of Object.entries(detectorsData.detectors)) {
          if (!detector.color && detector.category) {
            detector.color = this.getCategoryColor(detector.category);
          }
        }
        
        this.detectors = detectorsData.detectors;
        console.log('🛡️ Successfully loaded', Object.keys(this.detectors).length, 'detectors from background');
        
      } else {
        console.error('Failed to get detectors from background:', response?.error);
        // Use fallback detectors
        this.detectors = {
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
      
      // Load custom rules
      await this.loadCustomRules();
      
      console.log('🛡️ Starting initial analysis...');
      await this.analyze();
      console.log('🛡️ Initial analysis complete');
    } catch (error) {
      console.error('Failed to load detectors:', error);
      // Set some basic detectors as fallback
      this.detectors = {
        cloudflare: {
          name: "Cloudflare",
          category: "Anti-Bot",
          color: this.getCategoryColor("Anti-Bot"),
          detection: {
            cookies: [{ name: "__cf_bm", confidence: 95 }],
            headers: [{ name: "Server", value: "cloudflare", confidence: 90 }]
          }
        },
        test_detector: {
          name: "Test Detector",
          category: "Test",
          color: this.getCategoryColor("Test"),
          detection: {
            urls: [{ pattern: "http", confidence: 100 }], // Should match any HTTP URL
            scripts: [{ content: "window", confidence: 50 }] // Should match any page with window object
          }
        }
      };
      console.log('🛡️ Using fallback detectors:', Object.keys(this.detectors));
      await this.analyze();
    }
  }

  async loadCustomRules() {
    try {
      const result = await chrome.storage.local.get(['customRules']);
      this.customRules = result.customRules || [];
      
      // Convert custom rules to detector format
      this.customRules.forEach((rule, index) => {
        const detectorKey = `custom_${index}`;
        
        // Check if a detector with the same name already exists
        // If it does and the custom rule has a color, override the existing detector's color
        if (rule.color) {
          for (const [key, detector] of Object.entries(this.detectors)) {
            if (detector.name && detector.name.toLowerCase() === rule.name.toLowerCase()) {
              console.log(`🛡️ Overriding color for ${detector.name}: ${detector.color} -> ${rule.color}`);
              detector.color = rule.color;
            }
          }
        }
        
        this.detectors[detectorKey] = {
          name: rule.name,
          category: rule.category,
          confidence: 100,
          website: 'Custom Rule',
          icon: 'custom.svg',
          color: rule.color || null,
          detection: this.convertCustomRuleToDetection(rule)
        };
      });
    } catch (error) {
      console.error('Failed to load custom rules:', error);
    }
  }

  convertCustomRuleToDetection(rule) {
    const detection = {};
    
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
    
    return detection;
  }

  async checkEnabled() {
    try {
      const result = await chrome.storage.sync.get(['enabled']);
      // Default to true if undefined or null
      if (result.enabled === undefined || result.enabled === null) {
        this.isEnabled = true;
        // Set it in storage for consistency
        await chrome.storage.sync.set({ enabled: true });
        console.log('ShieldEye enabled (default):', this.isEnabled);
      } else {
        this.isEnabled = Boolean(result.enabled);
        console.log('ShieldEye enabled:', this.isEnabled);
      }
    } catch (error) {
      console.error('Failed to check if enabled:', error);
      this.isEnabled = true; // Default to enabled on error
    }
  }

  async loadHeaders() {
    try {
      const response = await chrome.runtime.sendMessage({ 
        action: 'getHeaders'
        // Background script will use sender.tab.id
      });
      this.cachedHeaders = (response && response.headers) ? response.headers : {};
      console.log('🛡️ Loaded headers:', Object.keys(this.cachedHeaders).length);
    } catch (error) {
      console.error('Failed to load headers:', error);
      this.cachedHeaders = {};
    }
  }

  async getCurrentTabId() {
    // Content scripts don't have access to chrome.tabs API
    // The background script will use sender.tab.id instead
    return null;
  }

  async analyze() {
    console.log('🛡️ Starting analysis, enabled:', this.isEnabled, 'detectors:', Object.keys(this.detectors).length);
    
    if (!this.isEnabled) {
      console.log('🛡️ ShieldEye is disabled, skipping analysis');
      this.detectedSolutions = [];
      this.sendResults();
      return;
    }

    this.detectedSolutions = [];
    const detectedNames = new Set();
    
    console.log('🛡️ Analyzing with detectors:', Object.keys(this.detectors));
    
    for (const [key, detector] of Object.entries(this.detectors)) {
      const detection = await this.detectSolution(detector);
      if (detection.detected) {
        // Check if we already detected a solution with this name
        const existingIndex = this.detectedSolutions.findIndex(s => s.name === detector.name);
        
        if (existingIndex === -1) {
          // No duplicate, add the detection
          this.detectedSolutions.push({
            key,
            ...detector,
            confidence: detection.confidence,
            matches: detection.matches
          });
          detectedNames.add(detector.name);
        } else {
          // Duplicate found - prefer custom rules over built-in detectors
          const existing = this.detectedSolutions[existingIndex];
          const isCurrentCustom = key.startsWith('custom_');
          const isExistingCustom = existing.key.startsWith('custom_');
          
          if (isCurrentCustom && !isExistingCustom) {
            // Replace built-in with custom rule (preserves custom color)
            this.detectedSolutions[existingIndex] = {
              key,
              ...detector,
              confidence: Math.max(detection.confidence, existing.confidence),
              matches: [...(existing.matches || []), ...(detection.matches || [])]
            };
            console.log(`🛡️ Replaced built-in ${detector.name} with custom rule (color: ${detector.color})`);
          } else if (!isCurrentCustom && isExistingCustom) {
            // Keep custom rule, just merge matches
            existing.matches = [...(existing.matches || []), ...(detection.matches || [])];
            existing.confidence = Math.max(existing.confidence, detection.confidence);
          } else {
            // Both same type, merge matches and take higher confidence
            existing.matches = [...(existing.matches || []), ...(detection.matches || [])];
            existing.confidence = Math.max(existing.confidence, detection.confidence);
          }
        }
      }
    }

    console.log('Analysis complete, found', this.detectedSolutions.length, 'detections');
    this.sendResults();
  }

  async detectSolution(detector) {
    let totalConfidence = 0;
    let matchCount = 0;
    let matches = [];

    if (detector.detection.cookies) {
      const cookieMatches = await this.checkCookies(detector.detection.cookies);
      if (cookieMatches.length > 0) {
        matches.push(...cookieMatches);
        totalConfidence += cookieMatches.reduce((sum, match) => sum + match.confidence, 0);
        matchCount += cookieMatches.length;
      }
    }

    if (detector.detection.headers) {
      const headerMatches = this.checkHeaders(detector.detection.headers);
      if (headerMatches.length > 0) {
        matches.push(...headerMatches);
        totalConfidence += headerMatches.reduce((sum, match) => sum + match.confidence, 0);
        matchCount += headerMatches.length;
      }
    }

    if (detector.detection.urls) {
      const urlMatches = this.checkUrls(detector.detection.urls);
      if (urlMatches.length > 0) {
        matches.push(...urlMatches);
        totalConfidence += urlMatches.reduce((sum, match) => sum + match.confidence, 0);
        matchCount += urlMatches.length;
      }
    }

    if (detector.detection.scripts) {
      const scriptMatches = this.checkScripts(detector.detection.scripts);
      if (scriptMatches.length > 0) {
        matches.push(...scriptMatches);
        totalConfidence += scriptMatches.reduce((sum, match) => sum + match.confidence, 0);
        matchCount += scriptMatches.length;
      }
    }

    const avgConfidence = matchCount > 0 ? Math.min(100, totalConfidence / matchCount) : 0;
    
    return {
      detected: matchCount > 0,
      confidence: Math.round(avgConfidence),
      matches
    };
  }

  async checkCookies(cookieRules) {
    const matches = [];
    
    // First try to get all cookies including HttpOnly from background script
    let allCookies = [];
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'getCookies',
        url: window.location.href
      });
      
      if (response && response.cookies) {
        allCookies = response.cookies;
        console.log('Got', allCookies.length, 'cookies from background script');
      }
    } catch (e) {
      console.log('Failed to get cookies from background, falling back to document.cookie:', e);
    }
    
    // If background script fails or returns empty, fall back to document.cookie
    if (allCookies.length === 0) {
      const cookies = document.cookie.split(';').map(c => c.trim());
      allCookies = cookies.map(cookie => {
        const [name, value] = cookie.split('=');
        return { name: name ? name.trim() : '', value: value ? value.trim() : '' };
      }).filter(c => c.name);
      console.log('Fallback: Got', allCookies.length, 'cookies from document.cookie');
    }
    
    console.log('Checking', cookieRules.length, 'cookie rules against', allCookies.length, 'cookies');
    console.log('Available cookies:', allCookies.map(c => c.name));
    console.log('Looking for cookie patterns:', cookieRules.map(r => r.name));
    
    for (const rule of cookieRules) {
      for (const cookie of allCookies) {
        if (cookie.name && this.matchesPattern(cookie.name, rule.name)) {
          if (!rule.value || this.matchesPattern(cookie.value, rule.value)) {
            matches.push({
              type: 'cookie',
              name: cookie.name,
              value: cookie.value || '',
              confidence: rule.confidence || 50,
              httpOnly: cookie.httpOnly || false
            });
          }
        }
      }
    }
    
    return matches;
  }

  checkHeaders(headerRules) {
    const matches = [];
    
    // Check actual HTTP headers
    for (const rule of headerRules) {
      for (const [headerName, headerValue] of Object.entries(this.cachedHeaders)) {
        if (this.matchesPattern(headerName, rule.name)) {
          if (!rule.value || this.matchesPattern(headerValue, rule.value)) {
            matches.push({
              type: 'header',
              name: headerName,
              value: headerValue,
              confidence: rule.confidence || 50
            });
          }
        }
      }
    }
    
    // Also check meta tags as fallback
    for (const rule of headerRules) {
      const metaTags = document.querySelectorAll('meta[http-equiv], meta[name]');
      for (const meta of metaTags) {
        const name = meta.getAttribute('http-equiv') || meta.getAttribute('name');
        const content = meta.getAttribute('content');
        
        if (name && this.matchesPattern(name, rule.name)) {
          if (!rule.value || this.matchesPattern(content, rule.value)) {
            // Check if we already have this header from HTTP headers
            const existingMatch = matches.find(m => 
              m.name.toLowerCase() === name.toLowerCase()
            );
            if (!existingMatch) {
              matches.push({
                type: 'meta-header',
                name: name,
                value: content,
                confidence: (rule.confidence || 50) * 0.8 // Lower confidence for meta tags
              });
            }
          }
        }
      }
    }
    
    return matches;
  }

  checkUrls(urlRules) {
    const matches = [];
    const scripts = document.querySelectorAll('script[src]');
    const links = document.querySelectorAll('link[href]');
    const images = document.querySelectorAll('img[src]');
    
    const allUrls = [
      ...Array.from(scripts).map(s => s.src),
      ...Array.from(links).map(l => l.href),
      ...Array.from(images).map(i => i.src),
      window.location.href
    ];
    
    for (const rule of urlRules) {
      for (const url of allUrls) {
        if (this.matchesPattern(url, rule.pattern)) {
          matches.push({
            type: 'url',
            url: url,
            pattern: rule.pattern,
            confidence: rule.confidence || 50
          });
        }
      }
    }
    
    return matches;
  }

  checkScripts(scriptRules) {
    const matches = [];
    const scripts = document.querySelectorAll('script');
    
    for (const rule of scriptRules) {
      for (const script of scripts) {
        const content = script.textContent || script.innerHTML;
        if (content && this.matchesPattern(content, rule.content)) {
          matches.push({
            type: 'script',
            content: rule.content,
            confidence: rule.confidence || 50
          });
        }
      }
      
      if (window[rule.content] !== undefined) {
        matches.push({
          type: 'global',
          content: rule.content,
          confidence: rule.confidence || 50
        });
      }
    }
    
    return matches;
  }

  matchesPattern(text, pattern, isRegex = false) {
    if (!text || !pattern) return false;
    
    // Check if pattern object has type property (for custom rules)
    if (typeof pattern === 'object' && pattern.pattern) {
      isRegex = pattern.type === 'regex';
      pattern = pattern.pattern;
    }
    
    // Handle regex patterns
    if (isRegex || (pattern.startsWith('/') && pattern.endsWith('/'))) {
      try {
        // Extract regex pattern and flags
        let regexPattern = pattern;
        let flags = 'i'; // Default to case-insensitive
        
        if (pattern.startsWith('/') && pattern.endsWith('/')) {
          // Remove leading and trailing slashes
          regexPattern = pattern.slice(1, -1);
        } else if (pattern.includes('/') && pattern.lastIndexOf('/') > 0) {
          // Handle patterns with flags like /pattern/gi
          const lastSlash = pattern.lastIndexOf('/');
          regexPattern = pattern.slice(1, lastSlash);
          flags = pattern.slice(lastSlash + 1) || 'i';
        }
        
        const regex = new RegExp(regexPattern, flags);
        return regex.test(text);
      } catch (e) {
        console.warn('Invalid regex pattern:', pattern, e);
        // Fall back to literal matching if regex is invalid
        return text.toLowerCase().includes(pattern.toLowerCase());
      }
    }
    
    // Handle wildcard patterns (legacy support)
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'), 'i');
      return regex.test(text);
    }
    
    // Default to literal case-insensitive matching
    return text.toLowerCase().includes(pattern.toLowerCase());
  }

  sendResults() {
    console.log('Sending results to background:', this.detectedSolutions.length, 'detections');
    
    // Extract parameters for all detected solutions
    this.detectedSolutions.forEach(solution => {
      // Check for reCAPTCHA (name or key contains recaptcha)
      if (solution.key === 'recaptcha' || 
          (solution.name && solution.name.toLowerCase().includes('recaptcha'))) {
        solution.parameters = this.extractReCaptchaParameters();
      } 
      // Check for hCaptcha
      else if (solution.key === 'hcaptcha' || 
               (solution.name && solution.name.toLowerCase().includes('hcaptcha'))) {
        solution.parameters = this.extractHCaptchaParameters();
      }
      // Extract parameters for other solutions based on their matches
      else {
        solution.parameters = this.extractGenericParameters(solution);
      }
    });

    chrome.runtime.sendMessage({
      action: 'detectionResults',
      url: window.location.href,
      results: this.detectedSolutions
    }).then(response => {
      console.log('🛡️ Results sent successfully:', response);
    }).catch(error => {
      console.error('🛡️ Failed to send results:', error);
    });
  }

  extractReCaptchaParameters() {
    const parameters = {};

    // Look for reCAPTCHA div elements
    const recaptchaElements = document.querySelectorAll('[data-sitekey], .g-recaptcha, .grecaptcha-badge');
    
    for (const element of recaptchaElements) {
      const sitekey = element.getAttribute('data-sitekey') || element.getAttribute('data-site-key');
      if (sitekey) {
        parameters.sitekey = sitekey;
      }

      const action = element.getAttribute('data-action');
      if (action) {
        parameters.action = action;
        parameters.version = 'v3';
      }

      const size = element.getAttribute('data-size');
      if (size === 'invisible') {
        parameters.invisible = true;
      }
    }

    // Check for reCAPTCHA scripts
    const scripts = document.querySelectorAll('script[src*="recaptcha"]');
    for (const script of scripts) {
      const src = script.getAttribute('src');
      if (src.includes('enterprise')) {
        parameters.enterprise = true;
      }
      if (src.includes('recaptcha.net')) {
        parameters.apiDomain = 'recaptcha.net';
      }
    }

    // Check for grecaptcha global object
    if (typeof window.grecaptcha !== 'undefined') {
      parameters.grecaptcha_loaded = true;
      try {
        // Try to extract version from grecaptcha object
        if (window.grecaptcha.enterprise) {
          parameters.enterprise = true;
        }
      } catch (e) {
        // Ignore errors accessing grecaptcha
      }
    }

    // Detect version if not already set
    if (!parameters.version) {
      if (parameters.action || document.querySelector('[data-action]')) {
        parameters.version = 'v3';
      } else if (parameters.sitekey || document.querySelector('.g-recaptcha')) {
        parameters.version = 'v2';
      }
    }

    // Set default values for boolean parameters
    if (parameters.enterprise === undefined) parameters.enterprise = false;
    if (parameters.invisible === undefined) parameters.invisible = false;


    return parameters;
  }

  extractHCaptchaParameters() {
    const parameters = {};

    // Look for hCaptcha div elements (broader search)
    const hcaptchaElements = document.querySelectorAll('[data-sitekey], .h-captcha, [data-captcha="hcaptcha"], .hcaptcha');
    
    for (const element of hcaptchaElements) {
      const sitekey = element.getAttribute('data-sitekey');
      if (sitekey) {
        parameters.sitekey = sitekey;
      }

      const rqdata = element.getAttribute('data-rqdata');
      if (rqdata) {
        parameters.rqdata = rqdata;
        parameters.enterprise = true;
      }
    }

    // Check for hCaptcha scripts with enterprise parameters
    const scripts = document.querySelectorAll('script[src*="hcaptcha"]');
    if (scripts.length > 0) {
      parameters.scripts_loaded = true;
    }
    
    for (const script of scripts) {
      const src = script.getAttribute('src');
      const enterpriseParams = ['sentry', 'custom', 'apiEndpoint', 'endpoint', 'reportapi', 'assethost', 'imghost', 'recaptchacompat'];
      
      if (enterpriseParams.some(param => src.includes(param))) {
        parameters.enterprise = true;
      }
    }

    // Check for hcaptcha global object
    if (typeof window.hcaptcha !== 'undefined') {
      parameters.hcaptcha_loaded = true;
      parameters.enterprise = true;
    }

    // Set default values for boolean parameters
    if (parameters.enterprise === undefined) parameters.enterprise = false;


    return parameters;
  }

  extractGenericParameters(solution) {
    const parameters = {
      solution_name: solution.name,
      detection_key: solution.key,
      confidence: solution.confidence,
      category: solution.category || 'Unknown',
      website: solution.website || '',
      matches_found: solution.matches?.length || 0
    };

    // Extract useful data from matches
    if (solution.matches && solution.matches.length > 0) {
      const cookies = solution.matches.filter(m => m.type === 'cookie');
      const headers = solution.matches.filter(m => m.type === 'header' || m.type === 'meta-header');
      const urls = solution.matches.filter(m => m.type === 'url');
      const scripts = solution.matches.filter(m => m.type === 'script' || m.type === 'global');

      if (cookies.length > 0) {
        parameters.detected_cookies = cookies.map(c => ({
          name: c.name,
          value: c.value ? c.value.substring(0, 50) + (c.value.length > 50 ? '...' : '') : null
        }));
        parameters.cookie_count = cookies.length;
      }

      if (headers.length > 0) {
        parameters.detected_headers = headers.map(h => ({
          name: h.name,
          value: h.value ? h.value.substring(0, 100) + (h.value.length > 100 ? '...' : '') : null,
          source: h.type
        }));
        parameters.header_count = headers.length;
      }

      if (urls.length > 0) {
        parameters.detected_urls = urls.map(u => ({
          url: u.url ? u.url.substring(0, 100) + (u.url.length > 100 ? '...' : '') : null,
          pattern: u.pattern
        }));
        parameters.url_count = urls.length;
      }

      if (scripts.length > 0) {
        parameters.detected_scripts = scripts.map(s => ({
          content: s.content,
          type: s.type
        }));
        parameters.script_count = scripts.length;
      }

      // Add current page info
      parameters.page_url = window.location.href;
      parameters.page_domain = window.location.hostname;
      parameters.user_agent = navigator.userAgent.substring(0, 100) + '...';
      parameters.detected_at = new Date().toISOString();
    }

    return parameters;
  }

  setupAdvancedDetection() {
    // Monitor for reCAPTCHA interactions
    this.monitorRecaptchaInteractions();
    
    // Monitor for hCaptcha interactions  
    this.monitorHCaptchaInteractions();
    
    // Monitor for form submissions that might trigger anti-bot
    this.monitorFormSubmissions();
    
    // Monitor for button clicks that might trigger captcha
    this.monitorButtonClicks();
    
    // Set up periodic check for new captcha elements
    setInterval(() => this.refreshAdvancedMonitoring(), 2000);
  }

  monitorRecaptchaInteractions() {
    // Monitor grecaptcha ready event
    if (typeof window.grecaptcha !== 'undefined') {
      try {
        window.grecaptcha.ready(() => {
          console.log('reCAPTCHA ready detected');
          this.captchaInteractionDetected = true;
          this.triggerAdvancedAnalysis('recaptcha', 'ready');
        });
      } catch (e) {}
    }

    // Monitor for reCAPTCHA iframe interactions
    const recaptchaFrames = document.querySelectorAll('iframe[src*="recaptcha"]');
    recaptchaFrames.forEach(frame => {
      frame.addEventListener('load', () => {
        console.log('reCAPTCHA iframe loaded');
        this.captchaInteractionDetected = true;
        this.triggerAdvancedAnalysis('recaptcha', 'iframe_loaded');
      });
    });

    // Monitor clicks on reCAPTCHA elements
    document.addEventListener('click', (e) => {
      const target = e.target.closest('.g-recaptcha, .grecaptcha-badge, [data-sitekey]');
      if (target && target.getAttribute('data-sitekey')) {
        console.log('reCAPTCHA element clicked');
        this.captchaInteractionDetected = true;
        this.triggerAdvancedAnalysis('recaptcha', 'user_click');
      }
    }, true);
  }

  monitorHCaptchaInteractions() {
    // Monitor hcaptcha ready event
    if (typeof window.hcaptcha !== 'undefined') {
      console.log('hCaptcha object detected');
      this.captchaInteractionDetected = true;
      this.triggerAdvancedAnalysis('hcaptcha', 'ready');
    }

    // Monitor clicks on hCaptcha elements
    document.addEventListener('click', (e) => {
      const target = e.target.closest('.h-captcha, [data-captcha="hcaptcha"], .hcaptcha');
      if (target) {
        console.log('hCaptcha element clicked');
        this.captchaInteractionDetected = true;
        this.triggerAdvancedAnalysis('hcaptcha', 'user_click');
      }
    }, true);
  }

  monitorFormSubmissions() {
    document.addEventListener('submit', (e) => {
      const form = e.target;
      // Check if form contains captcha elements
      const hasRecaptcha = form.querySelector('.g-recaptcha, [data-sitekey]');
      const hasHcaptcha = form.querySelector('.h-captcha, [data-captcha="hcaptcha"]');
      
      if (hasRecaptcha || hasHcaptcha) {
        console.log('Form with captcha submitted');
        this.captchaInteractionDetected = true;
        this.triggerAdvancedAnalysis('form', 'submit_with_captcha');
      }
    }, true);
  }

  monitorButtonClicks() {
    document.addEventListener('click', (e) => {
      const button = e.target.closest('button, input[type="submit"]');
      if (button) {
        const buttonText = button.textContent || button.value || '';
        const lowerText = buttonText.toLowerCase();
        
        // Check for captcha-related button text
        if (lowerText.includes('verify') || lowerText.includes('solve') || 
            lowerText.includes('captcha') || lowerText.includes('human') ||
            lowerText.includes('robot') || lowerText.includes('confirm')) {
          console.log('Potential captcha button clicked:', buttonText);
          this.captchaInteractionDetected = true;
          this.triggerAdvancedAnalysis('button', 'captcha_related_click');
        }
      }
    }, true);
  }

  refreshAdvancedMonitoring() {
    // Re-monitor for new reCAPTCHA elements
    const newRecaptcha = document.querySelectorAll('iframe[src*="recaptcha"]:not([data-monitored])');
    newRecaptcha.forEach(frame => {
      frame.setAttribute('data-monitored', 'true');
      frame.addEventListener('load', () => {
        this.captchaInteractionDetected = true;
        this.triggerAdvancedAnalysis('recaptcha', 'new_iframe');
      });
    });

    // Check for new global objects
    if (typeof window.grecaptcha !== 'undefined' && !window.grecaptchaMonitored) {
      window.grecaptchaMonitored = true;
      this.monitorRecaptchaInteractions();
    }
    
    if (typeof window.hcaptcha !== 'undefined' && !window.hcaptchaMonitored) {
      window.hcaptchaMonitored = true;
      this.monitorHCaptchaInteractions();
    }
  }

  triggerAdvancedAnalysis(type, trigger) {
    console.log(`Advanced analysis triggered: ${type} - ${trigger}`);
    
    // Delay analysis slightly to allow for DOM updates after interaction
    setTimeout(() => {
      this.performAdvancedAnalysis(type, trigger);
    }, 500);
  }

  performAdvancedAnalysis(type, trigger) {
    // Clear previous advanced detections
    this.advancedDetections = [];
    
    // Perform enhanced parameter extraction for active captchas
    for (const solution of this.detectedSolutions) {
      if (this.isRelevantForAdvanced(solution, type)) {
        const advancedParams = this.extractAdvancedParameters(solution, trigger);
        if (Object.keys(advancedParams).length > 0) {
          this.advancedDetections.push({
            ...solution,
            advancedParameters: advancedParams,
            trigger: trigger,
            timestamp: Date.now()
          });
        }
      }
    }
    
    // Send advanced results to popup
    this.sendAdvancedResults();
  }

  isRelevantForAdvanced(solution, type) {
    const solutionType = solution.key.toLowerCase();
    
    if (type === 'recaptcha' && solutionType.includes('recaptcha')) return true;
    if (type === 'hcaptcha' && solutionType.includes('hcaptcha')) return true;
    if (type === 'form' || type === 'button') return true;
    
    return false;
  }

  extractAdvancedParameters(solution, trigger) {
    const params = {};
    
    // Extract enhanced reCAPTCHA parameters
    if (solution.key === 'recaptcha' && typeof window.grecaptcha !== 'undefined') {
      try {
        params.grecaptcha_version = window.grecaptcha.enterprise ? 'enterprise' : 'standard';
        params.grecaptcha_ready = typeof window.grecaptcha.ready === 'function';
        params.grecaptcha_render = typeof window.grecaptcha.render === 'function';
        params.trigger_type = trigger;
        
        // Try to get sitekey from DOM
        const sitekeyElement = document.querySelector('[data-sitekey]');
        if (sitekeyElement) {
          params.sitekey = sitekeyElement.getAttribute('data-sitekey');
          params.size = sitekeyElement.getAttribute('data-size') || 'normal';
          params.theme = sitekeyElement.getAttribute('data-theme') || 'light';
          params.badge = sitekeyElement.getAttribute('data-badge') || 'bottomright';
        }
        
        // Check for invisible reCAPTCHA
        const invisibleElements = document.querySelectorAll('[data-size="invisible"]');
        if (invisibleElements.length > 0) {
          params.invisible_recaptcha = true;
          params.invisible_count = invisibleElements.length;
        }
      } catch (e) {
        params.extraction_error = e.message;
      }
    }
    
    // Extract enhanced hCaptcha parameters
    if (solution.key === 'hcaptcha' && typeof window.hcaptcha !== 'undefined') {
      try {
        params.hcaptcha_ready = typeof window.hcaptcha.render === 'function';
        params.trigger_type = trigger;
        
        const sitekeyElement = document.querySelector('.h-captcha[data-sitekey]');
        if (sitekeyElement) {
          params.sitekey = sitekeyElement.getAttribute('data-sitekey');
          params.size = sitekeyElement.getAttribute('data-size') || 'normal';
          params.theme = sitekeyElement.getAttribute('data-theme') || 'light';
        }
      } catch (e) {
        params.extraction_error = e.message;
      }
    }
    
    // Extract form context if triggered from form
    if (trigger.includes('form') || trigger.includes('submit')) {
      const forms = document.querySelectorAll('form');
      params.form_count = forms.length;
      params.forms_with_captcha = document.querySelectorAll('form .g-recaptcha, form .h-captcha').length;
    }
    
    return params;
  }

  sendAdvancedResults() {
    if (this.advancedDetections.length > 0) {
      chrome.runtime.sendMessage({
        action: 'advancedResults',
        results: this.advancedDetections,
        url: window.location.href,
        timestamp: Date.now()
      });
    }
  }

  setupUrlChangeDetection() {
    // Monitor for URL changes (for SPAs and hash changes)
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    
    const urlChanged = () => {
      const newUrl = window.location.href;
      if (newUrl !== this.currentUrl) {
        console.log('URL changed:', this.currentUrl, '->', newUrl);
        this.currentUrl = newUrl;
        
        // Clear previous results and re-analyze for new URL
        this.detectedSolutions = [];
        this.advancedDetections = [];
        this.captchaInteractionDetected = false;
        
        // Re-analyze with a small delay to allow page to settle
        setTimeout(async () => {
          await this.loadHeaders();
          await this.analyze();
        }, 300);
      }
    };
    
    // Override history methods to detect programmatic navigation
    history.pushState = function(...args) {
      originalPushState.apply(history, args);
      setTimeout(urlChanged, 0);
    };
    
    history.replaceState = function(...args) {
      originalReplaceState.apply(history, args);
      setTimeout(urlChanged, 0);
    };
    
    // Listen for popstate events (back/forward button)
    window.addEventListener('popstate', urlChanged);
    
    // Listen for hash changes
    window.addEventListener('hashchange', urlChanged);
  }
}

// Global variables for extension functionality
let analyzeTimeout;
let lastResultsHash = '';
let isAnalyzing = false;
let detector = null;

// Create the single detector instance
console.log('🛡️ ShieldEye: Creating detector instance...');
detector = new AntiBotDetector();
console.log('🛡️ ShieldEye: Content script loaded and detector created!');

if (typeof chrome !== 'undefined' && chrome.runtime) {
  
  // Override the sendResults method to add simple deduplication
  const originalSendResults = detector.sendResults.bind(detector);
  detector.sendResults = function() {
    const resultsHash = JSON.stringify(this.detectedSolutions.map(s => ({ 
      key: s.key, 
      name: s.name, 
      confidence: s.confidence,
      matchCount: s.matches?.length || 0
    })));
    
    // Only prevent duplicates if exact same results were sent very recently (within 1 second)
    if (resultsHash === lastResultsHash && Date.now() - detector.lastSentTime < 1000) {
      return;
    }
    
    lastResultsHash = resultsHash;
    detector.lastSentTime = Date.now();
    originalSendResults();
  };
  
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'ping') {
      sendResponse({ success: true, ready: true });
    } else if (request.action === 'reanalyze') {
      // Clear any pending analysis
      clearTimeout(analyzeTimeout);
      detector.analyze().then(() => {
        sendResponse({ success: true });
      }).catch(error => {
        console.error('Analysis error:', error);
        sendResponse({ success: false, error: error.message });
      });
      return true; // Keep message channel open for async response
    } else if (request.action === 'getResults') {
      // Also send results to background immediately when popup asks
      detector.sendResults();
      sendResponse({ results: detector.detectedSolutions });
    } else if (request.action === 'detectorsUpdated') {
      // Background service will refresh its cache, then we reload from there
      console.log('Detectors updated, requesting fresh detectors from background...');
      detector.loadDetectors().then(() => {
        sendResponse({ success: true });
      }).catch(error => {
        console.error('Detector loading error:', error);
        sendResponse({ success: false, error: error.message });
      });
      return true; // Keep message channel open for async response
    } else if (request.action === 'reloadCustomRules') {
      // Check if extension context is still valid
      if (!chrome.runtime?.id) {
        sendResponse({ success: false, error: 'Extension context invalidated' });
        return true;
      }
      
      Promise.all([
        detector.loadCustomRules(),
        detector.loadHeaders()
      ]).then(async () => {
        // Double-check context before analyzing
        if (chrome.runtime?.id) {
          await detector.analyze();
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'Extension context invalidated during reload' });
        }
      }).catch(error => {
        if (error.message?.includes('Extension context invalidated')) {
          console.warn('🛡️ Extension reloaded during custom rules reload');
          sendResponse({ success: false, error: 'Extension reloaded' });
        } else {
          console.error('Custom rules reload error:', error);
          sendResponse({ success: false, error: error.message });
        }
      });
      return true; // Keep message channel open for async response
    } else if (request.action === 'reloadSettings') {
      // Check if extension context is still valid
      if (!chrome.runtime?.id) {
        sendResponse({ success: false, error: 'Extension context invalidated' });
        return true;
      }
      
      // Reload enabled state and reanalyze
      console.log('🛡️ Content script: Reloading settings...');
      detector.checkEnabled().then(async () => {
        console.log('🛡️ Content script: Enabled state reloaded:', detector.isEnabled);
        // Double-check context before analyzing
        if (chrome.runtime?.id) {
          await detector.analyze();
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'Extension context invalidated during settings reload' });
        }
      }).catch(error => {
        if (error.message?.includes('Extension context invalidated')) {
          console.warn('🛡️ Extension reloaded during settings reload');
          sendResponse({ success: false, error: 'Extension reloaded' });
        } else {
          console.error('Settings reload error:', error);
          sendResponse({ success: false, error: error.message });
        }
      });
      return true; // Keep message channel open for async response
    }
  });
  
  const observer = new MutationObserver(() => {
    // Check if extension context is still valid
    if (!chrome.runtime?.id) {
      observer.disconnect();
      console.warn('🛡️ Extension context invalidated, disconnecting observer');
      return;
    }
    
    // Debounce DOM changes to avoid excessive analysis
    clearTimeout(analyzeTimeout);
    analyzeTimeout = setTimeout(async () => {
      try {
        // Double-check context validity before analyzing
        if (chrome.runtime?.id) {
          await detector.analyze();
        }
      } catch (error) {
        if (error.message?.includes('Extension context invalidated')) {
          observer.disconnect();
          console.warn('🛡️ Extension reloaded, stopping analysis');
        } else {
          console.error('Analysis error in MutationObserver:', error);
        }
      }
    }, 500); // Debounce for 500ms
  });
  
  observer.observe(document, {
    childList: true,
    subtree: true
  });
}