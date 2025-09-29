/**
 * Background script for Scrapfly Security Detection Extension
 * Handles message passing, header capture, and data storage
 */

// Import scripts for service worker
importScripts(
    './Utils/utils.js',
    './Modules/CategoryManager.js',
    './Modules/DetectorManager.js',
    './Modules/ConfidenceManager.js',
    './Modules/DetectionEngineManager.js',
    './Modules/NotificationManager.js',
    './Sections/History/History.js',
    './Sections/Advanced/Modules/ReCaptcha/Libs/pbf.js',
    './Sections/Advanced/Modules/ReCaptcha/Libs/message.browser.js',
    './Sections/Advanced/Modules/ReCaptcha/ReCaptchaInterceptor.js',
    './Sections/Advanced/Modules/Akamai/AkamaiInterceptor.js',
    './Sections/Advanced/Modules/Akamai/AkamaiAdvanced.js'
);

console.log('Scrapfly Background Script: Initializing...');

// Storage for headers per tab
const headersStore = new Map();
const captureState = new Map();
const akamaiCaptureState = new Map();

// Initialize Akamai interceptor with the capture state Map
// Delay initialization slightly to ensure scripts are loaded
setTimeout(() => {
    if (typeof akamaiInitializeInterceptor === 'function') {
        akamaiInitializeInterceptor(akamaiCaptureState);
        console.log('[AKAMAI-CAPTURE] Interceptor initialized with capture state Map');
    } else {
        console.error('[Akamai] akamaiInitializeInterceptor function not found');
    }
}, 100);

// Initialize managers on extension startup
let detectorManager = null;
let categoryManager = null;
let detectionEngine = null;

// Track recent detection requests to prevent duplicates
const recentDetectionRequests = new Map(); // tabId -> timestamp

/**
 * Unified initialization method
 * Called on extension install, update, and browser startup
 * @param {string} reason - Reason for initialization ('install', 'update', 'startup')
 * @param {string} previousVersion - Previous version if update
 */
async function initialize(reason = 'startup', previousVersion = null) {
    try {
        console.log('===========================================');
        console.log(`Scrapfly Extension: ${reason.toUpperCase()}`);
        console.log('===========================================');

        // Show reason-specific messages
        if (reason === 'install') {
            console.log('Welcome to Scrapfly Security Detection Extension!');
        } else if (reason === 'update') {
            console.log('Extension updated successfully!');
            if (previousVersion) console.log('Previous version:', previousVersion);
            console.log('⚠️  Note: Existing tabs may need to be refreshed for detection to work');
            console.log('⚠️  This is normal during development when the extension is reloaded');
        }

        console.log('Background: Initializing detector system...');

        // Create CategoryManager and DetectorManager instances
        categoryManager = new CategoryManager();
        detectorManager = new DetectorManager(categoryManager);

        // Initialize the detector manager (loads from storage or JSON files)
        await detectorManager.initialize();

        console.log('Background: Detector system initialized successfully');
        console.log(`Background: Loaded ${detectorManager.getDetectorCount()} detectors`);

        // Clear any leftover badges
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
            chrome.action.setBadgeText({ text: '', tabId: tab.id }).catch(() => {});
        }

        console.log('✅ Detector system ready');
        console.log('===========================================');

        return true;
    } catch (error) {
        console.error('Background: Failed to initialize detector system:', error);
        console.error('Background: Error stack:', error.stack);
        console.log('===========================================');
        return false;
    }
}

// Listen for extension installation or update
chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install' || details.reason === 'update') {
        await initialize(details.reason, details.previousVersion);
    }
});

// Initialize on browser startup (when browser starts with extension already installed)
chrome.runtime.onStartup.addListener(async () => {
    await initialize('startup');
});

/**
 * Ensure DetectorManager is initialized (lazy initialization)
 * Service workers can be terminated and restarted, losing in-memory state
 */
async function ensureDetectorManagerInitialized() {
    if (!detectorManager || !detectorManager.initialized) {
        console.log('Background: DetectorManager not initialized, initializing now...');
        if (!categoryManager) {
            categoryManager = new CategoryManager();
        }
        if (!detectorManager) {
            detectorManager = new DetectorManager(categoryManager);
        }
        if (!detectorManager.initialized) {
            await detectorManager.initialize();
        }
        console.log('Background: DetectorManager initialized successfully');
    }
    return detectorManager;
}





/**
 * Capture HTTP headers for all requests
 */
function setupHeaderCapture() {
    console.log('Scrapfly Background: Setting up header capture...');

    // Listen for response headers
    chrome.webRequest.onHeadersReceived.addListener(
        (details) => {
            // Only capture headers for main frame requests
            if (details.type === 'main_frame' && details.responseHeaders) {
                const headers = {};

                // Convert headers array to object for easier access
                details.responseHeaders.forEach(header => {
                    headers[header.name.toLowerCase()] = header.value;
                });

                // Store headers for this tab
                headersStore.set(details.tabId, {
                    url: details.url,
                    headers: headers,
                    timestamp: Date.now()
                });

                console.log(`Scrapfly Background: Captured ${Object.keys(headers).length} headers for tab ${details.tabId}`);
            }
        },
        { urls: ["<all_urls>"] },
        ["responseHeaders"]
    );
}

/**
 * Process detection data from content script
 * @param {object} message - Message from content script
 * @param {object} sender - Sender information
 */
async function processDetectionData(message, sender) {
    if (!sender.tab || !sender.tab.id) {
        console.error('Scrapfly Background: No tab information in sender');
        return;
    }

    const tabId = sender.tab.id;
    const pageData = message.data;
    const pageUrl = pageData.url;

    console.log(`Scrapfly Background: Processing detection data from tab ${tabId} (cache miss)`);

    // Add headers if available
    if (headersStore.has(tabId)) {
        const headerData = headersStore.get(tabId);

        // Only use headers if they're from the same URL (or close enough)
        if (headerData.url.includes(pageData.hostname)) {
            pageData.headers = headerData.headers;
            console.log(`Scrapfly Background: Added ${Object.keys(headerData.headers).length} headers to detection data`);

            headersStore.delete(tabId);
            console.log(`Scrapfly Background: Cleaned up headers for tab ${tabId} after use`);
        }
    }

    // Add tab information
    pageData.tabId = tabId;
    pageData.tabUrl = sender.tab.url;
    pageData.tabTitle = sender.tab.title;
    pageData.favicon = sender.tab.favIconUrl;

    // Run detection analysis immediately
    console.log('🚀 Background: Starting detection analysis...');

    let detectionResults = [];
    try {
        // Ensure DetectorManager is initialized (handles service worker restarts)
        await ensureDetectorManagerInitialized();

        console.log('✅ Running detection on page data...');
        // Create detection engine if not exists
        if (!detectionEngine) {
            detectionEngine = new DetectionEngineManager();
        }
        // Set detectors from detector manager
        detectionEngine.setDetectors(detectorManager.getAllDetectors());
        // Run detection
        detectionResults = detectionEngine.detectOnPage(pageData);
        console.log(`🎯 Scrapfly Background: Detected ${detectionResults.length} security systems on tab ${tabId}`);

        // Store detection results immediately
        await DetectionEngineManager.storeDetection(pageUrl, pageData, detectionResults);

        // Update badge with detection count
        if (detectionResults.length > 0) {
            const count = detectionResults.length.toString();
            const color = detectionResults.length >= 5 ? '#FF4444' :
                         detectionResults.length >= 3 ? '#FFA500' :
                         '#4CAF50';

            chrome.action.setBadgeText({
                text: count,
                tabId: tabId
            });
            chrome.action.setBadgeBackgroundColor({
                color: color,
                tabId: tabId
            });
        } else {
            // Clear badge if no detections
            chrome.action.setBadgeText({
                text: '',
                tabId: tabId
            });
        }

        // Save detection results to history
        if (detectionResults.length > 0) {
            await History.saveDetectionToHistory(tabId, pageData, detectionResults, chrome);
        }
    } catch (error) {
        console.error('Scrapfly Background: Error running detection:', error);
    }

    console.log(`Scrapfly Background: Processed detection data for tab ${tabId}`, {
        url: pageData.url,
        cookies: pageData.cookies.length,
        content: pageData.content?.length || 0,
        externalContent: pageData.externalContent?.length || 0,
        dom: pageData.dom.length,
        headers: Object.keys(pageData.headers || {}).length,
        detections: detectionResults.length
    });

    // Notify popup if it's open
    chrome.runtime.sendMessage({
        type: 'NEW_DETECTION_DATA',
        tabId: tabId,
        url: pageData.url,
        detectionResults: detectionResults
    }).catch(() => {
        // Popup might not be open, ignore error
    });
}



// getDetectionData has been moved to DetectionEngineManager.js as a static method
// Use DetectionEngineManager.getDetectionData(tabId) instead

/**
 * Get detection data for the current active tab
 * @returns {Promise<object|null>} Detection data or null
 */
async function getCurrentTabDetectionData() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
            return await DetectionEngineManager.getDetectionData(tab.id);
        }
    } catch (error) {
        console.error('Scrapfly Background: Error getting current tab:', error);
    }
    return null;
}


/**
 * Setup message listeners
 */
function setupMessageListeners() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        // Reduced logging - comment out for less spam
        // console.log('Scrapfly Background: Received message:', request.type);

        switch (request.type) {
            case 'PING':
                // Simple ping for connection test
                sendResponse({ status: 'pong', timestamp: Date.now() });
                break;

            case 'PAGE_LOAD_NOTIFICATION':
                // Page load notification - check cache first (optimization)
                (async () => {
                    const pageUrl = request.url;
                    const tabId = sender.tab?.id;

                    if (!tabId) {
                        console.error('Scrapfly Background: No tab ID in PAGE_LOAD_NOTIFICATION');
                        return;
                    }

                    // Reduced logging - only log important events
                    // console.log(`Scrapfly Background: Page load notification from tab ${tabId}: ${pageUrl}`);

                    // Skip if we recently ran detection for this tab
                    if (Utils.shouldSkipDetection(tabId, 1500, recentDetectionRequests)) { // Shorter threshold for page load notifications
                        console.log(`Scrapfly Background: Skipping duplicate page load notification for tab ${tabId}`);
                        return;
                    }

                    // Check cache first (optimization - avoid expensive data collection)
                    const storedData = await DetectionEngineManager.getStoredDetection(pageUrl);
                    if (storedData) {
                        console.log(`Scrapfly Background: ✅ Cache hit for ${pageUrl}`);

                        // Update badge with cached detection count
                        if (storedData.detectionCount > 0) {
                            const count = storedData.detectionCount.toString();
                            const color = storedData.detectionCount >= 5 ? '#FF4444' :
                                         storedData.detectionCount >= 3 ? '#FFA500' :
                                         '#4CAF50';

                            chrome.action.setBadgeText({ text: count, tabId: tabId });
                            chrome.action.setBadgeBackgroundColor({ color: color, tabId: tabId });
                        } else {
                            chrome.action.setBadgeText({ text: '', tabId: tabId });
                        }

                        // Notify popup if it's open
                        chrome.runtime.sendMessage({
                            type: 'NEW_DETECTION_DATA',
                            tabId: tabId,
                            url: pageUrl,
                            detectionResults: storedData.detectionResults,
                            fromStorage: true
                        }).catch(() => {});

                        // Cache hit - no need to collect data
                        return;
                    }

                    // Cache miss - request data collection from content script
                    console.log(`Scrapfly Background: ⚠️ Cache miss for ${pageUrl} - requesting data collection`);
                    chrome.tabs.sendMessage(tabId, { type: 'REQUEST_PAGE_DATA' }, (response) => {
                        if (chrome.runtime.lastError) {
                            console.log('Scrapfly Background: Content script not ready for data collection');
                        } else {
                            console.log('Scrapfly Background: Data collection requested');
                        }
                    });
                })();
                break;

            case 'DETECTION_DATA':
                // Process detection data from content script
                processDetectionData(request, sender);
                sendResponse({ status: 'received', tabId: sender.tab?.id });
                break;

            case 'CONTENT_SCRIPT_READY':
                // Content script is ready
                console.log(`Scrapfly Background: Content script ready on ${request.url}`);
                sendResponse({ status: 'acknowledged' });
                break;

            case 'GET_DETECTION_DATA':
                // Request for detection data from popup
                (async () => {
                    try {
                        let data;
                        if (request.tabId) {
                            data = await DetectionEngineManager.getDetectionData(request.tabId);
                            // Reduced logging - comment out for less spam
                            // console.log(`Scrapfly Background: Sending detection data for tab ${request.tabId}:`, data ? 'Data available' : 'No data');
                        } else {
                            data = await getCurrentTabDetectionData();
                            // Reduced logging - comment out for less spam
                            // console.log('Scrapfly Background: Sending detection data for current tab:', data ? 'Data available' : 'No data');
                        }
                        sendResponse({ data: data });
                    } catch (error) {
                        console.error('Scrapfly Background: Error in GET_DETECTION_DATA:', error);
                        sendResponse({ data: null, error: error.message });
                    }
                })();
                return true; // Will respond asynchronously
                break;

            case 'RELOAD_DETECTORS':
                // Reload detectors from storage (after adding/updating/deleting)
                (async () => {
                    try {
                        console.log('Scrapfly Background: Reloading detectors from storage...');
                        detectorManager.initialized = false;
                        await detectorManager.initialize();
                        console.log('Scrapfly Background: Detectors reloaded successfully');
                        sendResponse({ status: 'reloaded', detectorCount: detectorManager.getDetectorCount() });
                    } catch (error) {
                        console.error('Scrapfly Background: Error reloading detectors:', error);
                        sendResponse({ status: 'error', error: error.message });
                    }
                })();
                return true; // Will respond asynchronously
                break;

            case 'REQUEST_DETECTION':
                // Request to run detection on a specific tab
                const tabId = request.tabId;
                if (tabId) {
                    // Always try to inject scripts first to ensure they're loaded
                    // This handles both initial load and extension reload scenarios
                    (async () => {
                        try {
                            // Get the specific tab info
                            const tab = await chrome.tabs.get(tabId);

                            // Check if it's a valid URL for content scripts
                            if (!tab || !tab.url ||
                                tab.url.startsWith('chrome://') ||
                                tab.url.startsWith('chrome-extension://') ||
                                tab.url.startsWith('edge://') ||
                                tab.url.startsWith('about:') ||
                                tab.url.startsWith('chrome-devtools://')) {
                                sendResponse({ status: 'error', error: 'Invalid URL for detection' });
                                return;
                            }

                            // Skip if we recently ran detection for this tab
                            if (Utils.shouldSkipDetection(tabId, 2000, recentDetectionRequests)) {
                                sendResponse({ status: 'skipped', reason: 'Recent detection exists' });
                                return;
                            }

                            // Try to ping the content script first
                            let scriptExists = false;
                            try {
                                await new Promise((resolve) => {
                                    chrome.tabs.sendMessage(tabId, { type: 'GET_DETECTION_STATUS' }, (response) => {
                                        if (!chrome.runtime.lastError && response && response.status === 'active') {
                                            scriptExists = true;
                                        }
                                        resolve();
                                    });
                                });
                            } catch (e) {
                                // Ignore ping errors
                            }

                            // If script doesn't exist or doesn't respond, inject it
                            if (!scriptExists) {
                                console.log('Scrapfly Background: Content script not found, injecting...');

                                try {
                                    // Check if scripts are already injected to avoid duplicates
                                    const [result] = await chrome.scripting.executeScript({
                                        target: { tabId: tabId },
                                        func: () => typeof window.DetectionEngineManager !== 'undefined'
                                    });

                                    if (!result.result) {
                                        // Inject DetectionEngineManager first
                                        await chrome.scripting.executeScript({
                                            target: { tabId: tabId },
                                            files: ['Modules/DetectionEngineManager.js']
                                        });
                                        console.log('Scrapfly Background: Injected DetectionEngineManager');
                                    }

                                    // Always inject content script (it has its own duplicate prevention)
                                    await chrome.scripting.executeScript({
                                        target: { tabId: tabId },
                                        files: ['content.js']
                                    });
                                    console.log('Scrapfly Background: Injected content script');

                                    // Wait for scripts to initialize
                                    await new Promise(resolve => setTimeout(resolve, 500));
                                } catch (injectionError) {
                                    console.error('Scrapfly Background: Failed to inject scripts:', injectionError);
                                    sendResponse({ status: 'error', error: `Script injection failed: ${injectionError.message}` });
                                    return;
                                }
                            }

                            // Now send the detection request
                            chrome.tabs.sendMessage(tabId, { type: 'RUN_DETECTION' }, (response) => {
                                if (chrome.runtime.lastError) {
                                    console.error('Scrapfly Background: Failed to trigger detection:', chrome.runtime.lastError);
                                    sendResponse({ status: 'error', error: chrome.runtime.lastError.message });
                                } else {
                                    // Reduced logging - comment out for less spam
                                    // console.log('Scrapfly Background: Detection triggered successfully');
                                    sendResponse({ status: 'requested', response: response });
                                }
                            });
                        } catch (error) {
                            console.error('Scrapfly Background: Error in REQUEST_DETECTION:', error);
                            sendResponse({ status: 'error', error: error.message });
                        }
                    })();
                    return true; // Will respond asynchronously
                } else {
                    sendResponse({ status: 'error', error: 'No tab ID provided' });
                }
                break;

            case 'CLEAR_DETECTION_DATA':
                // Clear detection data for a tab
                if (request.tabId) {
                    detectionDataStore.delete(request.tabId);
                    headersStore.delete(request.tabId);
                } else {
                    // Clear all
                    detectionDataStore.clear();
                    headersStore.clear();
                }
                sendResponse({ status: 'cleared' });
                break;

            case 'CLEAR_DETECTION_CACHE':
                // Clear cached detection for specific URL
                (async () => {
                    try {
                        const result = await chrome.storage.local.get([DetectionEngineManager.STORAGE_KEY]);
                        const storage = result[DetectionEngineManager.STORAGE_KEY] || {};
                        const urlHash = Utils.hashUrl(request.url);

                        if (storage[urlHash]) {
                            delete storage[urlHash];
                            await chrome.storage.local.set({ [DetectionEngineManager.STORAGE_KEY]: storage });
                            console.log(`Cleared cache for ${request.url}`);
                            sendResponse({ status: 'cleared' });
                        } else {
                            sendResponse({ status: 'not_found' });
                        }
                    } catch (error) {
                        console.error('Error clearing cache:', error);
                        sendResponse({ status: 'error', error: error.message });
                    }
                })();
                return true; // Async response

            case 'RECAPTCHA_START_CAPTURE':
                (async () => {
                    try {
                        reCaptchaInitializeInterceptor(captureState);
                        const result = await reCaptchaStartCapture(request.tabId);
                        sendResponse(result);
                    } catch (error) {
                        console.error('[reCAPTCHA] Error in RECAPTCHA_START_CAPTURE:', error);
                        sendResponse({ status: 'error', error: error.message });
                    }
                })();
                return true; // Async response
                break;

            case 'RECAPTCHA_STOP_CAPTURE':
                (async () => {
                    const tabIdStop = request.tabId;
                    const stateStop = captureState.get(tabIdStop);
                    if (stateStop) {
                        if (stateStop.captureInterval) {
                            clearInterval(stateStop.captureInterval);
                        }
                        if (stateStop.captureTimeout) {
                            console.log('[reCAPTCHA] Clearing 60s timeout (manual stop)');
                            clearTimeout(stateStop.captureTimeout);
                        }

                        // Process captured data
                        const capturedResults = await processCaptureData(stateStop);
                        console.log('Manual stop - Captured results:', capturedResults);

                    stateStop.results = capturedResults;
                    stateStop.isCapturing = false;
                    captureState.set(tabIdStop, stateStop);

                    stopRecaptchaInterception();

                    // Save to advanced history
                    if (capturedResults.length > 0) {
                        History.saveCaptureToHistory(tabIdStop, capturedResults, chrome).catch(err => {
                            console.error('Failed to save capture to history:', err);
                        });
                    }

                    // Clear advanced selection after manual stop
                    chrome.storage.local.remove('scrapfly_advanced_selected');
                    console.log('[reCAPTCHA] Cleared advanced selection after manual stop');

                    // Notify popup to clear UI
                    chrome.runtime.sendMessage({ type: 'CAPTURE_COMPLETED' }).catch(() => {
                        // Popup might not be open, ignore error
                    });

                    // Show success notification
                    chrome.scripting.executeScript({
                        target: { tabId: tabIdStop },
                        func: (resultsCount) => {
                            // Aggressive cleanup
                            const allNotifs = document.querySelectorAll('[id^="scrapfly-capture-notification"]');
                            allNotifs.forEach(n => {
                                n.style.animation = 'none';
                                n.remove();
                            });
                            const oldStyles = document.querySelectorAll('style[data-scrapfly-notification]');
                            oldStyles.forEach(s => s.remove());
                            if (window.scrapflyTimerInterval) {
                                clearInterval(window.scrapflyTimerInterval);
                                window.scrapflyTimerInterval = null;
                            }

                            requestAnimationFrame(() => {
                                setTimeout(() => {
                                    const notif = document.createElement('div');
                                    notif.id = `scrapfly-capture-notification-${Date.now()}`;
                                    notif.style.cssText = `
                                        position: fixed !important;
                                        top: 20px !important;
                                        right: 20px !important;
                                        background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%) !important;
                                        color: white !important;
                                        padding: 20px 24px !important;
                                        border-radius: 12px !important;
                                        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3) !important;
                                        z-index: 2147483647 !important;
                                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
                                        font-size: 14px !important;
                                        min-width: 320px !important;
                                    `;

                                    const styleTag = document.createElement('style');
                                    styleTag.setAttribute('data-scrapfly-notification', 'true');
                                    styleTag.textContent = `
                                        @keyframes slideIn { from { transform: translateX(400px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
                                        @keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(400px); opacity: 0; } }
                                    `;
                                    document.head.appendChild(styleTag);

                                    const hasResults = resultsCount > 0;
                                    notif.innerHTML = `
                                        <div style="font-weight: 600; font-size: 16px; margin-bottom: 8px;">
                                            ✅ Capture ${hasResults ? 'Successful' : 'Completed'}
                                        </div>
                                        <div style="opacity: 0.9;">
                                            ${hasResults ? `${resultsCount} request${resultsCount !== 1 ? 's' : ''} captured and decoded` : 'No reCAPTCHA requests captured'}
                                        </div>
                                    `;
                                    notif.style.animation = 'slideIn 0.3s ease-out';
                                    document.body.appendChild(notif);

                                    setTimeout(() => {
                                        notif.style.animation = 'slideOut 0.3s ease-in';
                                        setTimeout(() => notif.remove(), 300);
                                    }, 5000);
                                }, 100);
                            });
                        },
                        args: [capturedResults.length]
                    }).catch(err => {
                        console.error('[reCAPTCHA] ❌ Failed to show stop notification:', err);
                        console.error('[reCAPTCHA] Error details:', err.message, err.stack);

                        // Fallback to system notification when in-page injection fails
                        chrome.notifications.create({
                            type: 'basic',
                            iconUrl: chrome.runtime.getURL('icons/icon128.png'),
                            title: 'Capture ' + (capturedResults.length > 0 ? 'Successful' : 'Completed'),
                            message: capturedResults.length > 0
                                ? `${capturedResults.length} reCAPTCHA request${capturedResults.length !== 1 ? 's' : ''} captured and decoded`
                                : 'No reCAPTCHA requests were captured',
                            priority: 2
                        });
                    });

                        // Delete capture state completely to prevent stale data
                        captureState.delete(tabIdStop);

                        sendResponse({ status: 'stopped', results: capturedResults, resultsCount: capturedResults.length });
                    } else {
                        sendResponse({ status: 'not_capturing' });
                    }
                })();
                return true; // Async response
                break;

            case 'RECAPTCHA_GET_CAPTURE_STATE':
                const tabIdGet = request.tabId;
                const stateGet = captureState.get(tabIdGet);
                sendResponse({
                    isCapturing: stateGet?.isCapturing || false,
                    step: stateGet?.step || 0
                });
                break;

            case 'RECAPTCHA_GET_CAPTURE_RESULTS':
                const tabIdResults = request.tabId;
                const stateResults = captureState.get(tabIdResults);
                if (stateResults && stateResults.results) {
                    sendResponse({
                        success: true,
                        results: stateResults.results,
                        timestamp: stateResults.startTime
                    });
                } else {
                    sendResponse({
                        success: false,
                        results: [],
                        message: 'No capture results available'
                    });
                }
                break;

            case 'AKAMAI_START_CAPTURE':
                (async () => {
                    try {
                        // Interceptor is already initialized at startup, but check just in case
                        if (!akamaiCaptureState) {
                            throw new Error('Akamai capture state not initialized');
                        }

                        // Get current tab URL
                        const tab = await chrome.tabs.get(request.tabId);
                        if (!tab || !tab.url) {
                            throw new Error('Unable to get tab URL');
                        }

                        const result = akamaiStartCapture(request.tabId, tab.url);
                        sendResponse(result);
                    } catch (error) {
                        console.error('[Akamai] Error starting capture:', error);
                        sendResponse({ status: 'error', error: error.message });
                    }
                })();
                return true; // Async response
                break;

            case 'AKAMAI_STOP_CAPTURE':
                (async () => {
                    try {
                        const result = akamaiStopCapture(request.tabId);
                        await AkamaiAdvanced.handleStopCapture(request.tabId, result);
                        sendResponse(result);
                    } catch (error) {
                        console.error('[Akamai] Error stopping capture:', error);
                        sendResponse({ status: 'error', error: error.message });
                    }
                })();
                return true; // Async response
                break;

            case 'AKAMAI_GET_CAPTURE_STATE':
                try {
                    // Ensure interceptor is initialized
                    if (typeof akamaiInitializeInterceptor === 'function' && akamaiCaptureState) {
                        akamaiInitializeInterceptor(akamaiCaptureState);
                    }

                    const state = akamaiGetCaptureState(request.tabId);
                    sendResponse(state);
                } catch (error) {
                    console.error('[Akamai] Error getting capture state:', error);
                    sendResponse({ status: 'error', error: error.message });
                }
                break;

            case 'AKAMAI_CAPTURE_COMPLETED':
                (async () => {
                    console.log('[AKAMAI-CAPTURE] ========== CAPTURE_COMPLETED START ==========');
                    console.log('[AKAMAI-CAPTURE] Message received from:', request);
                    try {
                        const { tabId, data: interceptorData } = request;
                        await AkamaiAdvanced.handleCaptureCompleted(tabId, interceptorData);

                        // Stop capture
                        console.log('[AKAMAI-CAPTURE] Stopping capture for tab:', tabId);
                        if (typeof akamaiStopCapture === 'function') {
                            akamaiStopCapture(tabId);
                            console.log('[AKAMAI-CAPTURE] ✓ Capture stopped successfully');
                        }

                        console.log('[AKAMAI-CAPTURE] ========== CAPTURE_COMPLETED END (SUCCESS) ===========');
                    } catch (error) {
                        console.error('[AKAMAI-CAPTURE] ❌ Error in capture completion handler:', error);
                        console.error('[AKAMAI-CAPTURE] Error stack:', error.stack);
                        console.log('[AKAMAI-CAPTURE] ========== CAPTURE_COMPLETED END (ERROR) ==========');
                    }
                })();
                break;

            case 'AKAMAI_EXTRACT_SENSOR':
                (async () => {
                    console.log('[AKAMAI-EXTRACT] ========== EXTRACT SENSOR START ==========');
                    try {
                        await AkamaiAdvanced.handleExtractSensor(request.tabId);
                        sendResponse({
                            status: 'success',
                            message: 'Extraction mode enabled. Page will reload.'
                        });
                    } catch (error) {
                        console.error('[AKAMAI-EXTRACT] ❌ Error:', error);
                        sendResponse({ status: 'error', error: error.message });
                    }
                })();
                return true; // Async response
                break;

            case 'AKAMAI_EXTRACTION_COMPLETED':
                (async () => {
                    console.log('[AKAMAI-EXTRACT] ========== EXTRACTION COMPLETED ==========');
                    try {
                        const { tabId, extractedData } = request;
                        await AkamaiAdvanced.handleExtractionCompleted(tabId, extractedData);
                        sendResponse({ status: 'success' });
                    } catch (error) {
                        console.error('[AKAMAI-EXTRACT] ❌ Error:', error);
                        sendResponse({ status: 'error', error: error.message });
                    }
                })();
                return true; // Async response
                break;

            default:
                console.log('Scrapfly Background: Unknown message type:', request.type);
                sendResponse({ status: 'unknown' });
        }

        return false; // Synchronous response unless specified otherwise
    });
}

/**
 * Setup tab event listeners
 */
function setupTabListeners() {
    // Clear data when tab is closed
    chrome.tabs.onRemoved.addListener((tabId) => {
        console.log(`Scrapfly Background: Tab ${tabId} closed, clearing headers`);
        headersStore.delete(tabId);

        // Clear capture state if tab is closed during capture
        const captureStateForTab = captureState.get(tabId);
        if (captureStateForTab) {
            console.log(`Scrapfly Background: Tab ${tabId} closed during capture, cleaning up`);
            if (captureStateForTab.captureInterval) {
                clearInterval(captureStateForTab.captureInterval);
            }
            captureState.delete(tabId);
            stopRecaptchaInterception();
        }

        // Clear the badge for this tab
        chrome.action.setBadgeText({
            text: '',
            tabId: tabId
        }).catch(() => {
            // Tab might already be closed, ignore error
        });
    });

    // Run detection when tab is updated
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        // Handle reCAPTCHA capture updates - only monitors active captures
        if (typeof reCaptchaHandleCaptureTabUpdate === 'function') {
            reCaptchaHandleCaptureTabUpdate(tabId, changeInfo, tab, chrome);
        }

        // Handle Akamai capture updates - only monitors active captures
        if (typeof akamaiHandleCaptureTabUpdate === 'function') {
            akamaiHandleCaptureTabUpdate(tabId, changeInfo, tab);
        }

        // REMOVED: Automatic RUN_DETECTION on tab complete
        // This was causing cache to be bypassed on every page load
        // The PAGE_LOAD_NOTIFICATION from content script already handles this properly with cache checking
        //
        // if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
        //     // Reduced logging - comment out for less spam
        //     // console.log(`Scrapfly Background: Tab ${tabId} updated, requesting detection`);
        //
        //     // Small delay to ensure content script is ready
        //     setTimeout(() => {
        //         chrome.tabs.sendMessage(tabId, { type: 'RUN_DETECTION' }, (response) => {
        //             if (chrome.runtime.lastError) {
        //                 // Content script might not be loaded yet
        //                 console.log('Scrapfly Background: Content script not ready on tab', tabId);
        //             }
        //         });
        //     }, 500);
        // }
    });

    // Run detection when active tab changes
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
        // Reduced logging - comment out for less spam
        // console.log(`Scrapfly Background: Tab ${activeInfo.tabId} activated`);

        // Check if we already have stored detection data for this tab's URL
        const detectionData = await DetectionEngineManager.getDetectionData(activeInfo.tabId);
        if (!detectionData) {
            // The content script will handle detection via PAGE_LOAD_NOTIFICATION when tab gains focus
            // We don't need to force RUN_DETECTION here as it bypasses cache checks
            // The focus event listener in content.js will trigger notifyPageLoad() which properly checks cache
            console.log('Scrapfly Background: No cached data for activated tab, waiting for content script notification');
        }
    });
}

/**
 * Initialize background script
 */
function initialize() {
    console.log('Scrapfly Background: Initializing services...');

    // Setup all listeners and services
    setupHeaderCapture();
    setupMessageListeners();
    setupTabListeners();

    // Run cleanup every 5 minutes to check for expired detections (each detection has 12-hour expiry)
    setInterval(() => DetectionEngineManager.cleanExpiredDetections(), 5 * 60 * 1000);

    console.log('Scrapfly Background: Initialization complete');
}

// Initialize when the script loads
initialize();