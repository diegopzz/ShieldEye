class ReCaptchaAdvanced {
    constructor(detection, tabInfo) {
        this.detection = detection;
        this.tabInfo = tabInfo;
    }

    async captureCallback() {
        try {
            if (!this.tabInfo || !this.tabInfo.id) {
                throw new Error('Tab information not available');
            }


            const results = await chrome.scripting.executeScript({
                target: { tabId: this.tabInfo.id },
                func: () => {
                    const callbacks = [];

                    document.querySelectorAll('[data-callback]').forEach(el => {
                        callbacks.push({
                            element: el.tagName,
                            callback: el.getAttribute('data-callback'),
                            sitekey: el.getAttribute('data-sitekey')
                        });
                    });

                    const scripts = Array.from(document.querySelectorAll('script'));
                    const callbackMatches = [];
                    scripts.forEach(script => {
                        const content = script.textContent;
                        const matches = content.match(/['"]?callback['"]?\s*:\s*['"]?([\w.]+)['"]?/g);
                        if (matches) {
                            matches.forEach(m => {
                                const func = m.match(/['"]?callback['"]?\s*:\s*['"]?([\w.]+)['"]?/)[1];
                                if (func && !callbackMatches.includes(func)) {
                                    callbackMatches.push(func);
                                }
                            });
                        }
                    });

                    return {
                        success: true,
                        callbacks,
                        scriptCallbacks: callbackMatches
                    };
                }
            });

            if (results && results[0] && results[0].result) {
                const result = results[0].result;
                if (result.success) {
                    const allCallbacks = [
                        ...result.callbacks.map(c => c.callback),
                        ...result.scriptCallbacks
                    ].filter(Boolean);

                    if (allCallbacks.length > 0) {
                        this.displayCallbackModal(allCallbacks);
                    }
                }
            }
        } catch (error) {
            console.error('Failed to capture callback:', error);
        }
    }

    async clickRecaptcha() {
        try {
            if (!this.tabInfo || !this.tabInfo.id) {
                throw new Error('Tab information not available');
            }


            const results = await chrome.scripting.executeScript({
                target: { tabId: this.tabInfo.id },
                func: () => {
                    const selectors = [
                        '.g-recaptcha',
                        'iframe[src*="recaptcha"]',
                        '[data-sitekey]',
                        '.recaptcha-checkbox',
                        '#recaptcha-anchor'
                    ];

                    for (const selector of selectors) {
                        const element = document.querySelector(selector);
                        if (element) {
                            if (element.tagName === 'IFRAME') {
                                const iframeDoc = element.contentDocument || element.contentWindow.document;
                                const checkbox = iframeDoc.querySelector('.recaptcha-checkbox') ||
                                               iframeDoc.querySelector('#recaptcha-anchor');
                                if (checkbox) {
                                    checkbox.click();
                                    return { success: true, method: 'iframe-checkbox', selector };
                                }
                            } else {
                                element.click();
                                return { success: true, method: 'direct-click', selector };
                            }
                        }
                    }

                    if (typeof grecaptcha !== 'undefined' && grecaptcha.execute) {
                        try {
                            grecaptcha.execute();
                            return { success: true, method: 'grecaptcha-execute' };
                        } catch (e) {
                            return { success: false, error: 'grecaptcha.execute() failed: ' + e.message };
                        }
                    }

                    return { success: false, error: 'No reCAPTCHA elements found' };
                }
            });

            if (results && results[0] && results[0].result) {
                const result = results[0].result;
                this.displaySelectorModal(result);
            }
        } catch (error) {
            console.error('Failed to click reCAPTCHA:', error);
        }
    }

    async extractSiteKey() {
        try {
            if (!this.tabInfo || !this.tabInfo.id) {
                throw new Error('Tab information not available');
            }


            const results = await chrome.scripting.executeScript({
                target: { tabId: this.tabInfo.id },
                func: () => {
                    const extractors = [
                        () => document.querySelector('[data-sitekey]')?.getAttribute('data-sitekey'),
                        () => document.querySelector('.g-recaptcha')?.getAttribute('data-sitekey'),
                        () => {
                            const iframe = document.querySelector('iframe[src*="recaptcha"]');
                            if (iframe) {
                                const match = iframe.src.match(/[?&]k=([^&]+)/);
                                return match ? match[1] : null;
                            }
                            return null;
                        },
                        () => {
                            const scripts = Array.from(document.querySelectorAll('script'));
                            for (const script of scripts) {
                                const content = script.textContent;
                                const match = content.match(/sitekey['":\s]+['"]?([a-zA-Z0-9_-]{40})['"]?/);
                                if (match) return match[1];
                            }
                            return null;
                        }
                    ];

                    for (const extractor of extractors) {
                        const key = extractor();
                        if (key) {
                            return { success: true, sitekey: key };
                        }
                    }

                    return { success: false, error: 'No sitekey found' };
                }
            });

            if (results && results[0] && results[0].result) {
                const result = results[0].result;
                if (result.success) {
                    this.displaySiteKeyModal(result.sitekey);
                } else {
                    this.displayResult('SiteKey Extraction', result.error, 'error');
                }
            }
        } catch (error) {
            console.error('Failed to extract sitekey:', error);
        }
    }

    async checkVersion() {
        try {
            if (!this.tabInfo || !this.tabInfo.id) {
                throw new Error('Tab information not available');
            }


            const results = await chrome.scripting.executeScript({
                target: { tabId: this.tabInfo.id },
                func: () => {
                    const checks = {
                        hasV2Checkbox: !!document.querySelector('.g-recaptcha'),
                        hasV2Iframe: !!document.querySelector('iframe[src*="recaptcha/api2"]'),
                        hasV3Script: Array.from(document.querySelectorAll('script')).some(s =>
                            s.textContent.includes('grecaptcha.execute') || s.src.includes('recaptcha/api.js')
                        ),
                        hasInvisible: !!document.querySelector('[data-size="invisible"]'),
                        grecaptchaExists: typeof grecaptcha !== 'undefined',
                        grecaptchaVersion: typeof grecaptcha !== 'undefined' && grecaptcha.enterprise ? 'Enterprise' : 'Standard'
                    };

                    let version = 'Unknown';
                    let type = 'Unknown';

                    if (checks.hasV3Script && !checks.hasV2Checkbox) {
                        version = 'v3';
                        type = 'Invisible (Score-based)';
                    } else if (checks.hasInvisible) {
                        version = 'v2';
                        type = 'Invisible';
                    } else if (checks.hasV2Checkbox || checks.hasV2Iframe) {
                        version = 'v2';
                        type = 'Checkbox';
                    }

                    return {
                        success: true,
                        version,
                        type,
                        checks,
                        enterprise: checks.grecaptchaVersion === 'Enterprise'
                    };
                }
            });

            if (results && results[0] && results[0].result) {
                const result = results[0].result;
                if (result.success) {
                    this.displayVersionModal(result);
                }
            }
        } catch (error) {
            console.error('Failed to check version:', error);
        }
    }


    async checkCaptureState() {
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'RECAPTCHA_GET_CAPTURE_STATE',
                tabId: this.tabInfo.id
            });
            if (response && response.isCapturing) {
                this.updateButtonState(true);
            }
        } catch (error) {
            console.error('Error checking capture state:', error);
        }
    }

    async startCapturing() {
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'RECAPTCHA_GET_CAPTURE_STATE',
                tabId: this.tabInfo.id
            });

            if (response && response.isCapturing) {
                await this.stopCapturing();
                return;
            }

            const startResponse = await chrome.runtime.sendMessage({
                type: 'RECAPTCHA_START_CAPTURE',
                tabId: this.tabInfo.id
            });

            if (startResponse && (startResponse.status === 'started' || startResponse.status === 'already_capturing')) {
                this.updateButtonState(true);
                this.startResultsPolling();
            }
        } catch (error) {
            console.error('Failed to start capturing:', error);
        }
    }

    async stopCapturing() {
        try {
            console.log('[ReCaptcha] Sending RECAPTCHA_STOP_CAPTURE message for tab:', this.tabInfo.id);

            const response = await chrome.runtime.sendMessage({
                type: 'RECAPTCHA_STOP_CAPTURE',
                tabId: this.tabInfo.id
            });

            console.log('[ReCaptcha] ✅ Stop capture response received:', response);
            console.log('[ReCaptcha] Response structure:', {
                hasResponse: !!response,
                hasResults: response && !!response.results,
                resultsType: response && response.results ? typeof response.results : 'undefined',
                resultsIsArray: response && response.results ? Array.isArray(response.results) : false,
                resultsLength: response && response.results ? response.results.length : 0,
                resultsCount: response && response.resultsCount
            });

            this.updateButtonState(false);
            this.stopResultsPolling();

            // Display results immediately if they exist
            if (response && response.results) {
                if (response.results.length > 0) {
                    console.log('[ReCaptcha] ✅ Calling displayCaptureResults with:', response.results);
                    this.displayCaptureResults(response.results);
                } else {
                    console.log('[ReCaptcha] ⚠️ Results array is empty');
                    this.displayEmptyResultsMessage();
                }
            } else {
                console.log('[ReCaptcha] ❌ No results in response');
                this.displayEmptyResultsMessage();
            }
        } catch (error) {
            console.error('[ReCaptcha] ❌ Failed to stop capturing:', error);
            console.error('[ReCaptcha] Error stack:', error.stack);
        }
    }

    updateButtonState(isCapturing) {
        const captureBtn = document.querySelector('#recaptchaCapture');
        if (captureBtn) {
            const icon = captureBtn.querySelector('.tool-btn-icon');
            const label = captureBtn.querySelector('.tool-btn-label');
            if (isCapturing) {
                if (icon) icon.textContent = '⏹️';
                if (label) label.textContent = 'Stop Capturing';
                captureBtn.classList.add('capturing');
            } else {
                if (icon) icon.textContent = '🎬';
                if (label) label.textContent = 'Start Capturing';
                captureBtn.classList.remove('capturing');
            }
        }
    }


    displayResult(title, content, type = 'info') {
        const resultsContainer = document.querySelector('#recaptchaResults');
        if (!resultsContainer) return;

        const typeClass = type === 'success' ? 'result-success' :
                         type === 'error' ? 'result-error' : 'result-info';

        const resultHtml = `
            <div class="tool-result ${typeClass}">
                <div class="result-title">${title}</div>
                <div class="result-content">${content.replace(/\n/g, '<br>')}</div>
                <div class="result-timestamp">${new Date().toLocaleTimeString()}</div>
            </div>
        `;

        resultsContainer.insertAdjacentHTML('afterbegin', resultHtml);

        resultsContainer.style.display = 'block';
    }

    displaySelectorModal(result) {
        const modal = document.createElement('div');
        modal.className = 'sitekey-modal';

        const isSuccess = result.success;
        const statusIcon = isSuccess ? '✅' : '❌';
        const statusColor = isSuccess ? 'var(--success)' : 'var(--danger)';

        modal.innerHTML = `
            <div class="sitekey-modal-content">
                <div class="sitekey-header">
                    <h4>${statusIcon} reCAPTCHA Selector</h4>
                    <button class="sitekey-close">×</button>
                </div>
                <div class="sitekey-body">
                    ${isSuccess ? `
                        <div class="version-info">
                            <div class="info-row">
                                <span class="info-label">Method:</span>
                                <span class="info-value">${result.method || 'N/A'}</span>
                            </div>
                            ${result.selector ? `
                                <div class="info-row">
                                    <span class="info-label">Selector:</span>
                                    <span class="info-value" style="font-family: monospace; word-break: break-all;">${result.selector}</span>
                                </div>
                            ` : ''}
                        </div>
                        ${result.selector ? `
                            <button class="sitekey-copy-btn" data-selector="${result.selector}" style="margin-top: 16px;">
                                📋 Copy Selector
                            </button>
                        ` : ''}
                    ` : `
                        <div style="padding: 16px; text-align: center;">
                            <div style="font-size: 48px; margin-bottom: 12px;">⚠️</div>
                            <div style="font-size: 14px; font-weight: 500; margin-bottom: 8px; color: ${statusColor};">
                                Failed to find reCAPTCHA
                            </div>
                            <div style="font-size: 12px; opacity: 0.8; line-height: 1.6;">
                                ${result.error || 'No reCAPTCHA elements found on this page'}
                            </div>
                        </div>
                    `}
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelector('.sitekey-close').addEventListener('click', () => {
            modal.remove();
        });

        if (isSuccess && result.selector) {
            const copyBtn = modal.querySelector('.sitekey-copy-btn');
            if (copyBtn) {
                copyBtn.addEventListener('click', async (e) => {
                    try {
                        await navigator.clipboard.writeText(result.selector);
                        e.target.textContent = '✅ Copied!';
                        setTimeout(() => {
                            e.target.textContent = '📋 Copy Selector';
                        }, 2000);
                    } catch (error) {
                        console.error('Failed to copy to clipboard:', error);
                    }
                });
            }
        }

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        setTimeout(() => modal.classList.add('show'), 10);
    }

    displaySiteKeyModal(sitekey) {
        const modal = document.createElement('div');
        modal.className = 'sitekey-modal';
        modal.innerHTML = `
            <div class="sitekey-modal-content">
                <div class="sitekey-header">
                    <h4>reCAPTCHA SiteKey</h4>
                    <button class="sitekey-close">×</button>
                </div>
                <div class="sitekey-body">
                    <div class="sitekey-value">
                        <code>${sitekey}</code>
                    </div>
                    <button class="sitekey-copy-btn" data-sitekey="${sitekey}">
                        📋 Copy to Clipboard
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelector('.sitekey-close').addEventListener('click', () => {
            modal.remove();
        });

        modal.querySelector('.sitekey-copy-btn').addEventListener('click', async (e) => {
            try {
                await navigator.clipboard.writeText(sitekey);
                e.target.textContent = '✅ Copied!';
                setTimeout(() => {
                    e.target.textContent = '📋 Copy to Clipboard';
                }, 2000);
            } catch (error) {
                console.error('Failed to copy to clipboard:', error);
            }
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        setTimeout(() => modal.classList.add('show'), 10);
    }

    displayVersionModal(versionData) {
        const modal = document.createElement('div');
        modal.className = 'sitekey-modal';
        modal.innerHTML = `
            <div class="sitekey-modal-content">
                <div class="sitekey-header">
                    <h4>reCAPTCHA Version Information</h4>
                    <button class="sitekey-close">×</button>
                </div>
                <div class="sitekey-body">
                    <div class="version-info">
                        <div class="info-row">
                            <span class="info-label">Version:</span>
                            <span class="info-value">${versionData.version}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Type:</span>
                            <span class="info-value">${versionData.type}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Enterprise:</span>
                            <span class="info-value">${versionData.enterprise ? 'Yes' : 'No'}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelector('.sitekey-close').addEventListener('click', () => {
            modal.remove();
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        setTimeout(() => modal.classList.add('show'), 10);
    }

    displayCallbackModal(callbacks) {
        const callbackList = callbacks.map(cb => `<div class="callback-item"><code>${cb}</code></div>`).join('');

        const modal = document.createElement('div');
        modal.className = 'sitekey-modal';
        modal.innerHTML = `
            <div class="sitekey-modal-content">
                <div class="sitekey-header">
                    <h4>reCAPTCHA Callbacks</h4>
                    <button class="sitekey-close">×</button>
                </div>
                <div class="sitekey-body">
                    <div class="callbacks-list">
                        ${callbackList}
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelector('.sitekey-close').addEventListener('click', () => {
            modal.remove();
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        setTimeout(() => modal.classList.add('show'), 10);
    }

    displayCaptureResults(results) {
        if (!results || results.length === 0) {
            console.log('No capture results to display');
            return;
        }

        const resultsList = results.map((result, index) => `
            <div class="capture-result-item" style="margin-bottom: 16px; padding: 16px; background: var(--bg-tertiary); border-radius: 8px;">
                <div style="font-weight: 600; font-size: 14px; margin-bottom: 12px; color: var(--accent);">
                    Request #${index + 1}
                </div>
                <div class="result-grid" style="display: grid; grid-template-columns: 140px 1fr; gap: 8px; font-size: 12px;">
                    <div style="opacity: 0.7;">Site URL:</div>
                    <div class="copyable-value" data-copy="${result.siteUrl || ''}" style="font-weight: 500; cursor: pointer; padding: 4px; border-radius: 4px; transition: background 0.2s;" title="Click to copy">${result.siteUrl || 'N/A'}</div>

                    <div style="opacity: 0.7;">Site Key:</div>
                    <div class="copyable-value" data-copy="${result.siteKey}" style="font-family: monospace; font-size: 11px; word-break: break-all; cursor: pointer; padding: 4px; border-radius: 4px; transition: background 0.2s;" title="Click to copy">${result.siteKey}</div>

                    <div style="opacity: 0.7;">Version:</div>
                    <div class="copyable-value" data-copy="${result.version}" style="cursor: pointer; padding: 4px; border-radius: 4px; transition: background 0.2s;" title="Click to copy"><span style="padding: 2px 8px; background: var(--accent); color: white; border-radius: 4px; font-size: 10px;">${result.version}</span></div>

                    <div style="opacity: 0.7;">Type:</div>
                    <div class="copyable-value" data-copy="${result.type}" style="cursor: pointer; padding: 4px; border-radius: 4px; transition: background 0.2s;" title="Click to copy">${result.type}</div>

                    ${result.action ? `
                        <div style="opacity: 0.7;">Action (v3):</div>
                        <div class="copyable-value" data-copy="${result.action}" style="font-family: monospace; cursor: pointer; padding: 4px; border-radius: 4px; transition: background 0.2s;" title="Click to copy">${result.action}</div>
                    ` : ''}

                    <div style="opacity: 0.7;">Enterprise:</div>
                    <div class="copyable-value" data-copy="${result.isEnterprise ? 'Yes' : 'No'}" style="cursor: pointer; padding: 4px; border-radius: 4px; transition: background 0.2s;" title="Click to copy">${result.isEnterprise ? '✅ Yes' : '❌ No'}</div>

                    <div style="opacity: 0.7;">Invisible:</div>
                    <div class="copyable-value" data-copy="${result.isInvisible ? 'Yes' : 'No'}" style="cursor: pointer; padding: 4px; border-radius: 4px; transition: background 0.2s;" title="Click to copy">${result.isInvisible ? '✅ Yes' : '❌ No'}</div>

                    ${result.hasSession ? `
                        <div style="opacity: 0.7;">Session Mode:</div>
                        <div class="copyable-value" data-copy="Enabled" style="cursor: pointer; padding: 4px; border-radius: 4px; transition: background 0.2s;" title="Click to copy">✅ Enabled</div>
                    ` : ''}

                    ${result.requiredCookie ? `
                        <div style="opacity: 0.7;">Required Cookie:</div>
                        <div class="copyable-value" data-copy="${result.requiredCookie}" style="font-family: monospace; color: var(--success); cursor: pointer; padding: 4px; border-radius: 4px; transition: background 0.2s;" title="Click to copy">🍪 ${result.requiredCookie}</div>
                    ` : ''}

                    ${result.apiDomain ? `
                        <div style="opacity: 0.7;">API Domain:</div>
                        <div class="copyable-value" data-copy="${result.apiDomain}" style="cursor: pointer; padding: 4px; border-radius: 4px; transition: background 0.2s;" title="Click to copy">${result.apiDomain}</div>
                    ` : ''}

                    ${result.isSRequired ? `
                        <div style="opacity: 0.7;">S Parameter:</div>
                        <div class="copyable-value" data-copy="Required" style="cursor: pointer; padding: 4px; border-radius: 4px; transition: background 0.2s;" title="Click to copy">✅ Required</div>
                    ` : ''}
                </div>
            </div>
        `).join('');

        const modal = document.createElement('div');
        modal.className = 'sitekey-modal';
        modal.innerHTML = `
            <div class="sitekey-modal-content" style="max-width: 700px;">
                <div class="sitekey-header">
                    <h4>🎬 reCAPTCHA Capture Results</h4>
                    <button class="sitekey-close">×</button>
                </div>
                <div class="sitekey-body" style="max-height: 500px; overflow-y: auto;">
                    <div style="margin-bottom: 16px; padding: 12px; background: var(--bg-secondary); border-radius: 6px; border-left: 3px solid var(--success);">
                        <strong>${results.length}</strong> reCAPTCHA request${results.length !== 1 ? 's' : ''} captured and decoded
                    </div>
                    ${resultsList}
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelector('.sitekey-close').addEventListener('click', () => {
            modal.remove();
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        // Add click-to-copy functionality for all copyable values
        modal.querySelectorAll('.copyable-value').forEach(element => {
            element.addEventListener('click', async (e) => {
                e.stopPropagation();
                const valueToCopy = element.getAttribute('data-copy');

                try {
                    await navigator.clipboard.writeText(valueToCopy);

                    // Visual feedback
                    const originalBg = element.style.background;
                    element.style.color = 'white';
                    element.style.background = 'var(--success)';

                    setTimeout(() => {
                        element.style.background = originalBg;
                        element.style.color = '';
                    }, 200);
                } catch (err) {
                    console.error('Failed to copy:', err);
                }
            });

            // Hover effect
            element.addEventListener('mouseenter', () => {
                element.style.background = 'var(--bg-secondary)';
            });

            element.addEventListener('mouseleave', () => {
                element.style.background = '';
            });
        });

        setTimeout(() => modal.classList.add('show'), 10);
    }

    displayEmptyResultsMessage() {
        const modal = document.createElement('div');
        modal.className = 'sitekey-modal';
        modal.innerHTML = `
            <div class="sitekey-modal-content" style="max-width: 500px;">
                <div class="sitekey-header">
                    <h4>🎬 reCAPTCHA Capture Complete</h4>
                    <button class="sitekey-close">×</button>
                </div>
                <div class="sitekey-body">
                    <div style="padding: 20px; text-align: center;">
                        <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
                        <div style="font-size: 14px; margin-bottom: 12px;">
                            <strong>No reCAPTCHA data captured</strong>
                        </div>
                        <div style="font-size: 12px; opacity: 0.7; line-height: 1.6;">
                            This could mean:<br>
                            • The reCAPTCHA wasn't triggered during capture<br>
                            • The page was reloaded but no interaction occurred<br>
                            • The reCAPTCHA is not a standard implementation
                        </div>
                        <div style="margin-top: 16px; padding: 12px; background: var(--bg-tertiary); border-radius: 6px; font-size: 11px; text-align: left;">
                            <strong>Try again:</strong><br>
                            1. Click "Start Capturing"<br>
                            2. Reload the page<br>
                            3. Click or interact with the reCAPTCHA<br>
                            4. Click "Stop Capturing"
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelector('.sitekey-close').addEventListener('click', () => {
            modal.remove();
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        setTimeout(() => modal.classList.add('show'), 10);
    }

    renderTools() {
        return `
            <div class="recaptcha-tools-grid">
                <button class="recaptcha-tool-btn" id="recaptchaClick">
                    <div class="tool-btn-icon">👆</div>
                    <div class="tool-btn-label">Obtain selector</div>
                </button>

                <button class="recaptcha-tool-btn" id="recaptchaExtract">
                    <div class="tool-btn-icon">🔑</div>
                    <div class="tool-btn-label">Extract SiteKey</div>
                </button>

                <button class="recaptcha-tool-btn" id="recaptchaVersion">
                    <div class="tool-btn-icon">📋</div>
                    <div class="tool-btn-label">Check Version</div>
                </button>

                <button class="recaptcha-tool-btn" id="recaptchaCallback">
                    <div class="tool-btn-icon">📡</div>
                    <div class="tool-btn-label">reCaptcha callback</div>
                </button>

                <button class="recaptcha-tool-btn" id="recaptchaCapture">
                    <div class="tool-btn-icon">🎬</div>
                    <div class="tool-btn-label">Start Capturing</div>
                </button>
            </div>

            <div id="recaptchaResults" class="tool-results" style="display: none;"></div>
        `;
    }

    async checkForResults() {
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'RECAPTCHA_GET_CAPTURE_RESULTS',
                tabId: this.tabInfo.id
            });

            if (response && response.success && response.results.length > 0) {
                this.displayCaptureResults(response.results);
                if (this.resultsCheckInterval) {
                    clearInterval(this.resultsCheckInterval);
                    this.resultsCheckInterval = null;
                }
            }
        } catch (error) {
            console.error('Error checking for results:', error);
        }
    }

    startResultsPolling() {
        if (this.resultsCheckInterval) {
            clearInterval(this.resultsCheckInterval);
        }
        this.resultsCheckInterval = setInterval(() => this.checkForResults(), 2000);
    }

    stopResultsPolling() {
        if (this.resultsCheckInterval) {
            clearInterval(this.resultsCheckInterval);
            this.resultsCheckInterval = null;
        }
    }

    setupEventListeners() {
        this.checkCaptureState();

        const actions = [
            { id: 'recaptchaClick', method: () => this.clickRecaptcha() },
            { id: 'recaptchaExtract', method: () => this.extractSiteKey() },
            { id: 'recaptchaVersion', method: () => this.checkVersion() },
            { id: 'recaptchaCallback', method: () => this.captureCallback() },
            { id: 'recaptchaCapture', method: () => this.startCapturing() }
        ];

        actions.forEach(({ id, method }) => {
            const btn = document.querySelector(`#${id}`);
            if (btn) {
                btn.addEventListener('click', method);
            }
        });

        // Setup capture history listeners if section exists
        this.setupCaptureHistoryListeners();
    }

    // ===== CAPTURE HISTORY METHODS =====

    /**
     * Load capture history from storage
     * @returns {Promise<Array>} Array of capture history items
     */
    async loadCaptureHistory() {
        try {
            const result = await chrome.storage.local.get(['scrapfly_advanced_history']);

            if (!result.scrapfly_advanced_history) {
                return [];
            }

            let history = [];
            if (typeof result.scrapfly_advanced_history === 'string') {
                const parsed = JSON.parse(result.scrapfly_advanced_history);
                history = parsed.items || [];
            } else if (Array.isArray(result.scrapfly_advanced_history)) {
                history = result.scrapfly_advanced_history;
            } else if (result.scrapfly_advanced_history.items) {
                history = result.scrapfly_advanced_history.items || [];
            }

            // Filter out expired items
            const now = Date.now();
            console.log(`[ReCaptcha] Checking ${history.length} items for expiration`);

            const validHistory = history.filter(item => {
                if (!item.expiresAt) {
                    console.log(`[ReCaptcha] Item ${item.id} has no expiration (old data) - REMOVING`);
                    return false;
                }

                const isValid = item.expiresAt > now;
                const minutesRemaining = Math.round((item.expiresAt - now) / 1000 / 60);

                if (isValid) {
                    console.log(`[ReCaptcha] Item ${item.id} expires in ${minutesRemaining} minutes`);
                } else {
                    console.log(`[ReCaptcha] Item ${item.id} expired ${Math.abs(minutesRemaining)} minutes ago - REMOVING`);
                }

                return isValid;
            });

            // If we removed expired items, update storage
            if (validHistory.length !== history.length) {
                console.log(`[ReCaptcha] ✅ Removed ${history.length - validHistory.length} expired capture items`);
                await chrome.storage.local.set({
                    scrapfly_advanced_history: {
                        items: validHistory,
                        lastUpdated: Date.now()
                    }
                });
            } else {
                console.log(`[ReCaptcha] No expired items found`);
            }

            return validHistory;
        } catch (error) {
            console.error('Failed to load capture history:', error);
            return [];
        }
    }

    /**
     * Render capture history section HTML
     * @returns {Promise<string>} HTML for capture history
     */
    async renderCaptureHistoryHTML() {
        if (!this.tabInfo || !this.tabInfo.url) {
            return '';
        }

        const currentHostname = new URL(this.tabInfo.url).hostname;
        const history = await this.loadCaptureHistory();
        const filteredHistory = history.filter(item => item.hostname === currentHostname);

        // Store filtered history for pagination
        this.currentCaptureHistory = filteredHistory;

        let historyItems;
        if (filteredHistory.length === 0) {
            historyItems = `
                <div class="empty-capture-state" style="padding: 32px 16px; text-align: center; opacity: 0.7;">
                    <div style="font-size: 48px; margin-bottom: 12px;">📭</div>
                    <div style="font-size: 14px; font-weight: 500; margin-bottom: 8px;">No captures yet</div>
                    <div style="font-size: 12px; opacity: 0.8;">Click "Start Capturing" above and interact with reCAPTCHA to capture data</div>
                </div>
            `;
        } else {
            historyItems = this.renderCaptureHistoryItems(filteredHistory.slice(0, 3));
        }

        return `
            <div class="capture-history-section">
                <div class="section-header">
                    <div class="header-left">
                        <span class="header-icon">📜</span>
                        <h3>Captured Data</h3>
                    </div>
                    <div class="header-right">
                        <span class="history-count">${filteredHistory.length} capture${filteredHistory.length !== 1 ? 's' : ''}</span>
                        ${filteredHistory.length > 0 ? `
                            <button class="clear-history-btn" id="clearCaptureHistory" title="Clear all captured data">
                                <span>🗑️</span>
                            </button>
                        ` : ''}
                    </div>
                </div>
                <div class="history-list" id="captureHistoryList">
                    ${historyItems}
                </div>
                ${filteredHistory.length > 0 ? '<div id="captureHistoryPagination"></div>' : ''}
            </div>
        `;
    }

    /**
     * Render capture history items HTML
     * @param {Array} items - Array of capture history items to render
     * @returns {string} HTML for history items
     */
    renderCaptureHistoryItems(items) {
        return items.map((item) => {
            const { url, hostname, captureData, timestamp } = item;
            const { version, type, siteKey, isEnterprise, isInvisible } = captureData;

            const timeAgo = this.getTimeAgo(timestamp);
            const faviconUrl = `https://www.google.com/s2/favicons?domain=${hostname}`;

            let versionDisplay = version;
            if (isEnterprise) {
                versionDisplay += ' Enterprise';
            }
            if (version === 'v2' && isInvisible) {
                versionDisplay += ' Invisible';
            }

            return `
                <div class="capture-card" data-capture-id="${item.id}">
                    <div class="capture-card-top">
                        <img src="${faviconUrl}" class="capture-favicon" alt="${hostname}" onerror="this.style.display='none'">
                        <div class="capture-info">
                            <div class="capture-hostname-row">
                                <span class="capture-hostname">${hostname}</span>
                                <span class="capture-time">${timeAgo}</span>
                            </div>
                            <div class="capture-type-row">
                                <span class="capture-type-label">Version</span>
                                <span class="capture-type-value">${versionDisplay}</span>
                            </div>
                        </div>
                        <button class="capture-expand" data-capture-id="${item.id}">
                            <span class="expand-arrow">›</span>
                        </button>
                    </div>
                    <div class="capture-sitekey-container">
                        <code class="capture-sitekey-code">${siteKey}</code>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Setup capture history event listeners
     */
    setupCaptureHistoryListeners() {
        const clearBtn = document.querySelector('#clearCaptureHistory');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearCaptureHistory());
        }

        // Setup pagination if we have history items
        if (this.currentCaptureHistory && this.currentCaptureHistory.length > 0) {
            this.setupCaptureHistoryPagination();
            return;
        }

        // Only set up card listeners if NOT using pagination
        const expandBtns = document.querySelectorAll('.capture-expand');
        expandBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const captureId = btn.getAttribute('data-capture-id');
                this.toggleCaptureDetails(captureId);
            });
        });

        const captureCards = document.querySelectorAll('.capture-card');
        captureCards.forEach(card => {
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.capture-expand')) {
                    const captureId = card.getAttribute('data-capture-id');
                    this.toggleCaptureDetails(captureId);
                }
            });
        });
    }

    /**
     * Setup pagination for capture history
     */
    setupCaptureHistoryPagination() {
        if (!this.currentCaptureHistory || this.currentCaptureHistory.length === 0) return;

        console.log('[ReCaptcha] Setting up pagination for', this.currentCaptureHistory.length, 'items');

        this.captureHistoryPagination = new PaginationManager('captureHistoryPagination', {
            itemsPerPage: 3,
            onPageChange: (page, items) => {
                console.log('[ReCaptcha] Pagination onPageChange triggered - page:', page, 'items:', items.length);
                this.renderCaptureHistoryPage(items);
            }
        });

        this.captureHistoryPagination.setItems(this.currentCaptureHistory);
    }

    /**
     * Render a page of capture history items
     * @param {Array} items - Items for current page
     */
    renderCaptureHistoryPage(items) {
        console.log('[ReCaptcha] renderCaptureHistoryPage called with', items.length, 'items');
        const listContainer = document.querySelector('#captureHistoryList');
        if (!listContainer) {
            console.warn('[ReCaptcha] #captureHistoryList container not found');
            return;
        }

        listContainer.innerHTML = this.renderCaptureHistoryItems(items);
        console.log('[ReCaptcha] Rendered items, setting up listeners...');

        // Re-setup event listeners for the new page
        const expandBtns = listContainer.querySelectorAll('.capture-expand');
        console.log('[ReCaptcha] Found', expandBtns.length, 'expand buttons');
        expandBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                console.log('[ReCaptcha] Expand button clicked');
                e.stopPropagation();
                const captureId = btn.getAttribute('data-capture-id');
                this.toggleCaptureDetails(captureId);
            });
        });

        const captureCards = listContainer.querySelectorAll('.capture-card');
        console.log('[ReCaptcha] Found', captureCards.length, 'capture cards');
        captureCards.forEach(card => {
            card.addEventListener('click', (e) => {
                console.log('[ReCaptcha] Capture card clicked');
                if (!e.target.closest('.capture-expand')) {
                    const captureId = card.getAttribute('data-capture-id');
                    this.toggleCaptureDetails(captureId);
                }
            });
        });
    }

    /**
     * Toggle capture details display
     * @param {string} captureId - Capture ID
     */
    async toggleCaptureDetails(captureId) {
        const captureCard = document.querySelector(`.capture-card[data-capture-id="${captureId}"]`);
        if (!captureCard) return;

        const existingDetails = captureCard.querySelector('.history-item-details');
        if (existingDetails) {
            existingDetails.remove();
            captureCard.classList.remove('expanded');
            return;
        }

        // Load full capture data
        const history = await this.loadCaptureHistory();
        const capture = history.find(item => item.id === captureId);
        if (!capture) return;

        const { captureData, url, title } = capture;

        const detailsHtml = `
            <div class="history-item-details">
                <div class="details-grid">
                    <div class="detail-row">
                        <span class="detail-label">Site URL:</span>
                        <span class="detail-value">${captureData.siteUrl || 'N/A'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Site Key:</span>
                        <span class="detail-value detail-code">${captureData.siteKey}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Version:</span>
                        <span class="detail-value">${captureData.version}${captureData.isEnterprise ? ' Enterprise' : ''}${captureData.version === 'v2' && captureData.isInvisible ? ' Invisible' : ''}</span>
                    </div>
                    ${captureData.action ? `
                        <div class="detail-row">
                            <span class="detail-label">Action:</span>
                            <span class="detail-value detail-code">${captureData.action}</span>
                        </div>
                    ` : ''}
                    ${captureData.hasSession ? `
                        <div class="detail-row">
                            <span class="detail-label">Session Mode:</span>
                            <span class="detail-value">✅ Enabled</span>
                        </div>
                    ` : ''}
                    ${captureData.requiredCookie ? `
                        <div class="detail-row">
                            <span class="detail-label">Required Cookie:</span>
                            <span class="detail-value detail-code">🍪 ${captureData.requiredCookie}</span>
                        </div>
                    ` : ''}
                    ${captureData.apiDomain ? `
                        <div class="detail-row">
                            <span class="detail-label">API Domain:</span>
                            <span class="detail-value">${captureData.apiDomain}</span>
                        </div>
                    ` : ''}
                    ${captureData.isSRequired ? `
                        <div class="detail-row">
                            <span class="detail-label">S Parameter:</span>
                            <span class="detail-value">✅ Required</span>
                        </div>
                    ` : ''}
                </div>
                <div class="details-actions">
                    <button class="detail-action-btn copy-sitekey-btn" data-sitekey="${captureData.siteKey}">
                        📋 Copy Site Key
                    </button>
                    <button class="detail-action-btn copy-all-btn" data-capture-id="${captureId}">
                        📄 Copy All Data
                    </button>
                </div>
            </div>
        `;

        captureCard.insertAdjacentHTML('beforeend', detailsHtml);
        captureCard.classList.add('expanded');

        // Setup detail action buttons
        const copySiteKeyBtn = captureCard.querySelector('.copy-sitekey-btn');
        if (copySiteKeyBtn) {
            copySiteKeyBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const siteKey = copySiteKeyBtn.getAttribute('data-sitekey');
                await navigator.clipboard.writeText(siteKey);
                copySiteKeyBtn.textContent = '✅ Copied!';
                setTimeout(() => {
                    copySiteKeyBtn.textContent = '📋 Copy Site Key';
                }, 2000);
            });
        }

        const copyAllBtn = captureCard.querySelector('.copy-all-btn');
        if (copyAllBtn) {
            copyAllBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const jsonData = JSON.stringify(captureData, null, 2);
                await navigator.clipboard.writeText(jsonData);
                copyAllBtn.textContent = '✅ Copied!';
                setTimeout(() => {
                    copyAllBtn.textContent = '📄 Copy All Data';
                }, 2000);
            });
        }
    }

    /**
     * Clear all capture history
     */
    async clearCaptureHistory() {
        if (!confirm('Clear all captured data? This cannot be undone.')) {
            return;
        }

        try {
            await chrome.storage.local.remove(['scrapfly_advanced_history']);
            await this.renderCapturedDataSection();
        } catch (error) {
            console.error('Failed to clear capture history:', error);
        }
    }

    /**
     * Re-render just the capture history section
     */
    async renderCapturedDataSection() {
        const advancedContent = document.querySelector('#advancedContent');
        if (!advancedContent) return;

        // Check if capture history container already exists
        const existingHistory = advancedContent.querySelector('.capture-history-section');

        // Generate new capture history HTML
        const captureHistoryHtml = await this.renderCaptureHistoryHTML();

        if (existingHistory) {
            // Replace existing section
            if (captureHistoryHtml) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = captureHistoryHtml;
                const newSection = tempDiv.firstElementChild;
                existingHistory.replaceWith(newSection);
                this.setupCaptureHistoryListeners();
            } else {
                // No history to show, remove the section
                existingHistory.remove();
            }
        } else {
            // Add new section at the end of advanced content
            if (captureHistoryHtml) {
                advancedContent.insertAdjacentHTML('beforeend', captureHistoryHtml);
                this.setupCaptureHistoryListeners();
            }
        }
    }

    /**
     * Get relative time string
     * @param {number} timestamp - Unix timestamp
     * @returns {string} Relative time string
     */
    getTimeAgo(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ago`;
        if (hours > 0) return `${hours}h ago`;
        if (minutes > 0) return `${minutes}m ago`;
        return 'Just now';
    }

    /**
     * Get URL path without protocol and hostname
     * @param {string} url - Full URL
     * @returns {string} Path only
     */
    getUrlPath(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.pathname + urlObj.search;
        } catch {
            return '';
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ReCaptchaAdvanced;
} else if (typeof window !== 'undefined') {
    window.ReCaptchaAdvanced = ReCaptchaAdvanced;
}