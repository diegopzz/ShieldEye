/**
 * Content script for Scrapfly Security Detection Extension
 * Collects page data and sends it for analysis
 */

// Global variables - use var to allow redeclaration during extension reloads
var detectionEngine = detectionEngine || null;
var hasCleanedUp = hasCleanedUp || false;
var contextCheckInterval = contextCheckInterval || null;

/**
 * Check if extension context is still valid
 * More robust check with error handling
 */
function isExtensionContextValid() {
    try {
        // Check if chrome.runtime exists and has an id
        if (chrome && chrome.runtime && chrome.runtime.id) {
            // Additional check - try to get the extension URL to verify it's really valid
            const url = chrome.runtime.getURL('');
            if (url && url.startsWith('chrome-extension://')) {
                return true;
            }
        }
        return false;
    } catch (error) {
        // If we get an error accessing chrome.runtime, context is invalid
        // But only log if it's not a common transient error
        if (!error.message.includes('Cannot read properties of undefined')) {
            console.warn('Scrapfly Content Script: Error checking extension context:', error.message);
        }
        return false;
    }
}

/**
 * Clean up when extension context is invalidated
 */
function cleanupOrphanedScript() {
    if (hasCleanedUp) return;
    hasCleanedUp = true;

    console.warn('Scrapfly Content Script: Cleaning up orphaned content script');

    // Clear the context check interval immediately
    if (contextCheckInterval) {
        clearInterval(contextCheckInterval);
        contextCheckInterval = null;
    }

    // Remove all event listeners to prevent memory leaks
    document.removeEventListener('DOMContentLoaded', notifyPageLoad);
    document.removeEventListener('visibilitychange', notifyPageLoad);
    window.removeEventListener('focus', notifyPageLoad);

    // Clear detection engine data
    if (detectionEngine) {
        detectionEngine.clearDetectionData();
    }

    console.log('Scrapfly Content Script: Cleanup complete - script is now inactive');
}

/**
 * Notify background about page load (cache check first)
 */
async function notifyPageLoad() {
    console.log('Scrapfly Content Script: Notifying page load...');

    // Check if extension context is still valid
    if (!isExtensionContextValid()) {
        console.warn('Scrapfly Content Script: Extension context invalidated');
        cleanupOrphanedScript();
        return;
    }

    // Check if extension is enabled
    try {
        const result = await chrome.storage.local.get(['scrapfly_enabled']);
        if (result.scrapfly_enabled === false) {
            console.log('Scrapfly Content Script: Extension is disabled, skipping notification');
            return;
        }
    } catch (error) {
        if (error.message && error.message.includes('Extension context invalidated')) {
            console.warn('Scrapfly Content Script: Extension was reloaded, content script is orphaned');
            cleanupOrphanedScript();
            return;
        }
        console.error('Scrapfly Content Script: Error checking enabled state:', error);
    }

    // Check if we should notify (avoid too frequent notifications)
    if (!detectionEngine.shouldRunDetection(2000)) {
        console.log('Scrapfly Content Script: Skipping notification (too soon after last detection)');
        return;
    }

    // Send page load notification with just URL (cache check in background)
    try {
        chrome.runtime.sendMessage({
            type: 'PAGE_LOAD_NOTIFICATION',
            url: window.location.href,
            timestamp: Date.now()
        }, (response) => {
            if (chrome.runtime.lastError) {
                if (chrome.runtime.lastError.message &&
                    chrome.runtime.lastError.message.includes('Extension context invalidated')) {
                    console.warn('Scrapfly Content Script: Extension was reloaded');
                    cleanupOrphanedScript();
                }
            } else {
                console.log('Scrapfly Content Script: Page load notification sent');
            }
        });
    } catch (error) {
        if (error.message && error.message.includes('Extension context invalidated')) {
            cleanupOrphanedScript();
        }
    }
}

/**
 * Collect page data and send to background (called when cache miss)
 */
async function collectAndSendData() {
    console.log('Scrapfly Content Script: Collecting and sending page data...');

    // Check if extension context is still valid
    if (!isExtensionContextValid()) {
        console.warn('Scrapfly Content Script: Extension context invalidated');
        cleanupOrphanedScript();
        return;
    }

    try {
        // Collect page data (async - fetches external resources)
        const pageData = await detectionEngine.collectPageData();

        console.log('📤 Content Script: Sending pageData:', {
            hasPageHTML: !!pageData.pageHTML,
            pageHTMLLength: pageData.pageHTML?.length || 0,
            contentCount: pageData.content?.length || 0,
            externalContentCount: pageData.externalContent?.length || 0,
            cookiesCount: pageData.cookies?.length || 0,
            domCount: pageData.dom?.length || 0
        });

        // Check again before sending
        if (!isExtensionContextValid()) {
            console.warn('Scrapfly Content Script: Extension context lost before sending data');
            cleanupOrphanedScript();
            return;
        }

        // Send data to background script
        try {
            chrome.runtime.sendMessage({
                type: 'DETECTION_DATA',
                data: pageData,
                tabId: null, // Will be filled by background script
                timestamp: Date.now()
            }, (response) => {
                // Check for errors
                if (chrome.runtime.lastError) {
                    // Check if it's a context invalidation
                    if (chrome.runtime.lastError.message &&
                        chrome.runtime.lastError.message.includes('Extension context invalidated')) {
                        console.warn('Scrapfly Content Script: Extension was reloaded during detection');
                        cleanupOrphanedScript();
                    } else {
                        console.error('Scrapfly Content Script: Error sending detection data:', chrome.runtime.lastError);
                    }
                } else {
                    console.log('Scrapfly Content Script: Detection data sent successfully', response);
                }
            });
        } catch (sendError) {
            // Catch synchronous errors when trying to send message
            if (sendError.message && sendError.message.includes('Extension context invalidated')) {
                console.warn('Scrapfly Content Script: Extension context invalidated, cannot send data');
                cleanupOrphanedScript();
            } else {
                console.error('Scrapfly Content Script: Failed to send message:', sendError);
            }
        }
    } catch (error) {
        // Check if it's a context invalidation error
        if (error.message && error.message.includes('Extension context invalidated')) {
            console.warn('Scrapfly Content Script: Extension context invalidated during detection');
            cleanupOrphanedScript();
        } else {
            console.error('Scrapfly Content Script: Error during detection:', error);
        }
    }
}

/**
 * Setup detection triggers
 */
function setupDetectionTriggers() {
    console.log('Scrapfly Content Script: Setting up detection triggers...');

    // Notify page load (background checks cache first)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', notifyPageLoad);
    } else {
        // DOM is already loaded, notify immediately
        setTimeout(notifyPageLoad, 100);
    }

    // Notify when tab becomes visible
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && !hasCleanedUp) {
            console.log('Scrapfly Content Script: Tab became visible, notifying...');
            notifyPageLoad();
        }
    });

    // Notify on focus (tab switch)
    window.addEventListener('focus', () => {
        if (!hasCleanedUp) {
            console.log('Scrapfly Content Script: Window focused, notifying...');
            notifyPageLoad();
        }
    });

    // Monitor for client-side navigation (SPA)
    let lastUrl = location.href;
    const observer = new MutationObserver(() => {
        if (hasCleanedUp) return;

        const currentUrl = location.href;
        if (currentUrl !== lastUrl) {
            lastUrl = currentUrl;
            console.log('Scrapfly Content Script: URL changed, notifying...');
            setTimeout(notifyPageLoad, 500); // Wait for new content to load
        }
    });

    // Start observing URL changes
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // Listen for messages from background script
    if (isExtensionContextValid()) {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            // Check if context is still valid
            if (!isExtensionContextValid()) {
                console.warn('Scrapfly Content Script: Extension context invalidated, cannot respond to message');
                return false;
            }

            console.log('Scrapfly Content Script: Received message:', request);

            if (request.type === 'REQUEST_PAGE_DATA') {
                // Background requests data collection (cache miss)
                collectAndSendData();
                sendResponse({ status: 'collecting_data' });
            } else if (request.type === 'RUN_DETECTION') {
                // Manual detection request from popup (force bypass cache)
                collectAndSendData();
                sendResponse({ status: 'detection_started' });
            } else if (request.type === 'GET_DETECTION_STATUS') {
                // Return current detection status
                sendResponse({
                    status: 'active',
                    lastDetection: detectionEngine ? detectionEngine.lastDetectionTime : null,
                    hasData: detectionEngine ? detectionEngine.detectionData !== null : false
                });
            } else if (request.type === 'UPDATE_CAPTURE_STEP') {
                const notif = document.getElementById('scrapfly-capture-notification');
                if (notif) {
                    notif.innerHTML = `
                        <style>
                            @keyframes slideIn {
                                from { transform: translateX(400px); opacity: 0; }
                                to { transform: translateX(0); opacity: 1; }
                            }
                        </style>
                        <div style="font-weight: 600; font-size: 16px; margin-bottom: 8px;">
                            🎬 reCAPTCHA Capture - Step ${request.step}
                        </div>
                        <div style="opacity: 0.9;">
                            ${request.message}
                        </div>
                        <div id="scrapfly-timer" style="margin-top: 12px; font-size: 12px; opacity: 0.8; font-weight: 600;">
                            ⏱️ Capturing...
                        </div>
                    `;
                }
                sendResponse({ status: 'updated' });
            }

            // Return true to indicate async response
            return true;
        });
    }

    console.log('Scrapfly Content Script: Detection triggers setup complete');
}

/**
 * Perform context validation
 */
let contextCheckFailures = 0;
function performContextCheck() {
    if (hasCleanedUp) {
        // Already cleaned up, clear interval
        if (contextCheckInterval) {
            clearInterval(contextCheckInterval);
            contextCheckInterval = null;
        }
        return;
    }

    if (!isExtensionContextValid()) {
        contextCheckFailures++;

        // Only cleanup after 2 consecutive failures (grace period for transient issues)
        if (contextCheckFailures >= 2) {
            console.warn('Scrapfly Content Script: Extension context lost after multiple checks');
            cleanupOrphanedScript();

            // Clear the interval
            if (contextCheckInterval) {
                clearInterval(contextCheckInterval);
                contextCheckInterval = null;
            }
        } else {
            console.log('Scrapfly Content Script: Context check failed, will retry...');
        }
    } else {
        // Reset failure counter on successful check
        contextCheckFailures = 0;
    }
}

/**
 * Initialize content script
 */
function initialize() {
    console.log('Scrapfly Content Script: Initializing on', window.location.href);

    // Don't run on extension pages or chrome:// URLs
    if (window.location.protocol === 'chrome-extension:' ||
        window.location.protocol === 'chrome:' ||
        window.location.protocol === 'edge:' ||
        window.location.protocol === 'about:') {
        console.log('Scrapfly Content Script: Skipping initialization on browser page');
        return;
    }

    // Initialize the detection engine
    if (!detectionEngine) {
        detectionEngine = new DetectionEngineManager();
    }

    // Check for context validity periodically (less frequently to reduce overhead)
    contextCheckInterval = setInterval(performContextCheck, 60000); // Check every 60 seconds

    // Setup all detection triggers
    setupDetectionTriggers();

    // Notify background that content script is ready (only if context is valid)
    if (isExtensionContextValid()) {
        try {
            chrome.runtime.sendMessage({
                type: 'CONTENT_SCRIPT_READY',
                url: window.location.href
            }, (response) => {
                if (chrome.runtime.lastError) {
                    if (chrome.runtime.lastError.message &&
                        chrome.runtime.lastError.message.includes('Extension context invalidated')) {
                        console.warn('Scrapfly Content Script: Extension was reloaded before initialization completed');
                        // Don't cleanup immediately, might be temporary
                    } else {
                        console.error('Scrapfly Content Script: Failed to notify background:', chrome.runtime.lastError);
                    }
                } else {
                    console.log('Scrapfly Content Script: Successfully notified background of readiness');
                }
            });
        } catch (error) {
            if (error.message && error.message.includes('Extension context invalidated')) {
                console.warn('Scrapfly Content Script: Extension context invalidated during initialization');
                // Don't cleanup immediately, might be temporary
            } else {
                console.error('Scrapfly Content Script: Error notifying background:', error);
            }
        }
    } else {
        console.warn('Scrapfly Content Script: Extension context not available at initialization');
    }
}

// Check if script is already initialized to prevent duplicates
// Only the initialization call is wrapped, not the function definitions
if (window.__scrapflyContentScriptInitialized) {
    console.log('Scrapfly Content Script: Already initialized, skipping duplicate');
} else {
    window.__scrapflyContentScriptInitialized = true;
    console.log('Scrapfly Content Script: Starting initialization...');
    initialize();
}