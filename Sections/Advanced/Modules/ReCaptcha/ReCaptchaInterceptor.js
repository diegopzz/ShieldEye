let recaptchaInterceptionListener = null;
let reCaptchaCaptureStateRef = null;

function reCaptchaInitializeInterceptor(captureState) {
    if (reCaptchaCaptureStateRef) {
        console.log('[reCAPTCHA] Interceptor already initialized, skipping');
        return;
    }
    reCaptchaCaptureStateRef = captureState;
    console.log('[reCAPTCHA] Interceptor initialized with captureState');
}

/**
 * Start capturing reCAPTCHA requests for a specific tab
 * @param {number} tabId - The tab ID to capture for
 * @returns {Promise<{status: string}>} - Capture start status
 */
async function reCaptchaStartCapture(tabId) {
    try {
        console.log('[reCAPTCHA] RECAPTCHA_START_CAPTURE received for tab:', tabId);

        // Check if actively capturing (not just if state exists)
        const existingState = reCaptchaCaptureStateRef.get(tabId);
        if (existingState && existingState.isCapturing) {
            console.log('[reCAPTCHA] Already actively capturing for this tab');
            return { status: 'already_capturing' };
        }

        // Clean up old state if exists but not capturing
        if (existingState) {
            console.log('[reCAPTCHA] Cleaning up stale state from previous capture');
            reCaptchaCaptureStateRef.delete(tabId);
        }

        // Get tab URL to track navigation changes and check cookies
        let hasV2Cookie = false;
        try {
            const tab = await chrome.tabs.get(tabId);
            const cookies = await chrome.cookies.getAll({ url: tab.url });
            hasV2Cookie = cookies.some(cookie =>
                cookie.name === 'recaptcha-ca-e' || cookie.name === 'recaptcha-ca-t'
            );
            console.log(`[reCAPTCHA] v2 cookie detection: ${hasV2Cookie ? 'FOUND' : 'NOT FOUND'}`);

            reCaptchaCaptureStateRef.set(tabId, {
                step: 1,
                startTime: Date.now(),
                captureInterval: null,
                captureTimeout: null,
                isCapturing: true,
                anchorData: {},
                reloadData: [],
                hasV2Cookie,
                captureUrl: tab.url
            });
        } catch (err) {
            console.error('Failed to get tab info or cookies:', err);
            reCaptchaCaptureStateRef.set(tabId, {
                step: 1,
                startTime: Date.now(),
                captureInterval: null,
                captureTimeout: null,
                isCapturing: true,
                anchorData: {},
                reloadData: [],
                hasV2Cookie: false
            });
        }

        startRecaptchaInterception();

        // Try in-page notification, always show system notification as backup
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: (duration) => {
                try {
                    console.log('[reCAPTCHA] 🚀 Starting notification injection...');

                    // AGGRESSIVE CLEANUP - Remove all notification elements
                    const allNotifs = document.querySelectorAll('[id^="scrapfly-capture-notification"]');
                    console.log('[reCAPTCHA] Found', allNotifs.length, 'existing notifications');
                    allNotifs.forEach(n => {
                        n.style.animation = 'none';
                        n.remove();
                    });

                    // Remove any orphaned style tags
                    const oldStyles = document.querySelectorAll('style[data-scrapfly-notification]');
                    oldStyles.forEach(s => s.remove());

                    // Clear any existing timer
                    if (window.scrapflyTimerInterval) {
                        clearInterval(window.scrapflyTimerInterval);
                        window.scrapflyTimerInterval = null;
                    }

                    // Create notification immediately (no requestAnimationFrame delay)
                    const uniqueId = `scrapfly-capture-notification-${Date.now()}`;
                    const notif = document.createElement('div');
                    notif.id = uniqueId;
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
                        animation: slideIn 0.3s ease-out !important;
                    `;

                    // Create style tag
                    const styleTag = document.createElement('style');
                    styleTag.setAttribute('data-scrapfly-notification', 'true');
                    styleTag.textContent = `
                        @keyframes slideIn {
                            from { transform: translateX(400px); opacity: 0; }
                            to { transform: translateX(0); opacity: 1; }
                        }
                        @keyframes slideOut {
                            from { transform: translateX(0); opacity: 1; }
                            to { transform: translateX(400px); opacity: 0; }
                        }
                    `;
                    document.head.appendChild(styleTag);

                    notif.innerHTML = `
                        <div style="font-weight: 600; font-size: 16px; margin-bottom: 8px;">
                            🎬 reCAPTCHA Capture Started
                        </div>
                        <div style="opacity: 0.9;">
                            📍 Reload the page to capture requests
                        </div>
                        <div id="scrapfly-timer" style="margin-top: 12px; font-size: 12px; opacity: 0.8; font-weight: 600;">
                            ⏱️ 60s remaining
                        </div>
                    `;

                    document.body.appendChild(notif);
                    console.log('[reCAPTCHA] ✅ Notification added with ID:', uniqueId);

                    let timeLeft = Math.floor(duration / 1000);
                    window.scrapflyTimerInterval = setInterval(() => {
                        timeLeft--;
                        const timerEl = document.getElementById('scrapfly-timer');
                        if (timerEl && timeLeft > 0) {
                            timerEl.textContent = `⏱️ ${timeLeft}s remaining`;
                        } else if (timeLeft <= 0) {
                            clearInterval(window.scrapflyTimerInterval);
                        }
                    }, 1000);
                } catch (error) {
                    console.error('[reCAPTCHA] ❌ Error in notification function:', error);
                    throw error; // Re-throw to trigger catch handler
                }
            },
            args: [60000]
        }).catch(err => {
            console.error('[reCAPTCHA] ❌ Failed to inject notification:', err);
        });

        // Always show system notification as primary method (more reliable)
        chrome.notifications.create(`capture-start-${tabId}`, {
            type: 'basic',
            iconUrl: chrome.runtime.getURL('icons/icon128.png'),
            title: '🎬 reCAPTCHA Capture Started',
            message: 'Reload the page to capture requests. Auto-stops in 60s.',
            priority: 2
        }).catch(err => {
            console.error('[reCAPTCHA] ❌ Failed to show system notification:', err);
        });

        const captureTimeout = setTimeout(async () => {
            const state = reCaptchaCaptureStateRef.get(tabId);
            if (state && state.isCapturing) {
                if (state.captureInterval) {
                    clearInterval(state.captureInterval);
                }

                const capturedResults = await processCaptureData(state);
                console.log('Captured results:', capturedResults);

                state.results = capturedResults;
                state.isCapturing = false;

                // Delete state completely to prevent blocking next capture
                reCaptchaCaptureStateRef.delete(tabId);
                console.log('[reCAPTCHA] Deleted capture state after 60s timeout');

                stopRecaptchaInterception();

                // Clear advanced selection after capture completes
                chrome.storage.local.remove('scrapfly_advanced_selected');
                console.log('[reCAPTCHA] Cleared advanced selection after timeout');

                // Notify popup to clear UI
                chrome.runtime.sendMessage({ type: 'CAPTURE_COMPLETED' }).catch(() => {
                    // Popup might not be open, ignore error
                });

                chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    func: (resultsCount) => {
                        console.log('[reCAPTCHA] 🎉 Showing success notification...');

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
                                const uniqueId = `scrapfly-capture-notification-${Date.now()}`;
                                const notif = document.createElement('div');
                                notif.id = uniqueId;
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
                                    animation: slideIn 0.3s ease-out !important;
                                `;

                                const styleTag = document.createElement('style');
                                styleTag.setAttribute('data-scrapfly-notification', 'true');
                                styleTag.textContent = `
                                    @keyframes slideIn {
                                        from { transform: translateX(400px); opacity: 0; }
                                        to { transform: translateX(0); opacity: 1; }
                                    }
                                    @keyframes slideOut {
                                        from { transform: translateX(0); opacity: 1; }
                                        to { transform: translateX(400px); opacity: 0; }
                                    }
                                `;
                                document.head.appendChild(styleTag);

                                notif.innerHTML = `
                                    <div style="font-weight: 600; font-size: 16px; margin-bottom: 8px;">
                                        ✅ Capture Successful
                                    </div>
                                    <div style="opacity: 0.9;">
                                        ${resultsCount} request${resultsCount !== 1 ? 's' : ''} captured and decoded
                                    </div>
                                `;
                                document.body.appendChild(notif);
                                console.log('[reCAPTCHA] ✅ Success notification shown');

                                setTimeout(() => {
                                    notif.style.animation = 'slideOut 0.3s ease-in';
                                    notif.style.animationFillMode = 'forwards';
                                    setTimeout(() => notif.remove(), 300);
                                }, 5000);
                            }, 100);
                        });
                    },
                    args: [capturedResults.length]
                }).catch(err => {
                    console.error('[reCAPTCHA] ❌ Failed to show completion notification:', err);
                    console.error('[reCAPTCHA] Error details:', err.message, err.stack);

                    // Fallback to system notification when in-page injection fails
                    chrome.notifications.create({
                        type: 'basic',
                        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
                        title: 'Capture Successful',
                        message: `${capturedResults.length} request${capturedResults.length !== 1 ? 's' : ''} captured and decoded`,
                        priority: 2
                    });
                });
            }
        }, 60000);

        const state = reCaptchaCaptureStateRef.get(tabId);
        if (state) {
            state.captureTimeout = captureTimeout;
            reCaptchaCaptureStateRef.set(tabId, state);
        }

        return { status: 'started' };
    } catch (error) {
        console.error('[reCAPTCHA] Error in startCapture:', error);
        return { status: 'error', error: error.message };
    }
}

function handleRecaptchaRequest(details) {
    const captureState = reCaptchaCaptureStateRef;
    console.log('[reCAPTCHA] Request intercepted:', {
        url: details.url,
        tabId: details.tabId,
        method: details.method,
        type: details.type
    });

    const state = captureState.get(details.tabId);
    console.log('[reCAPTCHA] Capture state for tab', details.tabId, ':', state);

    if (!state) {
        console.warn('[reCAPTCHA] No capture state found for tab', details.tabId);
        return;
    }

    if (!state.isCapturing) {
        console.warn('[reCAPTCHA] Capture not active for tab', details.tabId);
        return;
    }

    const url = new URL(details.url);

    // Test regex patterns
    const isAnchor = /\/recaptcha\/(api2|enterprise)\/anchor/.test(details.url);
    const isReload = /\/recaptcha\/(api2|enterprise)\/(reload|userverify)/.test(details.url);

    console.log('[reCAPTCHA] URL pattern test:', {
        url: details.url,
        isAnchor,
        isReload,
        pathname: url.pathname
    });

    if (isAnchor) {
        console.log('[reCAPTCHA] ✅ ANCHOR request detected');

        const siteKey = url.searchParams.get('k');
        const size = url.searchParams.get('size');
        const s = url.searchParams.get('s');
        const co = url.searchParams.get('co');
        const sa = url.searchParams.get('sa');

        console.log('[reCAPTCHA] Anchor params:', { siteKey, size, s, co, sa });

        if (!state.anchorData) {
            state.anchorData = {};
        }

        state.anchorData[siteKey] = {
            site_url: co ? atob(co.replaceAll('.', '=')).replace(':443', '') : '',
            is_enterprise: details.url.includes('enterprise'),
            size_param: size || null,
            is_s_required: s != null,
            pageAction: sa || null,
            apiDomain: url.host.includes('recaptcha.net') ? 'www.recaptcha.net' : '',
            timestamp: Date.now()
        };

        captureState.set(details.tabId, state);
        console.log('[reCAPTCHA] ✅ Anchor data stored:', state.anchorData[siteKey]);

        chrome.tabs.sendMessage(details.tabId, {
            type: 'UPDATE_CAPTURE_STEP',
            step: 2,
            message: 'Now trigger or click the reCAPTCHA'
        }).catch(err => console.log('[reCAPTCHA] Failed to update notification:', err));

    } else if (isReload) {
        console.log('[reCAPTCHA] ✅ RELOAD/USERVERIFY request detected');

        // Extract siteKey from URL parameter
        const siteKeyFromUrl = url.searchParams.get('k');
        console.log('[reCAPTCHA] SiteKey from URL:', siteKeyFromUrl);

        if (details.requestBody && details.requestBody.raw) {
            const rawBytes = details.requestBody.raw[0].bytes;

            console.log('[reCAPTCHA] POST data length:', rawBytes.byteLength);

            if (!state.reloadData) {
                state.reloadData = [];
            }

            state.reloadData.push({
                url: details.url,
                postData: rawBytes,
                siteKey: siteKeyFromUrl,
                timestamp: Date.now()
            });

            captureState.set(details.tabId, state);
            console.log('[reCAPTCHA] ✅ Reload data captured, total:', state.reloadData.length);

            const hasAnchor = Object.keys(state.anchorData || {}).length > 0;
            const hasReload = state.reloadData.length > 0;

            console.log('[reCAPTCHA] 🔍 Checking auto-stop condition:', {
                hasAnchor,
                hasReload,
                anchorKeys: Object.keys(state.anchorData || {}),
                reloadCount: state.reloadData.length,
                isCapturing: state.isCapturing
            });

            if (hasAnchor && hasReload) {
                console.log('[reCAPTCHA] ✅ Both anchor and reload captured - triggering auto-stop NOW');

                // Process and stop immediately (we're already in service worker context)
                setTimeout(async () => {
                    console.log('[reCAPTCHA] 🚀 setTimeout EXECUTING for tab:', details.tabId);

                    const finalState = captureState.get(details.tabId);
                    console.log('[reCAPTCHA] Final state retrieved:', {
                        hasState: !!finalState,
                        isCapturing: finalState?.isCapturing,
                        hasTimeout: !!finalState?.captureTimeout
                    });

                    if (!finalState || !finalState.isCapturing) {
                        console.log('[reCAPTCHA] ❌ Already stopped or no state found - ABORTING');
                        return;
                    }

                    // Clear timeouts
                    if (finalState.captureTimeout) {
                        clearTimeout(finalState.captureTimeout);
                        console.log('[reCAPTCHA] Cleared capture timeout');
                    }

                    // Process captured data
                    console.log('[reCAPTCHA] 📊 Starting processCaptureData...');
                    const results = await processCaptureData(finalState);
                    console.log('[reCAPTCHA] ✅ Processing complete. Results:', results.length, results);

                    // Update state
                    finalState.isCapturing = false;
                    finalState.results = results;

                    // Delete state completely to prevent blocking next capture
                    captureState.delete(details.tabId);
                    console.log('[reCAPTCHA] Deleted capture state after interceptor auto-stop');

                    // Stop interception
                    console.log('[reCAPTCHA] Stopping interception...');
                    stopRecaptchaInterception();

                    // Save to history
                    if (results.length > 0) {
                        console.log('[reCAPTCHA] 💾 Saving to history...');
                        History.saveCaptureToHistory(details.tabId, results, chrome).catch(err => {
                            console.error('[reCAPTCHA] Failed to save to history:', err);
                        });
                    }

                    // Clear advanced selection after successful capture
                    chrome.storage.local.remove('scrapfly_advanced_selected');
                    console.log('[reCAPTCHA] Cleared advanced selection');

                    // Notify popup to clear UI
                    chrome.runtime.sendMessage({ type: 'CAPTURE_COMPLETED' }).catch(() => {
                        // Popup might not be open, ignore error
                    });

                    // Show success notification
                    console.log('[reCAPTCHA] 🎨 Injecting success notification...');
                    chrome.scripting.executeScript({
                        target: { tabId: details.tabId },
                        func: (count) => {
                            console.log('[reCAPTCHA] 🎉 SUCCESS! Showing notification');

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
                                    const uniqueId = `scrapfly-capture-notification-${Date.now()}`;
                                    const n = document.createElement('div');
                                    n.id = uniqueId;
                                    n.style.cssText = `position:fixed!important;top:20px!important;right:20px!important;background:linear-gradient(135deg,#11998e,#38ef7d)!important;color:white!important;padding:20px 24px!important;border-radius:12px!important;box-shadow:0 8px 32px rgba(0,0,0,0.3)!important;z-index:2147483647!important;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif!important;font-size:14px!important;min-width:320px!important;animation:slideIn 0.3s ease-out!important`;

                                    const styleTag = document.createElement('style');
                                    styleTag.setAttribute('data-scrapfly-notification', 'true');
                                    styleTag.textContent = `@keyframes slideIn{from{transform:translateX(400px);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes slideOut{from{transform:translateX(0);opacity:1}to{transform:translateX(400px);opacity:0}}`;
                                    document.head.appendChild(styleTag);

                                    n.innerHTML = `<div style="font-weight:600;font-size:16px;margin-bottom:8px">✅ Capture Complete!</div><div style="opacity:0.9">${count} reCAPTCHA request${count!==1?'s':''} captured and decoded</div>`;
                                    document.body.appendChild(n);
                                    console.log('[reCAPTCHA] ✅ Notification shown!');

                                    setTimeout(() => {
                                        n.style.animation = 'slideOut 0.3s ease-out';
                                        setTimeout(() => n.remove(), 300);
                                    }, 3000);
                                }, 100);
                            });
                        },
                        args: [results.length]
                    }).then(() => {
                        console.log('[reCAPTCHA] ✅ Success notification injection completed');
                    }).catch(err => {
                        console.error('[reCAPTCHA] ❌ Failed to show notification:', err);
                        console.error('[reCAPTCHA] Error details:', err.message, err.stack);

                        // Fallback to system notification when in-page injection fails
                        chrome.notifications.create({
                            type: 'basic',
                            iconUrl: chrome.runtime.getURL('icons/icon128.png'),
                            title: 'Capture Complete!',
                            message: `${results.length} reCAPTCHA request${results.length !== 1 ? 's' : ''} captured and decoded`,
                            priority: 2
                        });
                    });

                    console.log('[reCAPTCHA] 🏁 Auto-stop sequence completed');
                }, 100); // Small delay to ensure state is fully updated

                console.log('[reCAPTCHA] ⏱️ setTimeout scheduled (100ms delay)');
            } else {
                console.log('[reCAPTCHA] ⏸️ Auto-stop NOT triggered - conditions not met');
            }
        } else {
            console.warn('[reCAPTCHA] ⚠️ No request body found');
        }
    } else {
        console.log('[reCAPTCHA] Other reCAPTCHA request (not anchor/reload)');
    }
}

function startRecaptchaInterception() {
    if (recaptchaInterceptionListener) {
        console.log('[reCAPTCHA] ⚠️ Interception already active');
        return;
    }

    console.log('[reCAPTCHA] 🚀 Starting request interception...');

    recaptchaInterceptionListener = (details) => handleRecaptchaRequest(details);

    chrome.webRequest.onBeforeRequest.addListener(
        recaptchaInterceptionListener,
        { urls: ["*://*.google.com/recaptcha/*", "*://*.recaptcha.net/recaptcha/*"] },
        ["requestBody"]
    );

    console.log('[reCAPTCHA] ✅ Interception active for patterns:', [
        "*://*.google.com/recaptcha/*",
        "*://*.recaptcha.net/recaptcha/*"
    ]);
}

function stopRecaptchaInterception() {
    if (recaptchaInterceptionListener) {
        console.log('[reCAPTCHA] 🛑 Stopping request interception...');
        chrome.webRequest.onBeforeRequest.removeListener(recaptchaInterceptionListener);
        recaptchaInterceptionListener = null;
        console.log('[reCAPTCHA] ✅ Interception stopped');
    } else {
        console.log('[reCAPTCHA] ⚠️ No active interception to stop');
    }
}

async function processCaptureData(state) {
    console.log('[reCAPTCHA] Processing capture data...');
    console.log('[reCAPTCHA] State:', {
        hasAnchorData: !!state.anchorData,
        anchorDataKeys: state.anchorData ? Object.keys(state.anchorData) : [],
        hasReloadData: !!state.reloadData,
        reloadDataCount: state.reloadData ? state.reloadData.length : 0
    });

    const results = [];

    if (!state.reloadData || state.reloadData.length === 0) {
        console.warn('[reCAPTCHA] ⚠️ No reload data captured');
        return results;
    }

    console.log(`[reCAPTCHA] Processing ${state.reloadData.length} reload requests...`);

    for (let index = 0; index < state.reloadData.length; index++) {
        const reloadItem = state.reloadData[index];
        try {
            console.log(`[reCAPTCHA] Decoding request #${index + 1}...`);
            console.log(`[reCAPTCHA] POST data length: ${reloadItem.postData.byteLength}`);

            const array = new Uint8Array(reloadItem.postData);
            console.log(`[reCAPTCHA] Created Uint8Array, length: ${array.length}`);

            const pbf = new Pbf(array);
            const message = Message.read(pbf);

            console.log('[reCAPTCHA] 📋 Decoded protobuf message:', message);

            // Log all fields for debugging
            console.log('[reCAPTCHA] 📊 All protobuf fields:');
            Object.keys(message).forEach(key => {
                if (message[key]) {
                    console.log(`  ${key}: "${message[key]}"`);
                }
            });

            // Get siteKey from URL (stored in reloadItem)
            const siteKey = reloadItem.siteKey;
            console.log(`[reCAPTCHA] Using siteKey from URL: ${siteKey}`);

            // Check cookies before processing
            try {
                const tab = await chrome.tabs.get(details.tabId);
                const cookies = await chrome.cookies.getAll({ url: tab.url });
                const recaptchaCookies = cookies.filter(c => c.name.startsWith('recaptcha-ca'));

                console.log('[reCAPTCHA] 🍪 Cookie Check:');
                if (recaptchaCookies.length > 0) {
                    recaptchaCookies.forEach(cookie => {
                        console.log(`  ✅ Found: ${cookie.name} = ${cookie.value.substring(0, 20)}...`);
                    });
                } else {
                    console.log('  ❌ No recaptcha-ca cookies found');
                }
            } catch (err) {
                console.warn('[reCAPTCHA] Failed to check cookies:', err);
            }

            // Extract action and invisible flag from protobuf
            const action = message.field_08 || '';
            const invisible = message.field_06 || '';
            const field17 = message.field_17 || '';
            console.log(`[reCAPTCHA] Key fields: action="${action}", invisible="${invisible}", field_17="${field17}"`);

            const isInvisibleFromMessage = invisible.includes('fi');

            // Check if field_17 equals "session" (exact match)
            const hasSession = field17 && field17.toLowerCase() === 'session';
            console.log(`[reCAPTCHA] 🔍 Session check: field_17="${field17}" → hasSession=${hasSession}`);
            if (hasSession) {
                console.log('[reCAPTCHA] ✅ Session Mode Detected in field_17!');
            } else {
                console.log('[reCAPTCHA] ❌ Session Mode NOT detected (field_17 must equal "session")');
            }

            // Determine required cookie based on session mode (not initial cookie detection)
            let requiredCookie = null;
            if (hasSession) {
                // Session mode enabled - requires recaptcha-ca-t cookie
                requiredCookie = 'recaptcha-ca-t';
                console.log('[reCAPTCHA] 🍪 Cookie required: recaptcha-ca-t (v3 session mode)');
            }

            if (siteKey && state.anchorData[siteKey]) {
                console.log(`[reCAPTCHA] ✅ Found matching anchor data for siteKey: ${siteKey}`);

                const anchorInfo = state.anchorData[siteKey];

                let isReCaptchaV3 = true;
                let pageAction = action;
                let isInvisible = false;

                if (anchorInfo.pageAction) {
                    console.log(`[reCAPTCHA] ✅ Found 'sa' parameter in anchor - This is v2 with pageAction`);
                    isReCaptchaV3 = false;
                    pageAction = anchorInfo.pageAction;
                } else if (state.hasV2Cookie) {
                    console.log(`[reCAPTCHA] ✅ Found v2 cookie (recaptcha-ca-e or recaptcha-ca-t) - This is v2`);
                    isReCaptchaV3 = false;
                } else if (action.length === 0) {
                    console.log(`[reCAPTCHA] No action found - This is v2`);
                    isReCaptchaV3 = false;
                }

                if (!isReCaptchaV3) {
                    const sizeParam = anchorInfo.size_param || '';
                    const field06HasFi = invisible.includes('fi');

                    if (sizeParam.includes('normal')) {
                        console.log(`[reCAPTCHA] size=normal in anchor - This is V2 Checkbox (not invisible)`);
                        isInvisible = false;
                    } else if (sizeParam.includes('invisible') && field06HasFi) {
                        console.log(`[reCAPTCHA] size=invisible AND field_06 has 'fi' - This is V2 Invisible`);
                        isInvisible = true;
                    } else if (sizeParam.includes('invisible')) {
                        console.log(`[reCAPTCHA] size=invisible in anchor - This is V2 Invisible`);
                        isInvisible = true;
                    } else if (field06HasFi) {
                        console.log(`[reCAPTCHA] field_06 has 'fi' (no size param) - Treating as invisible`);
                        isInvisible = true;
                    }
                }

                const result = {
                    siteKey,
                    siteUrl: anchorInfo.site_url,
                    action: pageAction,
                    isReCaptchaV3,
                    isInvisible,
                    isEnterprise: anchorInfo.is_enterprise,
                    isSRequired: anchorInfo.is_s_required,
                    apiDomain: anchorInfo.apiDomain,
                    hasSession: hasSession,
                    requiredCookie: requiredCookie,
                    version: isReCaptchaV3 ? 'reCAPTCHA v3' : 'reCAPTCHA v2',
                    type: isReCaptchaV3 ? 'Score-based' : (isInvisible ? 'Invisible' : 'Checkbox'),
                    protobufFields: message,
                    timestamp: reloadItem.timestamp
                };

                console.log(`[reCAPTCHA] 🔍 Storing result with hasSession=${result.hasSession}, requiredCookie=${result.requiredCookie}`);
                results.push(result);
                console.log(`[reCAPTCHA] ✅ Result #${index + 1}:`, result);
            } else {
                console.warn(`[reCAPTCHA] ⚠️ No anchor data found for siteKey: ${siteKey}`);
                console.warn(`[reCAPTCHA] Available anchor keys:`, Object.keys(state.anchorData || {}));
            }
        } catch (error) {
            console.error(`[reCAPTCHA] ❌ Error decoding request #${index + 1}:`, error);
            console.error('[reCAPTCHA] Error stack:', error.stack);
        }
    }

    console.log(`[reCAPTCHA] Processing complete. Total results: ${results.length}`);
    return results;
}

/**
 * Handle tab updates during active reCAPTCHA capture
 * Monitors URL changes and page reload completion to transition between capture steps
 * @param {number} tabId - Tab ID
 * @param {object} changeInfo - Change information from chrome.tabs.onUpdated
 * @param {object} tab - Tab information
 * @param {object} chrome - Chrome API reference
 */
function reCaptchaHandleCaptureTabUpdate(tabId, changeInfo, tab, chrome) {
    // Check if captureStateRef is initialized first
    if (!reCaptchaCaptureStateRef) return;

    const state = reCaptchaCaptureStateRef.get(tabId);
    if (!state) return;

    // If URL changed (user navigated away), clear capture state
    if (changeInfo.url && state.captureUrl && changeInfo.url !== state.captureUrl) {
        console.log('[reCAPTCHA] URL changed, clearing capture state for tab:', tabId);
        if (state.captureInterval) {
            clearInterval(state.captureInterval);
        }
        reCaptchaCaptureStateRef.delete(tabId);
        stopRecaptchaInterception();
        return;
    }

    // Transition from step 1 to step 2 when page finishes loading
    if (changeInfo.status === 'complete' && state.step === 1) {
        state.step = 2;
        reCaptchaCaptureStateRef.set(tabId, state);

        const elapsed = Date.now() - state.startTime;
        const remaining = Math.max(0, 60000 - elapsed);

        chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: (timeRemaining) => {
                // Clear existing notifications
                const existingNotif = document.getElementById('scrapfly-capture-notification');
                if (existingNotif) existingNotif.remove();
                if (window.scrapflyTimerInterval) {
                    clearInterval(window.scrapflyTimerInterval);
                    window.scrapflyTimerInterval = null;
                }

                // Create step 2 notification
                const notif = document.createElement('div');
                notif.id = `scrapfly-capture-notification-${Date.now()}`;
                notif.style.cssText = `
                    position: fixed !important;
                    top: 20px !important;
                    right: 20px !important;
                    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%) !important;
                    color: white !important;
                    padding: 20px 24px !important;
                    border-radius: 12px !important;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3) !important;
                    z-index: 2147483647 !important;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
                    font-size: 14px !important;
                    min-width: 320px !important;
                `;
                notif.innerHTML = `
                    <style>
                        @keyframes slideIn { from { transform: translateX(400px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
                    </style>
                    <div style="font-weight: 600; font-size: 16px; margin-bottom: 8px;">🎯 reCAPTCHA Capture - Step 2</div>
                    <div style="opacity: 0.9;">Now trigger or click the reCAPTCHA</div>
                    <div id="scrapfly-timer" style="margin-top: 12px; font-size: 12px; opacity: 0.8; font-weight: 600;">
                        ⏱️ ${Math.floor(timeRemaining / 1000)}s remaining
                    </div>
                `;
                notif.style.animation = 'slideIn 0.3s ease-out';
                document.body.appendChild(notif);

                // Setup countdown timer
                let timeLeft = Math.floor(timeRemaining / 1000);
                window.scrapflyTimerInterval = setInterval(() => {
                    timeLeft--;
                    const timerEl = document.getElementById('scrapfly-timer');
                    if (timerEl && timeLeft > 0) {
                        timerEl.textContent = `⏱️ ${timeLeft}s remaining`;
                    } else if (timeLeft <= 0) {
                        clearInterval(window.scrapflyTimerInterval);
                        window.scrapflyTimerInterval = null;
                    }
                }, 1000);
            },
            args: [remaining]
        }).catch(err => console.error('[reCAPTCHA] Failed to show Step 2 notification:', err));
    }
}