// Akamai Network Request Interceptor
// Captures sensor_data from POST requests to Akamai endpoints

let akamaiInterceptionListener = null;
let akamaiCaptureStateRef = null;

/**
 * Initialize Akamai interceptor with capture state reference
 * @param {Map} captureState - Map to store capture state per tab
 */
function akamaiInitializeInterceptor(captureState) {
    if (akamaiCaptureStateRef) {
        console.log('[AKAMAI-CAPTURE] Interceptor already initialized, skipping');
        return;
    }
    akamaiCaptureStateRef = captureState;
    console.log('[AKAMAI-CAPTURE] Interceptor initialized with captureState');
}

/**
 * Start capturing Akamai sensor data for a specific tab
 * @param {number} tabId - Tab ID to capture for
 * @param {string} captureUrl - Current URL of the tab
 * @returns {object} Status object
 */
function akamaiStartCapture(tabId, captureUrl) {
    console.log('[AKAMAI-CAPTURE] ========== START CAPTURE ==========');
    console.log('[AKAMAI-CAPTURE] 🎯 Tab ID:', tabId);
    console.log('[AKAMAI-CAPTURE] 📍 Capture URL:', captureUrl);
    console.log('[AKAMAI-CAPTURE] ⏱️ Started at:', new Date().toISOString());
    console.log('[AKAMAI-CAPTURE] ⏰ Auto-stop in: 60 seconds');
    console.log('[AKAMAI-CAPTURE] 🎧 Listening for: POST requests to Akamai endpoints');
    console.log('[AKAMAI-CAPTURE] ⚠️ Waiting for page reload before capturing');
    console.log('[AKAMAI-CAPTURE] ========================================');

    if (!akamaiInterceptionListener) {
        setupAkamaiInterceptor();
    }

    akamaiCaptureStateRef.set(tabId, {
        tabId: tabId,
        sensorData: null,
        endpoint: null,
        timestamp: Date.now(),
        timeout: null,
        waitingForReload: true,  // Flag to indicate we're waiting for a reload
        captureUrl: captureUrl,  // Store the URL to detect navigation
        startTime: Date.now(),  // Track when capture started
        // URL monitoring for SBSD and SEC_CPT
        urlsMonitored: [],
        sbsdUrls: [],
        secCptUrls: [],
        requiresSbsd: false,
        requiresSecCpt: false
    });

    // Auto-stop after 60 seconds
    const state = akamaiCaptureStateRef.get(tabId);
    state.timeout = setTimeout(() => {
        console.log(`[Akamai Debug] ⏰ Auto-stopping capture for tab ${tabId} (60s timeout reached)`);
        akamaiStopCapture(tabId);
    }, 60000);

    return { status: 'started' };
}

/**
 * Stop capturing for a specific tab
 * @param {number} tabId - Tab ID to stop capture for
 * @returns {object} Status and results
 */
function akamaiStopCapture(tabId) {
    console.log('[AKAMAI-CAPTURE] ========== STOP CAPTURE ==========');
    console.log('[AKAMAI-CAPTURE] 🎯 Tab ID:', tabId);

    const state = akamaiCaptureStateRef.get(tabId);
    if (state) {
        console.log('[AKAMAI-CAPTURE] 📊 Capture Results:');
        console.log('[AKAMAI-CAPTURE]   sensor_data captured:', !!state.sensorData);
        console.log('[AKAMAI-CAPTURE]   endpoint:', state.endpoint || 'NONE');
        console.log('[AKAMAI-CAPTURE]   duration:', ((Date.now() - state.timestamp) / 1000).toFixed(2) + 's');

        if (state.timeout) {
            clearTimeout(state.timeout);
        }
        akamaiCaptureStateRef.delete(tabId);
    } else {
        console.log('[AKAMAI-CAPTURE] ⚠️ No capture state found for tab');
    }

    // If no more active captures, remove listener
    if (akamaiCaptureStateRef.size === 0 && akamaiInterceptionListener) {
        chrome.webRequest.onBeforeRequest.removeListener(akamaiInterceptionListener);
        akamaiInterceptionListener = null;
        console.log('[AKAMAI-CAPTURE] 🔌 Removed request interceptor (no active captures)');
    }

    console.log('[AKAMAI-CAPTURE] ========================================');

    return { status: 'stopped', results: state };
}

/**
 * Get capture state for a tab
 * @param {number} tabId - Tab ID
 * @returns {object} Capture state
 */
function akamaiGetCaptureState(tabId) {
    // Check if interceptor is initialized
    if (!akamaiCaptureStateRef) {
        console.log('[AKAMAI-CAPTURE] CaptureStateRef is null, returning default state');
        return {
            isCapturing: false,
            state: null
        };
    }

    // Check if it's a valid Map
    if (typeof akamaiCaptureStateRef.get !== 'function') {
        console.error('[Akamai] CaptureStateRef is not a Map:', typeof akamaiCaptureStateRef);
        return {
            isCapturing: false,
            state: null
        };
    }

    const state = akamaiCaptureStateRef.get(tabId);
    return {
        isCapturing: !!state,
        state: state || null
    };
}


/**
 * Handle tab updates during active Akamai capture
 * Monitors URL changes and page reload completion
 * @param {number} tabId - Tab ID
 * @param {object} changeInfo - Change information from chrome.tabs.onUpdated
 * @param {object} tab - Tab information
 */
function akamaiHandleCaptureTabUpdate(tabId, changeInfo, tab) {
    // Check if captureStateRef is initialized first
    if (!akamaiCaptureStateRef) return;

    const state = akamaiCaptureStateRef.get(tabId);
    if (!state) return;

    // If URL changed (user navigated away), clear capture state
    if (changeInfo.url && state.captureUrl && changeInfo.url !== state.captureUrl) {
        console.log('[AKAMAI-CAPTURE] URL changed, clearing capture state for tab:', tabId);
        if (state.timeout) {
            clearTimeout(state.timeout);
        }
        akamaiCaptureStateRef.delete(tabId);

        // If no more active captures, remove listener
        if (akamaiCaptureStateRef.size === 0 && akamaiInterceptionListener) {
            chrome.webRequest.onBeforeRequest.removeListener(akamaiInterceptionListener);
            akamaiInterceptionListener = null;
            console.log('[AKAMAI-CAPTURE] Removed request interceptor (no active captures');
        }
        return;
    }

    // When page finishes loading after reload, mark as ready to capture
    if (changeInfo.status === 'complete' && state.waitingForReload) {
        console.log('[AKAMAI-CAPTURE] Page reload detected! Ready to capture sensor_data');
        state.waitingForReload = false;
        state.reloadDetectedAt = Date.now();
        akamaiCaptureStateRef.set(tabId, state);
    }
}

/**
 * Handle Akamai capture completion
 * This function is called directly instead of sending a message
 * because the interceptor runs in the background script context
 */
async function handleAkamaiCaptureCompleted(tabId, interceptorData) {
    console.log('[AKAMAI-CAPTURE] ========== HANDLING CAPTURE COMPLETION ==========');

    try {
        // The actual processing will be done by the code below that we'll extract from background.js
        // For now, we'll directly execute the same logic that was in the AKAMAI_CAPTURE_COMPLETED handler

        // Get tab info
        console.log('[AKAMAI-CAPTURE] Step 1: Getting tab info...');
        const tab = await chrome.tabs.get(tabId);
        if (!tab || !tab.url) {
            console.error('[AKAMAI-CAPTURE] ❌ Tab not found or no URL');
            return;
        }
        console.log('[AKAMAI-CAPTURE] ✓ Tab info retrieved:', { url: tab.url, title: tab.title });

        // Get cookies
        console.log('[AKAMAI-CAPTURE] Step 2: Getting cookies for URL:', tab.url);
        const cookies = await chrome.cookies.getAll({ url: tab.url });
        console.log('[AKAMAI-CAPTURE] Total cookies found:', cookies.length);

        const abckCookie = cookies.find(c => c.name === '_abck');
        const sbsdCookie = cookies.find(c => c.name === 'sbsd');
        const sbsdOCookie = cookies.find(c => c.name === 'sbsd_o');

        console.log('[AKAMAI-CAPTURE] Cookie status:', {
            hasAbck: !!abckCookie,
            abckLength: abckCookie?.value?.length || 0,
            hasSbsd: !!sbsdCookie,
            hasSbsdO: !!sbsdOCookie
        });

        // Create capture data with URL monitoring results
        console.log('[AKAMAI-CAPTURE] Step 3: Creating capture data object...');
        const captureData = {
            type: 'akamai',
            // ABCK info - just true/false and level, NO cookie values
            abckCookie: !!abckCookie,
            abckCookieLevel: abckCookie ? (abckCookie.value.includes('~0~') ? 'easy' : 'standard') : null,
            // Akamai version if detected
            akamaiVersion: interceptorData.akamaiVersion || null,
            // Challenge requirements from URL monitoring
            requiresSbsd: interceptorData.requiresSbsd || !!(sbsdCookie || sbsdOCookie),
            requiresSecCpt: interceptorData.requiresSecCpt || false,
            // Basic site info
            siteUrl: tab.url,
            // Store timestamp for "captured X ago" display
            timestamp: Date.now()
            // NO sensor_data, NO cookie values, NO URLs stored
        };
        console.log('[AKAMAI-CAPTURE] ✓ Capture data created successfully');
        console.log('[AKAMAI-CAPTURE] URL Monitoring Results:', {
            requiresSbsd: captureData.requiresSbsd,
            requiresSecCpt: captureData.requiresSecCpt
        });

        // Save to history
        const hostname = new URL(tab.url).hostname;
        console.log('[AKAMAI-CAPTURE] Step 4: Loading existing history from storage...');
        const result = await chrome.storage.local.get(['scrapfly_advanced_history']);
        console.log('[AKAMAI-CAPTURE] Storage result:', {
            hasHistory: !!result.scrapfly_advanced_history,
            historyType: typeof result.scrapfly_advanced_history
        });

        let history = result.scrapfly_advanced_history || { items: [], lastUpdated: Date.now() };

        if (typeof history === 'string') {
            console.log('[AKAMAI-CAPTURE] History is a string, parsing JSON...');
            history = JSON.parse(history);
        }
        if (!history.items) {
            console.log('[AKAMAI-CAPTURE] History missing items array, initializing...');
            history = { items: [], lastUpdated: Date.now() };
        }
        console.log('[AKAMAI-CAPTURE] Current history has', history.items?.length || 0, 'items');

        const newCapture = {
            id: 'akamai_' + Date.now(),
            type: 'akamai',
            captureData: captureData,
            timestamp: Date.now(),
            hostname: hostname,
            url: tab.url,
            title: tab.title || hostname,
            expiresAt: Date.now() + (30 * 60 * 1000)
        };
        console.log('[AKAMAI-CAPTURE] Created new capture with ID:', newCapture.id);

        // Remove expired items
        const originalCount = history.items.length;
        history.items = history.items.filter(item => {
            if (item.expiresAt && item.expiresAt < Date.now()) {
                console.log('[AKAMAI-CAPTURE] Removing expired capture:', item.hostname);
                return false;
            }
            return true;
        });
        const expiredCount = originalCount - history.items.length;
        if (expiredCount > 0) {
            console.log('[AKAMAI-CAPTURE] Removed', expiredCount, 'expired items');
        }

        // Add new capture
        console.log('[AKAMAI-CAPTURE] Step 5: Adding new capture to history...');
        history.items.unshift(newCapture);
        history.lastUpdated = Date.now();
        console.log('[AKAMAI-CAPTURE] Added new capture, total items now:', history.items.length);

        // Save as JSON string to match reCAPTCHA format
        console.log('[AKAMAI-CAPTURE] Step 6: Saving history to storage as JSON string...');
        await chrome.storage.local.set({
            scrapfly_advanced_history: JSON.stringify(history, null, 2)
        });
        console.log('[AKAMAI-CAPTURE] ✅ Successfully saved capture to history');

        // Clean up capture state
        console.log('[AKAMAI-CAPTURE] Step 7: Cleaning up capture state for tab:', tabId);
        if (akamaiCaptureStateRef && akamaiCaptureStateRef.has(tabId)) {
            const state = akamaiCaptureStateRef.get(tabId);
            if (state && state.timeout) {
                clearTimeout(state.timeout);
            }
            akamaiCaptureStateRef.delete(tabId);
            console.log('[AKAMAI-CAPTURE] ✓ Capture state cleared');
        }

        // If no more active captures, remove listener
        if (akamaiCaptureStateRef && akamaiCaptureStateRef.size === 0 && akamaiInterceptionListener) {
            chrome.webRequest.onBeforeRequest.removeListener(akamaiInterceptionListener);
            akamaiInterceptionListener = null;
            console.log('[AKAMAI-CAPTURE] All captures stopped - listener removed');
        }

        // Clear advanced selection
        console.log('[AKAMAI-CAPTURE] Step 8: Clearing advanced selection...');
        chrome.storage.local.remove('scrapfly_advanced_selected');
        console.log('[AKAMAI-CAPTURE] ✓ Advanced selection cleared');

        // Notify popup to update UI with captured data (if open)
        console.log('[AKAMAI-CAPTURE] Step 9: Notifying popup (if open)...');
        chrome.runtime.sendMessage({
            type: 'AKAMAI_CAPTURE_COMPLETED',
            captureData: newCapture
        }).catch((err) => {
            console.log('[AKAMAI-CAPTURE] ℹ️ Popup not open, message not sent (this is normal)');
        });

        // Show success notification
        console.log('[AKAMAI-CAPTURE] Step 10: Showing success notification in page...');
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => {
                // Aggressive cleanup of old notifications
                const allNotifs = document.querySelectorAll('[id^="scrapfly-capture-notification"], #akamai-capture-notification');
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
                if (window.akamaiCaptureCountdown) {
                    clearInterval(window.akamaiCaptureCountdown);
                    window.akamaiCaptureCountdown = null;
                }

                requestAnimationFrame(() => {
                    setTimeout(() => {
                        const notif = document.createElement('div');
                        notif.id = `scrapfly-capture-notification-${Date.now()}`;
                        notif.style.cssText = `
                            position: fixed !important;
                            top: 20px !important;
                            right: 20px !important;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
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

                        notif.innerHTML = `
                            <div style="font-weight: 600; font-size: 16px; margin-bottom: 8px;">
                                ✅ Akamai Capture Successful
                            </div>
                            <div style="opacity: 0.9;">
                                sensor_data captured and decoded
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
            }
        }).then(() => {
            console.log('[AKAMAI-CAPTURE] ✓ Success notification shown successfully');
        }).catch(err => {
            console.error('[AKAMAI-CAPTURE] ❌ Failed to show success notification:', err);
            console.log('[AKAMAI-CAPTURE] Trying fallback system notification...');
            // Fallback to system notification
            chrome.notifications.create({
                type: 'basic',
                iconUrl: chrome.runtime.getURL('icons/icon128.png'),
                title: 'Akamai Capture Successful',
                message: 'sensor_data captured and decoded',
                priority: 2
            });
        });

        console.log('[AKAMAI-CAPTURE] ========== CAPTURE COMPLETED SUCCESSFULLY ==========');
    } catch (error) {
        console.error('[AKAMAI-CAPTURE] ❌ Error handling capture completion:', error);
        console.error('[AKAMAI-CAPTURE] Error stack:', error.stack);

        // Clean up on error
        if (akamaiCaptureStateRef && akamaiCaptureStateRef.has(tabId)) {
            akamaiCaptureStateRef.delete(tabId);
        }
    }
}

/**
 * Setup network request interceptor for Akamai endpoints
 */
function setupAkamaiInterceptor() {
    console.log('[AKAMAI-CAPTURE] Setting up request interceptor');

    akamaiInterceptionListener = (details) => {
        // Check if this tab is being captured
        const state = akamaiCaptureStateRef.get(details.tabId);
        if (!state) return;

        // Log all requests in extraction mode for debugging
        if (state.extractMode) {
            console.log('[AKAMAI-INTERCEPT-EXTRACT] 📡 Request in extraction mode:', {
                tabId: details.tabId,
                method: details.method,
                type: details.type,
                url: details.url.substring(0, 100),
                hasBody: !!details.requestBody
            });
        }

        // If we're waiting for reload in normal mode, don't monitor yet
        if (!state.extractMode && state.waitingForReload) {
            console.log('[AKAMAI-INTERCEPT] ⏳ Ignoring request - waiting for page reload');
            return;
        }

        const url = details.url.toLowerCase();
        const originalUrl = details.url; // Keep original for storage

        // In extraction mode, process immediately without URL monitoring
        if (state.extractMode) {
            console.log('[AKAMAI-INTERCEPT-EXTRACT] Processing in extraction mode...');

            // Initialize extraction data if not exists
            if (!state.extractedData) {
                state.extractedData = {
                    sensorData: null,
                    sbsdData: null,
                    secData: null,
                    sensorScriptUrl: null,
                    sbsdScriptUrl: null,
                    endpoints: new Set() // Use Set to avoid duplicates
                };
            }

            // Track unique endpoints
            state.extractedData.endpoints.add(originalUrl);

            // Check for SBSD endpoint
            if (url.includes('.well-known/sbsd')) {
                console.log('[AKAMAI-INTERCEPT-EXTRACT] SBSD endpoint detected');
                state.extractedData.sbsdScriptUrl = originalUrl;
                // We'll capture the SBSD data below
            }

            // Only process POST requests with body
            if (details.method !== 'POST') {
                console.log('[AKAMAI-INTERCEPT-EXTRACT] Skipping non-POST request');
                return;
            }

            if (!details.requestBody) {
                console.log('[AKAMAI-INTERCEPT-EXTRACT] ⚠️ POST request but no body:', url);
                return;
            }

            // Continue to process the POST request body below
            console.log('[AKAMAI-INTERCEPT-EXTRACT] ✅ Processing POST request with body');

        } else {
            // Normal capture mode - monitor URLs
            state.urlsMonitored.push(originalUrl);

            // Check for SBSD patterns
            if (url.includes('.well-known/sbsd') || url.includes('/sbsd')) {
                console.log('[AKAMAI-CAPTURE] 🔍 SBSD URL detected:', originalUrl);
                state.requiresSbsd = true;
                state.sbsdUrls.push(originalUrl);
                // Don't stop capture - we need to keep monitoring for sensor_data
            }

            // Check for SEC_CPT patterns
            if (url.includes('/sec_cpt/') || url.includes('cp_challenge') || url.includes('/sec-cpt/')) {
                console.log('[AKAMAI-CAPTURE] 🔍 SEC_CPT URL detected:', originalUrl);
                state.requiresSecCpt = true;
                state.secCptUrls.push(originalUrl);
            }

            // Check if we already have sensor data
            if (state.sensorData) return;

            // Only process POST requests with body
            if (details.method !== 'POST' || !details.requestBody) {
                return;
            }
        }

        console.log('[AKAMAI-CAPTURE] 🎯 Intercepted POST request with body:', url);
        console.log('[AKAMAI-CAPTURE] Request details:', {
            method: details.method,
            hasBody: !!details.requestBody,
            bodyType: details.requestBody ? Object.keys(details.requestBody) : null
        });

        try {
            let sensorData = null;
            let rawBody = null;

            console.log('[AKAMAI-CAPTURE] Extracting request body...');
            console.log('[AKAMAI-CAPTURE] RequestBody structure:', details.requestBody);
            console.log('[AKAMAI-CAPTURE] RequestBody keys:', Object.keys(details.requestBody));

            // Check what type of body we have
            if (!details.requestBody) {
                console.log('[AKAMAI-CAPTURE] ❌ No request body found!');
            } else if (details.requestBody.error) {
                console.log('[AKAMAI-CAPTURE] ❌ Error in request body:', details.requestBody.error);
            } else if (details.requestBody.raw) {
                console.log('[AKAMAI-CAPTURE] Has raw data, length:', details.requestBody.raw?.length);
            } else if (details.requestBody.formData) {
                console.log('[AKAMAI-CAPTURE] Has formData');
            }

            // Extract request body
            if (details.requestBody.raw && details.requestBody.raw[0]) {
                // Binary data
                console.log('[AKAMAI-CAPTURE] Processing raw body data...');
                console.log('[AKAMAI-CAPTURE] Raw bytes available:', details.requestBody.raw[0].bytes?.length || 0);
                const decoder = new TextDecoder('utf-8');
                rawBody = decoder.decode(details.requestBody.raw[0].bytes);
                console.log('[AKAMAI-CAPTURE] Decoded raw body length:', rawBody.length);
                console.log('[AKAMAI-CAPTURE] Raw body (first 500 chars):', rawBody.substring(0, 500));
                console.log('[AKAMAI-CAPTURE] Raw body (last 100 chars):', rawBody.substring(rawBody.length - 100));

                // Check if this raw body is sensor_data directly (starts with pattern like "3;0;1;0;")
                if (/^\d+;\d+;\d+;\d+;\d+/.test(rawBody)) {
                    console.log('[AKAMAI-CAPTURE] ✅ Raw body appears to be sensor_data directly!');
                    sensorData = rawBody;
                }
            } else if (details.requestBody.formData) {
                // Form data
                console.log('[AKAMAI-CAPTURE] Processing form data...');
                const formData = details.requestBody.formData;
                console.log('[AKAMAI-CAPTURE] Form data keys:', Object.keys(formData));
                if (formData.sensor_data) {
                    console.log('[AKAMAI-CAPTURE] ✅ Found sensor_data in form data!');
                    sensorData = formData.sensor_data[0];
                }
                rawBody = JSON.stringify(formData);
            } else {
                console.log('[AKAMAI-CAPTURE] ⚠️ Unknown request body format');
            }

            // Try to parse sensor_data from raw body
            if (!sensorData && rawBody) {
                // Try JSON
                try {
                    const json = JSON.parse(rawBody);
                    if (json.sensor_data) {
                        sensorData = json.sensor_data;
                    }
                } catch (e) {
                    // Not JSON, try URL encoded
                    const urlParams = new URLSearchParams(rawBody);
                    if (urlParams.has('sensor_data')) {
                        sensorData = urlParams.get('sensor_data');
                    } else {
                        // Try regex match for sensor_data
                        // Akamai sensor_data typically starts with numbers and semicolons like "3;0;1;0;..."
                        const match = rawBody.match(/sensor_data[=:]\s*"?([0-9];[^"]*)"?/);
                        if (match && match[1]) {
                            sensorData = match[1];
                        } else {
                            // Also check if the body itself looks like sensor_data (starts with digit;digit;)
                            if (/^\d+;\d+;\d+;/.test(rawBody)) {
                                console.log('[AKAMAI-CAPTURE] Body looks like sensor_data format');
                                sensorData = rawBody;
                            }
                        }
                    }
                }
            }

            // Handle extraction mode for any captured data
            if (state.extractMode && (sensorData || rawBody)) {
                console.log('[AKAMAI-EXTRACT] Processing extracted data...');

                // Check if this is SBSD data
                if (url.includes('.well-known/sbsd')) {
                    console.log('[AKAMAI-EXTRACT] 📦 SBSD data captured!');
                    state.extractedData.sbsdData = rawBody;
                }
                // Check if this is sensor_data
                else if (sensorData) {
                    console.log('[AKAMAI-EXTRACT] 📦 Sensor data captured!');
                    state.extractedData.sensorData = sensorData;
                    state.extractedData.sensorScriptUrl = originalUrl;

                    // Extract Akamai version from sensor data (first number before semicolon)
                    const versionMatch = sensorData.match(/^(\d+);/);
                    if (versionMatch) {
                        state.extractedData.akamaiVersion = `Akamai V${versionMatch[1]}`;
                        console.log('[AKAMAI-EXTRACT] Version detected:', state.extractedData.akamaiVersion);
                    }
                }
                // Check for other Akamai endpoints with data
                else if (rawBody && (url.includes('/whet') || url.includes('/akam/'))) {
                    console.log('[AKAMAI-EXTRACT] 📦 Other Akamai data captured from:', originalUrl);
                    // Store as sensor data if we don't have it yet
                    if (!state.extractedData.sensorData && rawBody.includes('sensor_data')) {
                        // Try to extract sensor_data from the body
                        const match = rawBody.match(/"sensor_data":"([^"]+)"/);
                        if (match) {
                            state.extractedData.sensorData = match[1];
                            state.extractedData.sensorScriptUrl = originalUrl;
                            console.log('[AKAMAI-EXTRACT] ✅ Extracted sensor_data from JSON!');

                            // Extract Akamai version
                            const versionMatch = match[1].match(/^(\d+);/);
                            if (versionMatch) {
                                state.extractedData.akamaiVersion = `Akamai V${versionMatch[1]}`;
                                console.log('[AKAMAI-EXTRACT] Version detected:', state.extractedData.akamaiVersion);
                            }
                        }
                    }
                }

                // Update state
                akamaiCaptureStateRef.set(details.tabId, state);

                // Check if we have enough data to complete extraction
                if (state.extractedData.sensorData) {
                    console.log('[AKAMAI-EXTRACT] ✅ Have sensor_data, completing extraction...');

                    // Since we're in background context, handle the extraction directly
                    console.log('[AKAMAI-EXTRACT] Handling extraction completion directly...');

                    // Convert Set to Array for endpoints
                    const extractedDataToSend = {
                        ...state.extractedData,
                        endpoints: Array.from(state.extractedData.endpoints || [])
                    };

                    // Send data to popup via runtime message from background context
                    chrome.runtime.sendMessage({
                        type: 'AKAMAI_EXTRACTION_RESULT',
                        extractedData: extractedDataToSend
                    }).then(() => {
                        console.log('[AKAMAI-EXTRACT] ✓ Extraction data sent to popup successfully');
                    }).catch((err) => {
                        console.log('[AKAMAI-EXTRACT] ℹ️ Popup not open (this is normal):', err.message);
                    });

                    // Clear the capture state
                    akamaiCaptureStateRef.delete(details.tabId);
                    console.log('[AKAMAI-EXTRACT] ========== EXTRACTION COMPLETE ==========');
                }
                return;
            }

            // Normal capture mode handling
            if (sensorData && !state.extractMode) {
                console.log('[AKAMAI-CAPTURE] ========== SENSOR DATA CAPTURED ==========');
                console.log('[AKAMAI-CAPTURE] 🎯 Tab ID:', details.tabId);
                console.log('[AKAMAI-CAPTURE] 📡 Endpoint:', url);
                console.log('[AKAMAI-CAPTURE] 📦 sensor_data:', sensorData.substring(0, 100) + '...');
                console.log('[AKAMAI-CAPTURE] 📏 sensor_data length:', sensorData.length);
                console.log('[AKAMAI-CAPTURE] ⏱️ Timestamp:', new Date().toISOString());
                console.log('[AKAMAI-CAPTURE] ========================================');

                state.sensorData = sensorData;
                state.endpoint = url;
                state.timestamp = Date.now();

                // Extract Akamai version from sensor data (first number before semicolon)
                let akamaiVersion = null;
                const versionMatch = sensorData.match(/^(\d+);/);
                if (versionMatch) {
                    akamaiVersion = `Akamai V${versionMatch[1]}`;
                    console.log('[AKAMAI-CAPTURE] Version detected:', akamaiVersion);
                }
                state.akamaiVersion = akamaiVersion;

                // Auto-stop capture after getting sensor data
                console.log('[AKAMAI-CAPTURE] Auto-stopping capture (data captured)');
                if (state.timeout) {
                    clearTimeout(state.timeout);
                }

                // Normal capture mode - process as usual
                console.log('[AKAMAI-CAPTURE] Processing capture completion directly...');

                // Call the handler directly
                handleAkamaiCaptureCompleted(details.tabId, {
                    sensorData: sensorData,
                    endpoint: url,
                    timestamp: state.timestamp,
                    akamaiVersion: state.akamaiVersion || null,
                    // Include URL monitoring results
                    requiresSbsd: state.requiresSbsd || false,
                    requiresSecCpt: state.requiresSecCpt || false,
                    sbsdUrls: state.sbsdUrls || [],
                    secCptUrls: state.secCptUrls || [],
                    urlsMonitored: state.urlsMonitored || []
                });
            } else if (rawBody) {
                console.log('[AKAMAI-CAPTURE] ⚠️ POST request intercepted but no sensor_data found');
                console.log('[AKAMAI-CAPTURE] Endpoint:', url);
                console.log('[AKAMAI-CAPTURE] Body preview:', rawBody.substring(0, 200));
            }
        } catch (error) {
            console.error('[AKAMAI-CAPTURE] ❌ Error processing request:', error);
            console.error('[AKAMAI-CAPTURE] Error stack:', error.stack);
            console.error('[AKAMAI-CAPTURE] Error details:', {
                message: error.message,
                url: details.url,
                method: details.method,
                hasBody: !!details.requestBody
            });
        }
    };

    // Register listener for POST requests to Akamai endpoints
    chrome.webRequest.onBeforeRequest.addListener(
        akamaiInterceptionListener,
        {
            urls: ["<all_urls>"],
            types: ["xmlhttprequest", "other"]
        },
        ["requestBody"]
    );

    console.log('[AKAMAI-CAPTURE] ✅ Request interceptor ready');
}