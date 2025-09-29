/**
 * DetectionEngineManager - Core module for collecting page data for security detection
 * Collects cookies, DOM elements, scripts, and URLs for analysis
 *
 * Storage Configuration:
 * - Detection results are cached per URL to avoid repeated analysis
 * - Cache expires after 12 hours to ensure fresh detection
 * - Storage key: 'scrapfly_detection_storage'
 */
class DetectionEngineManager {
    // Detection storage configuration constants
    static STORAGE_KEY = 'scrapfly_detection_storage';
    static EXPIRY_HOURS = 12; // Cached detections expire after 12 hours
    static EXPIRY_MS = DetectionEngineManager.EXPIRY_HOURS * 60 * 60 * 1000; // 12 hours in milliseconds

    constructor() {
        this.detectionData = null;
        this.lastDetectionTime = null;
        // Only create ConfidenceManager if it's available (not in content script)
        this.confidenceManager = typeof ConfidenceManager !== 'undefined' ? new ConfidenceManager() : null;
        this.cleanupInterval = null;
    }

    /**
     * Main method to collect all page data for detection
     * @returns {Promise<object>} Complete page data for detection analysis
     */
    async collectPageData() {
        console.log('DetectionEngineManager: Collecting page data...');

        // Fetch external resource content asynchronously
        let externalContent = [];
        try {
            externalContent = await this.extractExternalContent();
        } catch (error) {
            console.error('DetectionEngineManager: Error fetching external content:', error);
            externalContent = [];
        }

        // Extract favicon with multiple fallback strategies
        let favicon = '';
        const faviconSelectors = [
            'link[rel="icon"]',
            'link[rel="shortcut icon"]',
            'link[rel="apple-touch-icon"]',
            'link[rel="apple-touch-icon-precomposed"]',
            'link[type="image/x-icon"]',
            'link[type="image/png"]',
            'link[rel*="icon"]'
        ];

        // Try all selectors and prefer the first valid one
        for (const selector of faviconSelectors) {
            const link = document.querySelector(selector);
            if (link && link.href) {
                favicon = link.href;
                break;
            }
        }

        // If no favicon found in DOM, don't set a fallback
        // Let the Detection UI get it from Chrome's tab API instead
        // This is better for sites that set favicon dynamically

        const pageData = {
            url: window.location.href,
            hostname: window.location.hostname,
            title: document.title || 'Untitled',
            favicon: favicon,
            timestamp: new Date().toISOString(),
            cookies: this.extractCookies(),
            content: this.extractScriptElements(),
            dom: this.extractDOM(),
            pageHTML: document.body ? document.body.innerHTML : '',
            externalContent: externalContent,
            // Headers will be added by background script
            headers: []
        };

        this.detectionData = pageData;
        this.lastDetectionTime = Date.now();

        console.log('DetectionEngineManager: Page data collected', {
            url: pageData.url,
            cookiesCount: pageData.cookies.length,
            contentCount: pageData.content.length,
            domElementsCount: pageData.dom.length,
            externalResourcesCount: pageData.externalContent.length
        });

        return pageData;
    }

    /**
     * Extract all cookies from the current page
     * @returns {array} Array of cookie objects
     */
    extractCookies() {
        const cookies = [];

        if (document.cookie) {
            const cookieStrings = document.cookie.split(';');

            cookieStrings.forEach(cookieString => {
                const trimmed = cookieString.trim();
                const eqIndex = trimmed.indexOf('=');

                if (eqIndex > 0) {
                    const name = trimmed.substring(0, eqIndex);
                    const value = trimmed.substring(eqIndex + 1);

                    cookies.push({
                        name: name,
                        value: value.substring(0, 100), // Limit value length for performance
                        domain: window.location.hostname
                    });
                }
            });
        }

        console.log(`DetectionEngineManager: Found ${cookies.length} cookies`);
        return cookies;
    }

    /**
     * Extract script elements from the page DOM
     * Returns inline scripts and script URLs for CONTENT detection
     * @returns {array} Array of script elements with src URLs and inline content
     */
    extractScriptElements() {
        const scripts = [];
        const scriptElements = document.querySelectorAll('script');

        scriptElements.forEach((script, index) => {
            // External scripts - store both URL and try to get content
            if (script.src) {
                const content = (script.textContent || script.innerHTML || '').trim();
                scripts.push({
                    type: 'external',
                    src: script.src,
                    content: content || script.src
                });
            }
            // Inline scripts
            else if (script.textContent || script.innerHTML) {
                const content = (script.textContent || script.innerHTML || '').trim();
                if (content.length > 0) {
                    scripts.push({
                        type: 'inline',
                        src: null,
                        content: content
                    });
                }
            }
        });

        console.log(`DetectionEngineManager: Found ${scripts.length} script elements`);
        return scripts;
    }

    /**
     * Fetch external resource content (JS, CSS files) via HTTP
     * Downloads actual file content for deeper detection analysis
     * @returns {Promise<array>} Array of fetched resource content
     */
    async extractExternalContent() {
        const resources = [];

        // Get all script sources
        const scriptElements = document.querySelectorAll('script[src]');
        const scriptUrls = Array.from(scriptElements).map(s => s.src).filter(Boolean);
        console.log(`📦 extractExternalContent: Found ${scriptUrls.length} external scripts:`, scriptUrls);

        // Get all CSS links
        const linkElements = document.querySelectorAll('link[rel="stylesheet"]');
        const cssUrls = Array.from(linkElements).map(l => l.href).filter(Boolean);
        console.log(`📦 extractExternalContent: Found ${cssUrls.length} CSS files:`, cssUrls);

        // Combine all URLs
        const allUrls = [...scriptUrls, ...cssUrls];

        console.log(`📦 extractExternalContent: Total ${allUrls.length} external resources to fetch`);

        // Fetch content from each URL
        for (const url of allUrls) {
            try {
                const response = await fetch(url, {
                    method: 'GET',
                    cache: 'default',
                    credentials: 'omit'
                });

                if (response.ok) {
                    const content = await response.text();
                    const resourceType = url.endsWith('.css') ? 'css' : 'javascript';
                    resources.push({
                        url: url,
                        type: resourceType,
                        content: content,
                        size: content.length
                    });
                    console.log(`📦 ✓ Fetched ${resourceType}: ${url} (${content.length} bytes)`);
                    console.log(`📦   Content preview:`, content.substring(0, 200));
                } else {
                    console.log(`📦 ✗ Failed to fetch: ${url} (HTTP ${response.status})`);
                }
            } catch (error) {
                // CORS or network error - skip
                console.log(`📦 ✗ Error fetching: ${url} (${error.message})`);
            }
        }

        console.log(`📦 extractExternalContent: Successfully fetched ${resources.length}/${allUrls.length} resources`);
        console.log(`📦 Total content size: ${resources.reduce((sum, r) => sum + r.size, 0)} bytes`);
        return resources;
    }

    /**
     * Extract DOM elements for detection
     * This collects DOM data that will be matched against detector rules
     * @returns {array} Array of DOM data for matching
     */
    extractDOM() {
        const domData = [];

        // Collect various DOM elements and their attributes
        // The actual detection patterns come from detector rules

        // Check for elements with specific attributes
        const elementsWithDataAttributes = document.querySelectorAll('[data-sitekey], [data-captcha], [data-callback]');
        elementsWithDataAttributes.forEach(element => {
            domData.push({
                selector: element.tagName.toLowerCase(),
                attributes: this.getElementAttributes(element)
            });
        });

        // Check for iframes (often used by security services)
        const iframes = document.querySelectorAll('iframe');
        iframes.forEach(iframe => {
            const src = iframe.getAttribute('src') || '';
            if (src) {
                domData.push({
                    selector: 'iframe',
                    src: src,
                    attributes: this.getElementAttributes(iframe)
                });
            }
        });

        // Check for forms (challenge forms, etc.)
        const forms = document.querySelectorAll('form');
        forms.forEach(form => {
            const action = form.getAttribute('action') || '';
            const id = form.getAttribute('id') || '';
            const className = form.getAttribute('class') || '';

            domData.push({
                selector: 'form',
                action: action,
                id: id,
                class: className,
                attributes: this.getElementAttributes(form)
            });
        });

        // Check for divs with specific IDs or classes (will be matched by detector rules)
        const divsWithId = document.querySelectorAll('div[id], div[class]');
        divsWithId.forEach(div => {
            const id = div.getAttribute('id') || '';
            const className = div.getAttribute('class') || '';

            // Only include if it has meaningful ID or class
            if (id || className) {
                domData.push({
                    selector: 'div',
                    id: id,
                    class: className
                });
            }
        });

        // Check for meta tags (some security services use them)
        const metaTags = document.querySelectorAll('meta[name], meta[property]');
        metaTags.forEach(meta => {
            const name = meta.getAttribute('name') || meta.getAttribute('property') || '';
            const content = meta.getAttribute('content') || '';

            if (name) {
                domData.push({
                    selector: 'meta',
                    name: name,
                    content: content
                });
            }
        });

        // Check for script and noscript elements (for matching against patterns)
        const scripts = document.querySelectorAll('script[src], noscript');
        scripts.forEach(script => {
            if (script.tagName.toLowerCase() === 'script') {
                const src = script.getAttribute('src') || '';
                if (src) {
                    domData.push({
                        selector: 'script',
                        src: src
                    });
                }
            } else if (script.tagName.toLowerCase() === 'noscript') {
                const id = script.getAttribute('id') || '';
                domData.push({
                    selector: 'noscript',
                    id: id,
                    content: script.textContent.substring(0, 200) // First 200 chars
                });
            }
        });

        // Check for canvas elements (fingerprinting detection)
        const canvasElements = document.querySelectorAll('canvas');
        if (canvasElements.length > 0) {
            domData.push({
                selector: 'canvas',
                count: canvasElements.length
            });
        }


        console.log(`DetectionEngineManager: Collected ${domData.length} DOM elements for analysis`);
        return domData;
    }

    /**
     * Get relevant attributes from a DOM element
     * @param {Element} element - DOM element
     * @returns {object} Object with relevant attributes
     */
    getElementAttributes(element) {
        if (!element) return {};

        const attributes = {};
        const relevantAttrs = ['id', 'class', 'src', 'href', 'action', 'data-sitekey', 'data-callback'];

        relevantAttrs.forEach(attr => {
            if (element.hasAttribute(attr)) {
                let value = element.getAttribute(attr);
                // Limit attribute value length
                if (value && value.length > 100) {
                    value = value.substring(0, 100) + '...';
                }
                attributes[attr] = value;
            }
        });

        return attributes;
    }

    /**
     * Check if enough time has passed since last detection
     * @param {number} minInterval - Minimum interval in milliseconds
     * @returns {boolean} True if should run detection
     */
    shouldRunDetection(minInterval = 1000) {
        if (!this.lastDetectionTime) return true;
        return (Date.now() - this.lastDetectionTime) > minInterval;
    }

    /**
     * Clear stored detection data
     */
    clearDetectionData() {
        this.detectionData = null;
        this.lastDetectionTime = null;
    }

    /**
     * Set detectors for detection analysis
     * @param {object} detectors - Detector configurations organized by category
     */
    setDetectors(detectors) {
        this.detectors = detectors;
    }

    /**
     * Run detection on page data and return found security technologies
     * @param {object} pageData - Object containing url, scripts, and dom elements
     * @returns {array} Array of detection results
     */
    detectOnPage(pageData = {}) {
        console.log('🔍 DetectionEngineManager.detectOnPage called');

        if (!this.detectors) {
            console.error('❌ Detectors not set!');
            throw new Error('Detectors not set. Call setDetectors() first.');
        }

        const detections = [];
        const { url = '', content = [], dom = [], cookies = [], headers = {}, pageHTML = '', externalContent = [] } = pageData;

        console.log('📊 Page Data Summary:', {
            url: url,
            contentCount: content.length,
            domCount: dom.length,
            cookiesCount: cookies.length,
            headersCount: Object.keys(headers).length,
            pageHTMLLength: pageHTML.length,
            externalContentCount: externalContent.length
        });

        console.log('🔍 Cookies:', cookies);
        console.log('🔍 Content sample:', content.slice(0, 3));

        const categoriesCount = Object.keys(this.detectors).length;
        console.log(`📦 Processing ${categoriesCount} categories...`);
        console.log('📋 All detectors loaded:', Object.entries(this.detectors).map(([cat, dets]) =>
            `${cat}: [${Object.keys(dets).join(', ')}]`
        ).join(' | '));

        for (const [category, categoryDetectors] of Object.entries(this.detectors)) {
            const detectorsInCategory = Object.keys(categoryDetectors).length;
            console.log(`  📁 Category: ${category} (${detectorsInCategory} detectors)`);

            for (const [detectorName, detector] of Object.entries(categoryDetectors)) {
                // Skip disabled detectors (enabled === false)
                if (detector.enabled === false) {
                    console.log(`    ⏭️  Skipping disabled detector: ${detectorName}`);
                    continue;
                }

                const detection = this.runDetector(detector, { url, content, dom, cookies, headers, pageHTML, externalContent });
                if (detection.detected) {
                    console.log(`    ✅ DETECTED: ${detectorName} (confidence: ${detection.confidence}%)`);
                    detections.push({
                        ...detection,
                        category,
                        detector: {
                            name: detector.name || detectorName,
                            icon: detector.icon,
                            color: detector.color,
                            id: detector.id || detectorName
                        }
                    });
                }
            }
        }

        console.log(`🎯 Total detections found: ${detections.length}`);
        if (detections.length > 0) {
            console.log('Detections:', detections.map(d => d.detector.name));
        }

        return detections;
    }

    /**
     * Run a single detector against page data
     * @param {object} detector - Detector configuration
     * @param {object} pageData - Page data to analyze
     * @returns {object} Detection result with confidence and matches
     */
    runDetector(detector, pageData) {
        const { url, content, dom, cookies = [], headers = {}, pageHTML = '', externalContent = [] } = pageData;
        const matches = [];

        if (detector.detection?.urls) {
            for (const urlPattern of detector.detection.urls) {
                const matchOptions = {
                    regex: urlPattern.nameRegex === true,
                    wholeWord: urlPattern.nameWholeWord === true,
                    caseSensitive: urlPattern.nameCaseSensitive === true
                };

                // Check main page URL
                if (this.matchPattern(url, urlPattern.pattern, matchOptions)) {
                    matches.push({
                        type: 'urls',
                        pattern: urlPattern.pattern,
                        value: url,
                        confidence: urlPattern.confidence,
                        description: urlPattern.description
                    });
                }

                // Also check all script src URLs
                if (content && content.length > 0) {
                    for (const script of content) {
                        const scriptSrc = script.src || '';
                        if (scriptSrc && this.matchPattern(scriptSrc, urlPattern.pattern, matchOptions)) {
                            // Check if we already have this pattern to avoid duplicates
                            const alreadyAdded = matches.some(m => m.type === 'urls' && m.pattern === urlPattern.pattern);
                            if (!alreadyAdded) {
                                matches.push({
                                    type: 'urls',
                                    pattern: urlPattern.pattern,
                                    value: scriptSrc,
                                    confidence: urlPattern.confidence,
                                    description: urlPattern.description
                                });
                            }
                        }
                    }
                }
            }
        }

        // Check content patterns
        const contentPatterns = detector.detection?.content;
        console.log(`[Content Detection] ${detector.name}: contentPatterns=${!!contentPatterns}, count=${contentPatterns?.length || 0}, hasPageHTML=${!!pageHTML}, pageHTMLLength=${pageHTML?.length || 0}`);

        if (contentPatterns && pageHTML) {
            console.log(`[Content Detection] ${detector.name}: Starting check of ${contentPatterns.length} patterns`);
            for (const contentPattern of contentPatterns) {
                console.log(`[Content Detection] ${detector.name}: Pattern="${contentPattern.content}", regex=${contentPattern.nameRegex}, wholeWord=${contentPattern.nameWholeWord}, caseSensitive=${contentPattern.nameCaseSensitive}`);

                const matchOptions = {
                    regex: contentPattern.nameRegex === true,
                    wholeWord: contentPattern.nameWholeWord === true,
                    caseSensitive: contentPattern.nameCaseSensitive === true
                };

                // Determine where to search based on settings
                // If checkScripts, checkClasses, or checkValues is explicitly set to true, restrict search
                // If all are false or undefined, search entire page (default)
                const checkScripts = contentPattern.checkScripts === true;
                const checkClasses = contentPattern.checkClasses === true;
                const checkValues = contentPattern.checkValues === true;
                const hasRestriction = checkScripts || checkClasses || checkValues;

                console.log(`[Content Detection] ${detector.name}: checkScripts=${checkScripts}, checkClasses=${checkClasses}, checkValues=${checkValues}, hasRestriction=${hasRestriction}`);

                let found = false;
                let foundIn = '';

                if (!hasRestriction) {
                    // No restrictions = check entire page HTML + external content (default behavior)
                    console.log(`[Content Detection] ${detector.name}: Searching entire page HTML for "${contentPattern.content}"`);
                    if (this.matchPattern(pageHTML, contentPattern.content, matchOptions)) {
                        found = true;
                        foundIn = 'page content';
                        console.log(`[Content Detection] ${detector.name}: ✓ MATCH FOUND in page content!`);
                    }

                    // Also search external fetched content
                    if (!found && pageData.externalContent && pageData.externalContent.length > 0) {
                        console.log(`[Content Detection] ${detector.name}: Searching ${pageData.externalContent.length} external resources`);
                        for (const resource of pageData.externalContent) {
                            if (this.matchPattern(resource.content, contentPattern.content, matchOptions)) {
                                found = true;
                                foundIn = resource.url;
                                console.log(`[Content Detection] ${detector.name}: ✓ MATCH FOUND in external resource: ${resource.url}`);
                                break;
                            }
                        }
                    }

                    if (!found) {
                        console.log(`[Content Detection] ${detector.name}: ✗ No match in page content or external resources`);
                    }
                } else {
                    // Check only specific areas that are enabled
                    if (checkScripts && content.length > 0) {
                        for (const script of content) {
                            const scriptContent = script.content || script.src || '';
                            if (this.matchPattern(scriptContent, contentPattern.content, matchOptions)) {
                                found = true;
                                foundIn = script.src || 'inline script';
                                break;
                            }
                        }
                    }

                    if (!found && checkClasses) {
                        // Check class attributes in HTML
                        const classRegex = /class="([^"]*)"/gi;
                        let match;
                        while ((match = classRegex.exec(pageHTML)) !== null) {
                            if (this.matchPattern(match[1], contentPattern.content, matchOptions)) {
                                found = true;
                                foundIn = 'class attribute';
                                break;
                            }
                        }
                    }

                    if (!found && checkValues) {
                        // Check value, data-, and other attributes
                        const valueRegex = /(?:value|data-[^=]*)="([^"]*)"/gi;
                        let match;
                        while ((match = valueRegex.exec(pageHTML)) !== null) {
                            if (this.matchPattern(match[1], contentPattern.content, matchOptions)) {
                                found = true;
                                foundIn = 'attribute value';
                                break;
                            }
                        }
                    }
                }

                if (found) {
                    console.log(`[Content Detection] ${detector.name}: Adding match! confidence=${contentPattern.confidence}, foundIn=${foundIn}`);
                    matches.push({
                        type: 'content',
                        pattern: contentPattern.content,
                        value: foundIn || 'Found in page content',
                        confidence: contentPattern.confidence,
                        description: contentPattern.description
                    });
                } else {
                    console.log(`[Content Detection] ${detector.name}: Pattern not found: "${contentPattern.content}"`);
                }
            }
        } else {
            if (!contentPatterns) {
                console.log(`[Content Detection] ${detector.name}: No content patterns defined`);
            }
            if (!pageHTML) {
                console.log(`[Content Detection] ${detector.name}: No pageHTML provided!`);
            }
        }

        // Check cookies patterns
        if (detector.detection?.cookies && cookies.length > 0) {
            console.log(`[Cookie Detection] Checking ${detector.detection.cookies.length} cookie patterns against ${cookies.length} cookies`);
            console.log('[Cookie Detection] Available cookies:', cookies.map(c => c.name).join(', '));

            for (const cookiePattern of detector.detection.cookies) {
                console.log(`[Cookie Detection] Pattern:`, cookiePattern);

                const nameMatchOptions = {
                    regex: cookiePattern.nameRegex === true,
                    wholeWord: cookiePattern.nameWholeWord === true,
                    caseSensitive: cookiePattern.nameCaseSensitive === true
                };

                const valueMatchOptions = {
                    regex: cookiePattern.valueRegex === true,
                    wholeWord: cookiePattern.valueWholeWord === true,
                    caseSensitive: cookiePattern.valueCaseSensitive === true
                };

                console.log(`[Cookie Detection] Name match options:`, nameMatchOptions);

                const matchingCookie = cookies.find(cookie => {
                    // Match by name using matchPattern helper
                    if (cookiePattern.name && cookie.name) {
                        const matched = this.matchPattern(cookie.name, cookiePattern.name, nameMatchOptions);
                        console.log(`[Cookie Detection] Testing "${cookie.name}" against pattern "${cookiePattern.name}": ${matched}`);

                        if (matched) {
                            // If value pattern specified, check it too
                            if (cookiePattern.value) {
                                const valueMatched = this.matchPattern(cookie.value || '', cookiePattern.value, valueMatchOptions);
                                console.log(`[Cookie Detection] Value match result: ${valueMatched}`);
                                return valueMatched;
                            }
                            return true;
                        }
                    }
                    return false;
                });

                if (matchingCookie) {
                    console.log(`[Cookie Detection] ✓ Match found: ${matchingCookie.name}`);
                    matches.push({
                        type: 'cookies',
                        name: matchingCookie.name,
                        value: `${matchingCookie.name}=${matchingCookie.value || ''}`,
                        confidence: cookiePattern.confidence || 80,
                        description: cookiePattern.description
                    });
                } else {
                    console.log(`[Cookie Detection] ✗ No match found for pattern "${cookiePattern.name}"`);
                }
            }
        }

        // Check headers patterns
        if (detector.detection?.headers && Object.keys(headers).length > 0) {
            for (const headerPattern of detector.detection.headers) {
                const nameMatchOptions = {
                    regex: headerPattern.nameRegex === true,
                    wholeWord: headerPattern.nameWholeWord === true,
                    caseSensitive: headerPattern.nameCaseSensitive === true
                };

                const valueMatchOptions = {
                    regex: headerPattern.valueRegex === true,
                    wholeWord: headerPattern.valueWholeWord === true,
                    caseSensitive: headerPattern.valueCaseSensitive === true
                };

                // Loop through all headers to find matches (supports regex)
                for (const [headerName, headerValue] of Object.entries(headers)) {
                    if (headerPattern.name && this.matchPattern(headerName, headerPattern.name, nameMatchOptions)) {
                        // If value pattern specified, check it too
                        if (headerPattern.value) {
                            if (this.matchPattern(headerValue, headerPattern.value, valueMatchOptions)) {
                                matches.push({
                                    type: 'headers',
                                    name: headerPattern.name,
                                    value: `${headerName}: ${headerValue}`,
                                    confidence: headerPattern.confidence || 80,
                                    description: headerPattern.description
                                });
                                break; // Found a match, no need to check more headers
                            }
                        } else {
                            // Just check for header name match
                            matches.push({
                                type: 'headers',
                                name: headerPattern.name,
                                value: `${headerName}: ${headerValue}`,
                                confidence: headerPattern.confidence || 80,
                                description: headerPattern.description
                            });
                            break; // Found a match, no need to check more headers
                        }
                    }
                }
            }
        }

        // Check DOM patterns
        if (detector.detection?.dom && dom.length > 0) {
            console.log(`[DOM Detection] ${detector.name}: Checking ${detector.detection.dom.length} DOM patterns against ${dom.length} elements`);
            for (const domPattern of detector.detection.dom) {
                // Check if any DOM element matches the pattern
                const matchingElement = dom.find(element => {
                    // The DOM data from content script contains various properties
                    // We need to match the selector pattern against the element data

                    // Handle different selector types
                    const selectorPattern = domPattern.selector;

                    // Class selector (e.g., .g-recaptcha)
                    if (selectorPattern.startsWith('.')) {
                        const className = selectorPattern.substring(1);
                        const elementClass = element.class || element.attributes?.class || '';
                        return elementClass.includes(className);
                    }

                    // ID selector (e.g., #cf-wrapper)
                    if (selectorPattern.startsWith('#')) {
                        const idPattern = selectorPattern.substring(1);
                        const elementId = element.id || element.attributes?.id || '';
                        return elementId === idPattern;
                    }

                    // Attribute selector (e.g., [data-sitekey])
                    if (selectorPattern.startsWith('[') && selectorPattern.endsWith(']')) {
                        const attrMatch = selectorPattern.match(/\[([^=\]]+)(?:=['"]*.([^'"\]]+)['"]*.)?(?:\*=["']?([^'"\]]+)["']?)?\]/);
                        if (attrMatch) {
                            const [, attrName, exactValue, containsValue] = attrMatch;

                            // Check if element has the attribute
                            if (element.attributes && element.attributes[attrName]) {
                                if (exactValue) {
                                    return element.attributes[attrName] === exactValue;
                                } else if (containsValue) {
                                    return element.attributes[attrName].includes(containsValue);
                                } else {
                                    return true; // Just checking for attribute existence
                                }
                            }

                            // Also check top-level properties
                            if (element[attrName]) {
                                if (exactValue) {
                                    return element[attrName] === exactValue;
                                } else if (containsValue) {
                                    return element[attrName].includes(containsValue);
                                } else {
                                    return true;
                                }
                            }
                        }
                    }

                    // Complex selector with src/href contains (e.g., iframe[src*='recaptcha'])
                    if (selectorPattern.includes('[') && selectorPattern.includes('*=')) {
                        const match = selectorPattern.match(/^(\w+)\[(\w+)\*=['"]*([^'"\]]+)['"]*\]/);
                        if (match) {
                            const [, tagName, attrName, containsValue] = match;

                            // Check if tag matches (if specified)
                            if (tagName && element.selector !== tagName && element.tagName !== tagName) {
                                return false;
                            }

                            // Check attribute contains value
                            const attrValue = element[attrName] || element.attributes?.[attrName] || '';
                            return attrValue.includes(containsValue);
                        }
                    }

                    // Simple tag selector (e.g., canvas)
                    if (selectorPattern.match(/^[a-z]+$/)) {
                        return element.selector === selectorPattern || element.tagName === selectorPattern;
                    }

                    // Direct selector match (for elements that store their original selector)
                    if (element.selector === selectorPattern) {
                        return true;
                    }

                    return false;
                });

                if (matchingElement) {
                    const elementText = matchingElement.text || matchingElement.textContent || matchingElement.innerText || '';
                    const truncatedText = elementText.length > 50 ? elementText.substring(0, 50) + '...' : elementText;
                    matches.push({
                        type: 'dom',
                        selector: domPattern.selector,
                        value: `${domPattern.selector}=${truncatedText}`,
                        confidence: domPattern.confidence || 85,
                        description: domPattern.description
                    });
                }
            }
        }

        // Calculate confidence if ConfidenceManager is available, otherwise use max confidence
        const overallConfidence = this.confidenceManager
            ? this.confidenceManager.calculateConfidence(matches)
            : Math.max(...matches.map(m => m.confidence || 0), 0);

        return {
            detected: overallConfidence > 0,
            confidence: overallConfidence,
            matches,
            detector: {
                id: detector.id,
                name: detector.name,
                category: detector.category,
                color: detector.color,
                icon: detector.icon,
                description: detector.description
            }
        };
    }

    /**
     * Helper function to match pattern with options (regex, wholeWord, caseSensitive)
     * @param {string} text - Text to search in
     * @param {string} pattern - Pattern to search for
     * @param {object} options - Matching options
     * @returns {boolean} - Whether pattern matches
     */
    matchPattern(text, pattern, options = {}) {
        const {
            regex = false,
            wholeWord = false,
            caseSensitive = false
        } = options;

        if (!text || !pattern) return false;

        // Apply case sensitivity
        const textToSearch = caseSensitive ? text : text.toLowerCase();
        const patternToMatch = caseSensitive ? pattern : pattern.toLowerCase();

        // Regex matching
        if (regex) {
            try {
                const flags = caseSensitive ? 'g' : 'gi';
                const regexPattern = new RegExp(patternToMatch, flags);
                return regexPattern.test(textToSearch);
            } catch (e) {
                console.warn('Invalid regex pattern:', patternToMatch, e);
                return false;
            }
        }

        // Whole word matching
        if (wholeWord) {
            const wordBoundaryRegex = new RegExp(`\\b${this.escapeRegExp(patternToMatch)}\\b`, caseSensitive ? 'g' : 'gi');
            return wordBoundaryRegex.test(textToSearch);
        }

        // Simple includes matching
        return textToSearch.includes(patternToMatch);
    }

    /**
     * Escape special regex characters for literal matching
     * @param {string} string - String to escape
     * @returns {string} - Escaped string
     */
    escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Get stored detection for a URL
     * @param {string} url - Page URL
     * @returns {Promise<object|null>} Stored detection data or null
     */
    static async getStoredDetection(url) {
        try {
            const result = await chrome.storage.local.get([DetectionEngineManager.STORAGE_KEY]);
            const storage = result[DetectionEngineManager.STORAGE_KEY] || {};
            const urlHash = Utils.hashUrl(url);
            const stored = storage[urlHash];

            if (stored) {
                // Check if stored detection is expired
                if (Date.now() < stored.expiry) {
                    console.log(`Scrapfly Background: Found stored detection for ${url} (expires in ${Math.round((stored.expiry - Date.now()) / 1000 / 60)} minutes)`);
                    return stored;
                } else {
                    console.log(`Scrapfly Background: Stored detection expired for ${url}`);
                    // Remove expired entry
                    delete storage[urlHash];
                    await chrome.storage.local.set({ [DetectionEngineManager.STORAGE_KEY]: storage });
                }
            }
        } catch (error) {
            console.error('Scrapfly Background: Error reading stored detections:', error);
        }
        return null;
    }

    /**
     * Get detection data for a specific tab
     * @param {number} tabId - Tab ID
     * @returns {Promise<object|null>} Detection data or null
     */
    static async getDetectionData(tabId) {
        // First, get the tab's URL to check storage
        try {
            const tab = await chrome.tabs.get(tabId);
            if (!tab || !tab.url) {
                return null;
            }

            // Check storage
            const storedData = await DetectionEngineManager.getStoredDetection(tab.url);
            if (storedData) {
                console.log('getDetectionData: Using stored detection from chrome.storage');
                return {
                    data: storedData,
                    detectionResults: storedData.detectionResults || [],
                    timestamp: storedData.timestamp,
                    expiry: storedData.expiry,
                    storageExpiry: storedData.expiry,
                    fromStorage: true,
                    processed: true,
                    url: storedData.url
                };
            }
        } catch (error) {
            console.error('getDetectionData: Error:', error);
        }

        return null;
    }

    /**
     * Store detection results for a URL
     * @param {string} url - Page URL
     * @param {object} pageData - Page data
     * @param {array} detectionResults - Detection results
     */
    static async storeDetection(url, pageData, detectionResults) {
        console.log('💾 storeDetection called');
        console.log('💾 URL:', url);
        console.log('💾 detectionResults count:', detectionResults.length);
        console.log('💾 detectionResults:', detectionResults);

        try {
            const result = await chrome.storage.local.get([DetectionEngineManager.STORAGE_KEY]);
            const storage = result[DetectionEngineManager.STORAGE_KEY] || {};
            const urlHash = Utils.hashUrl(url);

            // Extract detection methods from results
            const detectionMethods = {
                content: [],
                dom: [],
                headers: [],
                cookies: [],
                urls: []
            };

            console.log('💾 Processing detectionResults to extract methods...');
            detectionResults.forEach((detection, index) => {
                console.log(`💾 Detection ${index}:`, detection.detector?.name, 'matches:', detection.matches?.length);

                if (detection.matches) {
                    detection.matches.forEach((match, matchIndex) => {
                        console.log(`  💾 Match ${matchIndex}:`, match.type, match.pattern || match.name);

                        if (detectionMethods[match.type]) {
                            detectionMethods[match.type].push({
                                pattern: match.pattern || match.name || match.selector,
                                confidence: match.confidence,
                                detector: detection.detector.name
                            });
                        }
                    });
                }
            });

            console.log('💾 Final detectionMethods:', detectionMethods);

            // Calculate overall confidence
            const overallConfidence = detectionResults.length > 0
                ? Math.round(detectionResults.reduce((sum, d) => sum + d.confidence, 0) / detectionResults.length)
                : 0;

            storage[urlHash] = {
                url: url,
                hostname: pageData.hostname,
                favicon: pageData.favicon || '',
                detectionResults: detectionResults,
                detectionMethods: detectionMethods,
                timestamp: Date.now(),
                expiry: Date.now() + DetectionEngineManager.EXPIRY_MS,
                confidence: overallConfidence,
                detectionCount: detectionResults.length,
                fromStorage: false
            };

            await chrome.storage.local.set({ [DetectionEngineManager.STORAGE_KEY]: storage });
            console.log(`Scrapfly Background: Stored detection for ${url} (${detectionResults.length} detections)`);
        } catch (error) {
            console.error('Scrapfly Background: Error storing detection:', error);
        }
    }

    /**
     * Clean expired detection cache entries
     * Removes detections that have exceeded their expiry time (12 hours by default)
     * Should be called periodically from background script
     * @returns {Promise<void>}
     */
    static async cleanExpiredDetections() {
        try {
            const result = await chrome.storage.local.get([DetectionEngineManager.STORAGE_KEY]);
            const storage = result[DetectionEngineManager.STORAGE_KEY] || {};
            const now = Date.now();
            let cleanedCount = 0;

            for (const urlHash in storage) {
                const detection = storage[urlHash];
                // Check if this specific detection has expired based on its own expiry time
                if (detection.expiry && detection.expiry < now) {
                    console.log(`[DetectionEngineManager] Removing expired detection for ${detection.url} (expired ${Math.floor((now - detection.expiry) / 60000)} minutes ago)`);
                    delete storage[urlHash];
                    cleanedCount++;
                }
            }

            if (cleanedCount > 0) {
                await chrome.storage.local.set({ [DetectionEngineManager.STORAGE_KEY]: storage });
                console.log(`[DetectionEngineManager] Cleaned ${cleanedCount} expired detection entries`);
            }
        } catch (error) {
            console.error('[DetectionEngineManager] Error cleaning expired detections:', error);
        }
    }
}

// Export for use in content script and service worker
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DetectionEngineManager;
} else if (typeof window !== 'undefined') {
    window.DetectionEngineManager = DetectionEngineManager;
}