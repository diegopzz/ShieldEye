class AkamaiAdvanced {
    constructor(detection, tabInfo) {
        this.detection = detection;
        this.tabInfo = tabInfo;
    }

    /**
     * Check for Akamai cookies on the current page
     */
    async checkCookies() {
        try {
            if (!this.tabInfo || !this.tabInfo.url) {
                throw new Error('Tab information not available');
            }

            const cookies = await chrome.cookies.getAll({ url: this.tabInfo.url });

            const akamaiCookies = {
                _abck: cookies.find(c => c.name === '_abck'),
                ak_bmsc: cookies.find(c => c.name === 'ak_bmsc'),
                bm_sz: cookies.find(c => c.name === 'bm_sz'),
                bm_sv: cookies.find(c => c.name === 'bm_sv'),
                bm_mi: cookies.find(c => c.name === 'bm_mi'),
                sbsd: cookies.find(c => c.name === 'sbsd'),
                sbsd_o: cookies.find(c => c.name === 'sbsd_o')
            };

            const foundCookies = Object.entries(akamaiCookies)
                .filter(([name, cookie]) => cookie)
                .map(([name, cookie]) => ({
                    name: name,
                    value: cookie.value,
                    domain: cookie.domain,
                    secure: cookie.secure,
                    httpOnly: cookie.httpOnly
                }));

            // Debug logs - show all cookies found
            console.log('[Akamai Debug] ========== CHECK COOKIES ==========');
            console.log('[Akamai Debug] 🌐 URL:', this.tabInfo.url);
            console.log('[Akamai Debug] 🍪 Cookies Found:', foundCookies.length + '/7');

            console.log('[Akamai Debug] Cookie Details:');
            if (akamaiCookies._abck) {
                const isEasyMode = akamaiCookies._abck.value.includes('~0~');
                console.log('[Akamai Debug]   ✅ _abck:', {
                    value: akamaiCookies._abck.value.substring(0, 100) + '...',
                    length: akamaiCookies._abck.value.length,
                    domain: akamaiCookies._abck.domain,
                    easyMode: isEasyMode
                });
            } else {
                console.log('[Akamai Debug]   ❌ _abck: NOT FOUND');
            }

            if (akamaiCookies.sbsd) {
                console.log('[Akamai Debug]   ✅ sbsd:', akamaiCookies.sbsd.value.substring(0, 50) + '...');
            } else {
                console.log('[Akamai Debug]   ❌ sbsd: NOT FOUND');
            }

            if (akamaiCookies.sbsd_o) {
                console.log('[Akamai Debug]   ✅ sbsd_o:', akamaiCookies.sbsd_o.value.substring(0, 50) + '...');
            } else {
                console.log('[Akamai Debug]   ❌ sbsd_o: NOT FOUND');
            }

            console.log('[Akamai Debug]   ' + (akamaiCookies.ak_bmsc ? '✅' : '❌') + ' ak_bmsc:', akamaiCookies.ak_bmsc ? 'FOUND' : 'NOT FOUND');
            console.log('[Akamai Debug]   ' + (akamaiCookies.bm_sz ? '✅' : '❌') + ' bm_sz:', akamaiCookies.bm_sz ? 'FOUND' : 'NOT FOUND');
            console.log('[Akamai Debug]   ' + (akamaiCookies.bm_sv ? '✅' : '❌') + ' bm_sv:', akamaiCookies.bm_sv ? 'FOUND' : 'NOT FOUND');
            console.log('[Akamai Debug]   ' + (akamaiCookies.bm_mi ? '✅' : '❌') + ' bm_mi:', akamaiCookies.bm_mi ? 'FOUND' : 'NOT FOUND');

            // Determine protection level
            const hasAbck = akamaiCookies._abck;
            const hasBmSz = akamaiCookies.bm_sz;
            const hasSbsd = akamaiCookies.sbsd || akamaiCookies.sbsd_o;
            let protectionLevel = 'None';
            if (hasAbck && hasBmSz && hasSbsd) {
                protectionLevel = 'Advanced (SBSD)';
            } else if (hasAbck && hasBmSz) {
                protectionLevel = 'Standard';
            } else if (hasAbck) {
                protectionLevel = 'Basic';
            }

            console.log('[Akamai Debug] 🛡️ Protection Level:', protectionLevel);
            console.log('[Akamai Debug] ========================================');

            this.displayCookiesModal(foundCookies, akamaiCookies);
        } catch (error) {
            console.error('Failed to check Akamai cookies:', error);
            NotificationHelper.error('Failed to check cookies: ' + error.message);
        }
    }

    /**
     * Display cookies in a modal
     */
    displayCookiesModal(foundCookies, allCookies) {
        const modal = document.createElement('div');
        modal.className = 'tool-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 10000; opacity: 0; transition: opacity 0.2s;';

        const hasAbck = allCookies._abck;
        const hasBmSz = allCookies.bm_sz;
        const hasSbsd = allCookies.sbsd || allCookies.sbsd_o;

        // Check _abck level
        const isEasyMode = hasAbck && allCookies._abck.value.includes('~0~');

        let protectionLevel = 'None';
        if (hasAbck && hasBmSz && hasSbsd) {
            protectionLevel = 'Advanced (SBSD)';
        } else if (hasAbck && hasBmSz) {
            protectionLevel = 'Standard';
        } else if (hasAbck) {
            protectionLevel = 'Basic';
        }

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 600px; max-height: 80vh; overflow-y: auto; width: 90%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">🍪 Akamai Cookies</h3>
                    <button class="modal-close" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-secondary); padding: 0; width: 24px; height: 24px;">×</button>
                </div>

                <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px; margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="color: var(--text-secondary); font-size: 13px;">Protection Level:</span>
                        <span style="color: var(--text-primary); font-weight: 500;">${protectionLevel}</span>
                    </div>
                    ${hasAbck ? `
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <span style="color: var(--text-secondary); font-size: 13px;">_abck level:</span>
                            <span style="color: ${isEasyMode ? 'var(--success)' : 'var(--text-primary)'}; font-weight: 500;">${isEasyMode ? 'Easy' : 'Standard'}</span>
                        </div>
                    ` : ''}
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: var(--text-secondary); font-size: 13px;">Cookies Found:</span>
                        <span style="color: var(--text-primary); font-weight: 500;">${foundCookies.length}/7</span>
                    </div>
                </div>

                ${foundCookies.length === 0 ? `
                    <div style="text-align: center; padding: 32px 16px; opacity: 0.7;">
                        <div style="font-size: 48px; margin-bottom: 12px;">🔍</div>
                        <div style="font-size: 14px;">No Akamai cookies found</div>
                    </div>
                ` : `
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        ${foundCookies.map(cookie => `
                            <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                    <div style="font-weight: 500; color: var(--text-primary); font-family: monospace;">${cookie.name}</div>
                                    <div style="display: flex; gap: 6px;">
                                        ${cookie.secure ? '<span style="font-size: 10px; background: var(--success); color: white; padding: 2px 6px; border-radius: 3px;">SECURE</span>' : ''}
                                        ${cookie.httpOnly ? '<span style="font-size: 10px; background: var(--bg-primary); color: var(--text-primary); padding: 2px 6px; border-radius: 3px;">HTTP</span>' : ''}
                                    </div>
                                </div>
                                <div style="font-size: 11px; color: var(--text-secondary); word-break: break-all; font-family: monospace; background: var(--bg-primary); padding: 8px; border-radius: 4px; margin-bottom: 6px;">${cookie.value.substring(0, 60)}${cookie.value.length > 60 ? '...' : ''}</div>
                                <div style="font-size: 11px; color: var(--text-muted);">Domain: ${cookie.domain}</div>
                            </div>
                        `).join('')}
                    </div>
                `}

                <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">
                    <button class="modal-close" style="width: 100%; padding: 10px; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 6px; color: var(--text-primary); cursor: pointer; font-size: 13px;">Close</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => modal.remove());
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        setTimeout(() => modal.style.opacity = '1', 10);
    }

    /**
     * Analyze page content for Akamai scripts and patterns
     */
    async analyzeContent() {
        try {
            if (!this.tabInfo || !this.tabInfo.id) {
                throw new Error('Tab information not available');
            }

            NotificationHelper.info('Reloading page to analyze Akamai data...');

            // Reload the page
            await chrome.tabs.reload(this.tabInfo.id);

            // Wait for page to load
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Get cookies
            const cookies = await chrome.cookies.getAll({ url: this.tabInfo.url });
            const abckCookie = cookies.find(c => c.name === '_abck');
            const sbsdCookie = cookies.find(c => c.name === 'sbsd');
            const sbsdOCookie = cookies.find(c => c.name === 'sbsd_o');
            const akBmscCookie = cookies.find(c => c.name === 'ak_bmsc');
            const bmSzCookie = cookies.find(c => c.name === 'bm_sz');

            // Analyze page content and parse scripts
            const results = await chrome.scripting.executeScript({
                target: { tabId: this.tabInfo.id },
                func: () => {
                    const htmlContent = document.documentElement.outerHTML;
                    const analysis = {
                        scripts: [],
                        sensorElements: [],
                        sensorDataUrls: [],
                        sbsdUrls: [],
                        patterns: {
                            bmak: false,
                            sensorData: false,
                            pixelChallenge: false,
                            abckVariable: false,
                            secCpt: false
                        },
                        scriptCount: 0,
                        requiresSecCpt: false,
                        requiresPixel: false,
                        akamaiScriptPath: null,
                        pixelHtmlVar: null,
                        pixelScriptUrls: null,
                        pixelScriptVar: null,
                        parsingCode: null
                    };

                    // Detect sec_cpt challenge
                    analysis.requiresSecCpt = htmlContent.includes('/sec_cpt/') || htmlContent.includes('cp_challenge');
                    if (analysis.requiresSecCpt) {
                        analysis.patterns.secCpt = true;
                    }

                    // Parse Akamai script path
                    const scriptMatch = /<script type="text\/javascript"\s*(?:nonce=".*?")?\s*src="([a-z\d/\-_]+)"><\/script>/i.exec(htmlContent);
                    if (scriptMatch && scriptMatch[1]) {
                        // Convert relative path to full URL
                        const scriptPath = scriptMatch[1];
                        const pageUrl = window.location.origin;
                        analysis.akamaiScriptPath = pageUrl + scriptPath;
                    }

                    // Parse pixel HTML variable
                    const pixelVarMatch = /bazadebezolkohpepadr="(\d+)"/.exec(htmlContent);
                    if (pixelVarMatch && pixelVarMatch[1]) {
                        analysis.requiresPixel = true;
                        analysis.patterns.pixelChallenge = true;
                        analysis.pixelHtmlVar = parseInt(pixelVarMatch[1]);
                    }

                    // Parse pixel script URL
                    const pixelUrlMatch = /src="(https?:\/\/.+\/akam\/\d+\/\w+)"/.exec(htmlContent);
                    if (pixelUrlMatch && pixelUrlMatch[1]) {
                        const scriptUrl = pixelUrlMatch[1];
                        const parts = scriptUrl.split("/");
                        parts[parts.length - 1] = "pixel_" + parts[parts.length - 1];
                        const postUrl = parts.join("/");
                        analysis.pixelScriptUrls = { scriptUrl, postUrl };
                    }

                    // Check all script tags
                    const scripts = Array.from(document.querySelectorAll('script'));
                    analysis.scriptCount = scripts.length;

                    scripts.forEach(script => {
                        const content = script.textContent;
                        const src = script.src;

                        // Check for Akamai patterns in script content
                        if (content) {
                            if (content.includes('bmak.')) {
                                analysis.patterns.bmak = true;
                            }
                            if (content.includes('sensor_data')) {
                                analysis.patterns.sensorData = true;
                            }
                            if (content.includes('bazadebezolkohpepadr')) {
                                analysis.patterns.pixelChallenge = true;
                            }
                            if (content.includes('_abck')) {
                                analysis.patterns.abckVariable = true;
                            }

                            // Parse pixel script variable
                            if (!analysis.pixelScriptVar) {
                                const indexMatch = /g=_\[(\d+)]/.exec(content);
                                if (indexMatch && indexMatch[1]) {
                                    const index = parseInt(indexMatch[1]);
                                    const arrayMatch = /var _=\[(.+?)];/.exec(content);
                                    if (arrayMatch && arrayMatch[1]) {
                                        const rawStrings = arrayMatch[1].match(/"[^"]*"/g);
                                        if (rawStrings && index < rawStrings.length) {
                                            analysis.pixelScriptVar = rawStrings[index].replace(/^"|"$/g, "");
                                        }
                                    }
                                }
                            }

                            // Store script info if it contains specific Akamai patterns (pixel, sensor, sbsd only)
                            const hasPixelPattern = content.includes('bazadebezolkohpepadr') || content.includes('pixel_') || /g=_\[\d+\]/.test(content);
                            const hasSensorPattern = content.includes('sensor_data') || content.includes('bmak.');
                            const hasSbsdPattern = content.includes('.well-known/sbsd') || content.includes('sbsd');

                            if (hasPixelPattern || hasSensorPattern || hasSbsdPattern) {
                                const scriptInfo = {
                                    type: 'inline',
                                    length: content.length,
                                    categories: []
                                };

                                if (hasPixelPattern) scriptInfo.categories.push('pixel');
                                if (hasSensorPattern) scriptInfo.categories.push('sensor');
                                if (hasSbsdPattern) scriptInfo.categories.push('sbsd');

                                analysis.scripts.push(scriptInfo);
                            }
                        }

                        // Check script sources for specific patterns only
                        if (src) {
                            const hasPixelUrl = src.includes('pixel_') || /\/akam\/\d+\/\w+/.test(src);
                            const hasSensorUrl = src.includes('sensor_data') || src.includes('/akam/');
                            const hasSbsdUrl = src.includes('.well-known/sbsd');

                            if (hasPixelUrl || hasSensorUrl || hasSbsdUrl) {
                                const scriptInfo = {
                                    type: 'external',
                                    src: src,
                                    categories: []
                                };

                                if (hasPixelUrl) scriptInfo.categories.push('pixel');
                                if (hasSensorUrl) scriptInfo.categories.push('sensor');
                                if (hasSbsdUrl) scriptInfo.categories.push('sbsd');

                                analysis.scripts.push(scriptInfo);
                            }
                        }

                        // Detect sensor_data URLs in script content
                        if (content) {
                            // Look for common Akamai endpoint patterns
                            const urlPatterns = [
                                /(?:https?:)?\/\/[^"'\s]+\/akam\/[^"'\s]+/g,
                                /(?:https?:)?\/\/[^"'\s]+akamai[^"'\s]+/g,
                                /['"]([^'"]*sensor_data[^'"]*)['"]/g,
                                /['"]([^'"]*\/pixel_[^'"]*)['"]/g
                            ];

                            urlPatterns.forEach(pattern => {
                                const matches = content.match(pattern);
                                if (matches) {
                                    matches.forEach(match => {
                                        const cleanUrl = match.replace(/['"]/g, '');
                                        if (!analysis.sensorDataUrls.includes(cleanUrl)) {
                                            analysis.sensorDataUrls.push(cleanUrl);
                                        }
                                    });
                                }
                            });
                        }
                    });

                    // Extract SBSD URLs from scripts with 'sbsd' category
                    analysis.scripts.forEach(script => {
                        if (script.categories && script.categories.includes('sbsd') && script.src) {
                            if (!analysis.sbsdUrls.includes(script.src)) {
                                analysis.sbsdUrls.push(script.src);
                            }
                        }
                    });

                    // Generate parsing code if sensor_data URLs found
                    if (analysis.sensorDataUrls.length > 0 || analysis.patterns.sensorData || analysis.akamaiScriptPath) {
                        const scriptPath = analysis.akamaiScriptPath || '/akam/example/path';
                        const sampleUrls = analysis.sensorDataUrls.length > 0 ? analysis.sensorDataUrls : ['https://example.com/akam/endpoint'];

                        analysis.parsingCodes = {
                            javascript: `// JavaScript - Browser Interceptor
// This code intercepts Akamai requests in the browser

// Method 1: Intercept Fetch API
const originalFetch = window.fetch;
window.fetch = function(...args) {
    const url = args[0];
    if (typeof url === 'string' && (url.includes('/akam/') || url.includes('sensor_data'))) {
        console.log('[Akamai] Intercepted fetch to:', url);

        return originalFetch.apply(this, args).then(response => {
            const clonedResponse = response.clone();
            clonedResponse.text().then(body => {
                console.log('[Akamai] Response body:', body);
                // Parse sensor_data from response
                if (body.includes('sensor_data')) {
                    const match = body.match(/sensor_data[=:]\\s*([a-zA-Z0-9+/=]+)/);
                    if (match) console.log('[Akamai] sensor_data:', match[1]);
                }
            });
            return response;
        });
    }
    return originalFetch.apply(this, args);
};

// Method 2: Extract Script Path from HTML
const scriptPath = '${scriptPath}';
console.log('[Akamai] Script path detected:', scriptPath);

// Method 3: Monitor XHR requests
const originalOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function(method, url, ...args) {
    if (url.includes('/akam/') || url.includes('sensor_data')) {
        console.log('[Akamai] XHR to:', url);
    }
    return originalOpen.apply(this, [method, url, ...args]);
};`,

                            python: `# Python - Web Scraping & HTTP Requests
import requests
import re
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse

def extract_akamai_data(url):
    """Extract Akamai script paths and sensor_data from a website"""

    # Get the page
    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    })

    response = session.get(url)
    html = response.text

    # Parse with BeautifulSoup
    soup = BeautifulSoup(html, 'html.parser')

    # Method 1: Extract Akamai script path
    script_pattern = r'<script type="text/javascript"(?:\\s*nonce="[^"]*")?\\s*src="([a-z\\d/\\-_]+)"></script>'
    script_match = re.search(script_pattern, html, re.IGNORECASE)
    if script_match:
        script_path = script_match.group(1)
        print(f'[Akamai] Script path: {script_path}')

    # Method 2: Find sensor_data URLs in scripts
    script_tags = soup.find_all('script')
    for script in script_tags:
        if script.string:
            # Look for Akamai endpoints
            url_patterns = [
                r'(?:https?:)?//[^"\'\\s]+/akam/[^"\'\\s]+',
                r'["\']([^"\']*sensor_data[^"\']*)["\']',
                r'["\']([^"\']*pixel_[^"\']*)["\']'
            ]

            for pattern in url_patterns:
                matches = re.findall(pattern, script.string)
                for match in matches:
                    print(f'[Akamai] Found URL: {match}')

    # Method 3: Monitor network requests (requires additional setup)
    # Use mitmproxy, selenium, or requests-html for dynamic content

    return {
        'script_path': script_match.group(1) if script_match else None,
        'found_urls': [${sampleUrls.map(url => `'${url}'`).join(', ')}]
    }

# Usage example
if __name__ == "__main__":
    url = "https://example.com"
    data = extract_akamai_data(url)
    print("Extracted data:", data)`,

                            nodejs: `// Node.js - Server-side parsing
const fetch = require('node-fetch');
const cheerio = require('cheerio');

async function extractAkamaiData(url) {
    try {
        // Fetch the page
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const html = await response.text();
        const $ = cheerio.load(html);

        // Method 1: Extract Akamai script path
        const scriptRegex = /<script type="text\\/javascript"(?:\\s*nonce="[^"]*")?\\s*src="([a-z\\d\\/\\-_]+)"><\\/script>/i;
        const scriptMatch = html.match(scriptRegex);

        if (scriptMatch) {
            console.log('[Akamai] Script path:', scriptMatch[1]);
        }

        // Method 2: Find URLs in script content
        const foundUrls = [];
        $('script').each((i, script) => {
            const content = $(script).html();
            if (content) {
                // Look for Akamai patterns
                const patterns = [
                    /(?:https?:)?\\/\\/[^"'\\s]+\\/akam\\/[^"'\\s]+/g,
                    /["']([^"']*sensor_data[^"']*)["']/g,
                    /["']([^"']*pixel_[^"']*)["']/g
                ];

                patterns.forEach(pattern => {
                    const matches = content.match(pattern);
                    if (matches) {
                        matches.forEach(match => {
                            const cleanUrl = match.replace(/["']/g, '');
                            if (!foundUrls.includes(cleanUrl)) {
                                foundUrls.push(cleanUrl);
                                console.log('[Akamai] Found URL:', cleanUrl);
                            }
                        });
                    }
                });
            }
        });

        return {
            scriptPath: scriptMatch ? scriptMatch[1] : null,
            foundUrls: foundUrls,
            detectedPath: '${scriptPath}'
        };

    } catch (error) {
        console.error('Error:', error);
        return null;
    }
}

// Usage
extractAkamaiData('https://example.com')
    .then(data => console.log('Result:', data));`,

                            php: `<?php
// PHP - Server-side Akamai detection

function extractAkamaiData($url) {
    // Initialize cURL
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);

    $html = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200) {
        echo "HTTP Error: $httpCode\\n";
        return null;
    }

    // Method 1: Extract Akamai script path
    $scriptPattern = '/<script type="text\\/javascript"(?:\\s*nonce="[^"]*")?\\s*src="([a-z\\d\\/\\-_]+)"><\\/script>/i';
    if (preg_match($scriptPattern, $html, $matches)) {
        echo "[Akamai] Script path: " . $matches[1] . "\\n";
        $scriptPath = $matches[1];
    } else {
        $scriptPath = null;
    }

    // Method 2: Find sensor_data URLs
    $foundUrls = [];
    $patterns = [
        '/(?:https?:)?\\/\\/[^"\'\\s]+\\/akam\\/[^"\'\\s]+/',
        '/["\']([^"\']*sensor_data[^"\']*)["\']/',
        '/["\']([^"\']*pixel_[^"\']*)["\']/'
    ];

    foreach ($patterns as $pattern) {
        if (preg_match_all($pattern, $html, $matches)) {
            foreach ($matches[0] as $match) {
                $cleanUrl = trim($match, '"\\'');
                if (!in_array($cleanUrl, $foundUrls)) {
                    $foundUrls[] = $cleanUrl;
                    echo "[Akamai] Found URL: $cleanUrl\\n";
                }
            }
        }
    }

    // Method 3: Parse with DOMDocument for more complex extraction
    $dom = new DOMDocument();
    @$dom->loadHTML($html);
    $xpath = new DOMXPath($dom);

    // Find script tags
    $scripts = $xpath->query('//script');
    foreach ($scripts as $script) {
        $content = $script->textContent;
        if (strpos($content, 'sensor_data') !== false || strpos($content, 'akam') !== false) {
            echo "[Akamai] Found Akamai content in script\\n";
        }
    }

    return [
        'script_path' => $scriptPath,
        'found_urls' => $foundUrls,
        'detected_path' => '${scriptPath}'
    ];
}

// Usage
$url = 'https://example.com';
$data = extractAkamaiData($url);
print_r($data);
?>`,

                            go: `package main

import (
    "fmt"
    "io"
    "net/http"
    "regexp"
    "strings"
)

func extractAkamaiData(url string) (map[string]interface{}, error) {
    // Create HTTP client
    client := &http.Client{}

    // Create request
    req, err := http.NewRequest("GET", url, nil)
    if err != nil {
        return nil, err
    }

    // Set User-Agent
    req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")

    // Make request
    resp, err := client.Do(req)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    // Read response
    body, err := io.ReadAll(resp.Body)
    if err != nil {
        return nil, err
    }

    html := string(body)

    // Method 1: Extract Akamai script path
    scriptRegex := regexp.MustCompile(\`<script type="text/javascript"(?:\\s*nonce="[^"]*")?\\s*src="([a-z\\d/\\-_]+)"></script>\`)
    scriptMatch := scriptRegex.FindStringSubmatch(html)

    var scriptPath string
    if len(scriptMatch) > 1 {
        scriptPath = scriptMatch[1]
        fmt.Printf("[Akamai] Script path: %s\\n", scriptPath)
    }

    // Method 2: Find sensor_data URLs
    var foundUrls []string
    patterns := []string{
        \`(?:https?:)?//[^"'\\s]+/akam/[^"'\\s]+\`,
        \`["']([^"']*sensor_data[^"']*)['"]\`,
        \`["']([^"']*pixel_[^"']*)['"]\`,
    }

    for _, pattern := range patterns {
        regex := regexp.MustCompile(pattern)
        matches := regex.FindAllString(html, -1)

        for _, match := range matches {
            cleanUrl := strings.Trim(match, "\\"'")
            // Check if URL already exists
            exists := false
            for _, existing := range foundUrls {
                if existing == cleanUrl {
                    exists = true
                    break
                }
            }
            if !exists {
                foundUrls = append(foundUrls, cleanUrl)
                fmt.Printf("[Akamai] Found URL: %s\\n", cleanUrl)
            }
        }
    }

    return map[string]interface{}{
        "script_path":   scriptPath,
        "found_urls":    foundUrls,
        "detected_path": "${scriptPath}",
    }, nil
}

func main() {
    url := "https://example.com"
    data, err := extractAkamaiData(url)
    if err != nil {
        fmt.Printf("Error: %v\\n", err)
        return
    }

    fmt.Printf("Result: %+v\\n", data)
}`,

                            csharp: `// C# - Akamai Script Parser
using System;
using System.Net.Http;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

public class AkamaiParser
{
    private static readonly HttpClient client = new HttpClient();

    public static async Task ParseAkamaiScripts(string url)
    {
        client.DefaultRequestHeaders.Clear();
        client.DefaultRequestHeaders.Add("User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");

        var content = await client.GetStringAsync(url);

        // Extract Akamai script path
        var scriptMatch = Regex.Match(content,
            @"<script type=""text/javascript""(?:\\s*nonce=""[^""]*"")?\\s*src=""([a-z\\d/\\-_]+)""></script>");
        if (scriptMatch.Success)
        {
            Console.WriteLine($"[Akamai] Script path: {scriptMatch.Groups[1].Value}");
        }

        // Extract Akamai URLs
        var urlMatches = Regex.Matches(content, @"(?:https?:)?//[^""'\\s]+/akam/[^""'\\s]+");
        foreach (Match match in urlMatches)
        {
            Console.WriteLine($"[Akamai] URL: {match.Value}");
        }

        // Find sensor_data patterns
        var sensorMatches = Regex.Matches(content, @"sensor_data[^""'\\s]*");
        foreach (Match match in sensorMatches)
        {
            Console.WriteLine($"[Akamai] Sensor: {match.Value}");
        }
    }

    public static async Task Main(string[] args)
    {
        await ParseAkamaiScripts("https://example.com");
    }
}`,

                            go: `// Go - Akamai Script Parser
package main

import (
    "fmt"
    "io/ioutil"
    "net/http"
    "regexp"
)

func parseAkamaiScripts(url string) error {
    client := &http.Client{}
    req, err := http.NewRequest("GET", url, nil)
    if err != nil {
        return err
    }

    req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")

    resp, err := client.Do(req)
    if err != nil {
        return err
    }
    defer resp.Body.Close()

    body, err := ioutil.ReadAll(resp.Body)
    if err != nil {
        return err
    }

    content := string(body)

    // Extract Akamai script path
    scriptRegex := regexp.MustCompile(\`<script type="text/javascript"(?:\\s*nonce="[^"]*")?\\s*src="([a-z\\d/\\-_]+)"></script>\`)
    if match := scriptRegex.FindStringSubmatch(content); len(match) > 1 {
        fmt.Printf("[Akamai] Script path: %s\\n", match[1])
    }

    // Extract Akamai URLs
    urlRegex := regexp.MustCompile(\`(?:https?:)?//[^"'\\s]+/akam/[^"'\\s]+\`)
    urlMatches := urlRegex.FindAllString(content, -1)
    for _, match := range urlMatches {
        fmt.Printf("[Akamai] URL: %s\\n", match)
    }

    // Find sensor_data patterns
    sensorRegex := regexp.MustCompile(\`sensor_data[^"'\\s]*\`)
    sensorMatches := sensorRegex.FindAllString(content, -1)
    for _, match := range sensorMatches {
        fmt.Printf("[Akamai] Sensor: %s\\n", match)
    }

    return nil
}

func main() {
    if err := parseAkamaiScripts("https://example.com"); err != nil {
        fmt.Printf("Error: %v\\n", err)
    }
}`
                        };
                    }

                    // Check for sensor elements
                    const sensorSelectors = ['#akam-sensor', '.bm-sensor-container', '[data-akamai]'];
                    sensorSelectors.forEach(selector => {
                        const elements = document.querySelectorAll(selector);
                        if (elements.length > 0) {
                            analysis.sensorElements.push({
                                selector: selector,
                                count: elements.length
                            });
                        }
                    });

                    return analysis;
                }
            });

            if (results && results[0] && results[0].result) {
                const analysis = results[0].result;

                // Add cookie data to analysis
                analysis.cookies = {
                    _abck: abckCookie,
                    sbsd: sbsdCookie,
                    sbsd_o: sbsdOCookie,
                    ak_bmsc: akBmscCookie,
                    bm_sz: bmSzCookie
                };

                // Check Easy Mode
                analysis.isEasyMode = abckCookie && abckCookie.value.includes('~0~');
                analysis.requiresSbsd = !!(sbsdCookie || sbsdOCookie);

                // Console log all captured data
                console.log('[Akamai Debug] ========== ANALYZE CONTENT - FULL DATA ==========');
                console.log('[Akamai Debug] 🍪 COOKIES:');
                console.log('[Akamai Debug]   _abck:', abckCookie ? {
                    value: abckCookie.value,
                    length: abckCookie.value.length,
                    domain: abckCookie.domain
                } : 'NOT FOUND');
                console.log('[Akamai Debug]   sbsd:', sbsdCookie ? sbsdCookie.value : 'NOT FOUND');
                console.log('[Akamai Debug]   sbsd_o:', sbsdOCookie ? sbsdOCookie.value : 'NOT FOUND');
                console.log('[Akamai Debug]   ak_bmsc:', akBmscCookie ? 'FOUND' : 'NOT FOUND');
                console.log('[Akamai Debug]   bm_sz:', bmSzCookie ? 'FOUND' : 'NOT FOUND');

                console.log('[Akamai Debug] 🎯 MODE DETECTION:');
                console.log('[Akamai Debug]   Easy Mode:', analysis.isEasyMode);
                console.log('[Akamai Debug]   SBSD Required:', analysis.requiresSbsd);
                console.log('[Akamai Debug]   sec_cpt Required:', analysis.requiresSecCpt);
                console.log('[Akamai Debug]   Pixel Challenge:', analysis.requiresPixel);

                console.log('[Akamai Debug] 🎨 PIXEL CHALLENGE DATA:');
                console.log('[Akamai Debug]   HTML Var (bazadebezolkohpepadr):', analysis.pixelHtmlVar || 'NOT FOUND');
                console.log('[Akamai Debug]   Script URL:', analysis.pixelScriptUrls?.scriptUrl || 'NOT FOUND');
                console.log('[Akamai Debug]   Post URL:', analysis.pixelScriptUrls?.postUrl || 'NOT FOUND');
                console.log('[Akamai Debug]   Script Var:', analysis.pixelScriptVar || 'NOT FOUND');

                console.log('[Akamai Debug] 📜 SCRIPTS:');
                console.log('[Akamai Debug]   Total Scripts:', analysis.scriptCount);
                console.log('[Akamai Debug]   Akamai Scripts:', analysis.scripts.length);
                console.log('[Akamai Debug]   Script Path:', analysis.akamaiScriptPath || 'NOT FOUND');

                console.log('[Akamai Debug] 🔍 DETECTED PATTERNS:');
                console.log('[Akamai Debug]   bmak API:', analysis.patterns.bmak);
                console.log('[Akamai Debug]   sensor_data:', analysis.patterns.sensorData);
                console.log('[Akamai Debug]   _abck variable:', analysis.patterns.abckVariable);
                console.log('[Akamai Debug]   Pixel in content:', analysis.patterns.pixelChallenge);
                console.log('[Akamai Debug]   sec_cpt in content:', analysis.patterns.secCpt);

                console.log('[Akamai Debug] 🎯 SENSOR ELEMENTS:', analysis.sensorElements.length > 0 ? analysis.sensorElements : 'NONE FOUND');

                console.log('[Akamai Debug] 🔗 SENSOR DATA URLS:');
                if (analysis.sensorDataUrls && analysis.sensorDataUrls.length > 0) {
                    analysis.sensorDataUrls.forEach((url, idx) => {
                        console.log(`[Akamai Debug]   ${idx + 1}. ${url}`);
                    });
                } else {
                    console.log('[Akamai Debug]   NONE FOUND');
                }

                if (analysis.parsingCodes) {
                    console.log('[Akamai Debug] 📝 MULTI-LANGUAGE PARSING CODE GENERATED');
                    console.log('[Akamai Debug] Available languages: JavaScript, Python, Node.js, PHP, C#, Go');
                    console.log('[Akamai Debug] JavaScript (Browser):');
                    console.log(analysis.parsingCodes.javascript);
                    console.log('[Akamai Debug] Python (Requests + BeautifulSoup):');
                    console.log(analysis.parsingCodes.python);
                }

                console.log('[Akamai Debug] ========================================');

                this.displayAnalysisModal(analysis);
            }
        } catch (error) {
            console.error('Failed to analyze content:', error);
            NotificationHelper.error('Failed to analyze content: ' + error.message);
        }
    }

    /**
     * Display content analysis in a modal
     */
    displayAnalysisModal(analysis) {
        const modal = document.createElement('div');
        modal.className = 'tool-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 10000; opacity: 0; transition: opacity 0.2s;';

        const detectedPatterns = Object.entries(analysis.patterns).filter(([key, value]) => value);
        const hasAkamaiCookies = analysis.cookies && (analysis.cookies._abck || analysis.cookies.ak_bmsc || analysis.cookies.bm_sz);

        // Determine mode/version
        let mode = 'Not Detected';
        let modeColor = 'var(--text-muted)';
        if (analysis.isEasyMode) {
            mode = 'Easy Mode (~0~)';
            modeColor = 'var(--success)';
        } else if (analysis.requiresPixel) {
            mode = 'Pixel Challenge';
            modeColor = 'var(--danger)';
        } else if (analysis.requiresSecCpt) {
            mode = 'sec_cpt Challenge';
            modeColor = 'var(--danger)';
        } else if (analysis.requiresSbsd) {
            mode = 'SBSD Challenge';
            modeColor = 'var(--danger)';
        } else if (hasAkamaiCookies) {
            mode = 'Standard';
            modeColor = 'var(--text-primary)';
        }

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 700px; max-height: 80vh; overflow-y: auto; width: 90%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">📊 Akamai Analysis</h3>
                    <button class="modal-close" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-secondary); padding: 0; width: 24px; height: 24px;">×</button>
                </div>

                <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px; margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="color: var(--text-secondary); font-size: 13px;">Total Scripts:</span>
                        <span style="color: var(--text-primary); font-weight: 500;">${analysis.scriptCount}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: var(--text-secondary); font-size: 13px;">Akamai Scripts:</span>
                        <span style="color: var(--text-primary); font-weight: 500;">${analysis.scripts.length + (analysis.sensorDataUrls?.length || 0) + (analysis.akamaiScriptPath ? 1 : 0)}</span>
                    </div>
                </div>



                ${(analysis.scripts.length > 0 || (analysis.sensorDataUrls && analysis.sensorDataUrls.length > 0) || detectedPatterns.length > 0 || hasAkamaiCookies) ? `
                    <h4 style="font-size: 13px; color: var(--text-secondary); margin: 16px 0 8px 0; text-transform: uppercase;">📜 Akamai Scripts</h4>
                    <div style="background: var(--bg-tertiary); padding: 16px; border-radius: 8px; margin-bottom: 16px;">
                        <!-- Header Section -->
                        <div style="display: flex; align-items: center; justify-content: flex-start; margin-bottom: 16px;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-size: 18px;">⚙️</span>
                                <div>
                                    <div style="color: var(--text-primary); font-size: 14px; font-weight: 600;">Script Analysis</div>
                                    <div style="color: var(--text-muted); font-size: 11px;">Found ${analysis.scripts.length + (analysis.sensorDataUrls?.length || 0) + (analysis.akamaiScriptPath ? 1 : 0)} relevant script(s)</div>
                                </div>
                            </div>
                        </div>


                        <!-- Challenge Details -->
                        ${(analysis.akamaiScriptPath || analysis.pixelHtmlVar || analysis.pixelScriptUrls || analysis.pixelScriptVar || (analysis.sbsdUrls && analysis.sbsdUrls.length > 0)) ? `
                            <div style="border-top: 1px solid var(--border); padding-top: 8px; margin-bottom: 16px;">
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                                    <span style="color: var(--text-secondary); font-size: 12px; font-weight: 500;">Sensor Data URL Script</span>
                                </div>
                                <div style="display: flex; flex-direction: column; gap: 8px;">
                                    ${analysis.akamaiScriptPath ? `
                                        <div style="background: var(--bg-primary); padding: 10px; border-radius: 6px; border-left: 3px solid var(--accent);">
                                            <div style="color: var(--text-secondary); font-size: 10px; margin-bottom: 4px;">Script URL:</div>
                                            <div style="font-family: monospace; color: var(--text-primary); font-size: 11px; background: var(--bg-tertiary); padding: 6px; border-radius: 4px; word-break: break-all;">
                                                ${analysis.akamaiScriptPath}
                                            </div>
                                        </div>
                                    ` : ''}

                                    ${analysis.pixelHtmlVar ? `
                                        <div style="background: var(--bg-primary); padding: 10px; border-radius: 6px; border-left: 3px solid var(--danger);">
                                            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                                                <span style="font-size: 12px;">🎨</span>
                                                <span style="color: var(--text-secondary); font-size: 10px;">Pixel HTML Variable:</span>
                                            </div>
                                            <div style="font-family: monospace; color: var(--text-primary); font-size: 11px; background: var(--bg-tertiary); padding: 6px; border-radius: 4px;">
                                                bazadebezolkohpepadr="${analysis.pixelHtmlVar}"
                                            </div>
                                        </div>
                                    ` : ''}

                                    ${analysis.pixelScriptUrls ? `
                                        <div style="background: var(--bg-primary); padding: 10px; border-radius: 6px; border-left: 3px solid var(--danger);">
                                            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
                                                <span style="font-size: 12px;">🎨</span>
                                                <span style="color: var(--text-secondary); font-size: 10px;">Pixel Challenge URLs:</span>
                                            </div>
                                            <div style="display: flex; flex-direction: column; gap: 4px;">
                                                <div>
                                                    <div style="color: var(--text-muted); font-size: 9px;">Script URL:</div>
                                                    <div style="font-family: monospace; color: var(--text-primary); font-size: 10px; background: var(--bg-tertiary); padding: 4px; border-radius: 3px; word-break: break-all;">
                                                        ${analysis.pixelScriptUrls.scriptUrl}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div style="color: var(--text-muted); font-size: 9px;">POST URL:</div>
                                                    <div style="font-family: monospace; color: var(--text-primary); font-size: 10px; background: var(--bg-tertiary); padding: 4px; border-radius: 3px; word-break: break-all;">
                                                        ${analysis.pixelScriptUrls.postUrl}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ` : ''}

                                    ${analysis.pixelScriptVar ? `
                                        <div style="background: var(--bg-primary); padding: 10px; border-radius: 6px; border-left: 3px solid var(--danger);">
                                            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                                                <span style="font-size: 12px;">🎨</span>
                                                <span style="color: var(--text-secondary); font-size: 10px;">Pixel Script Variable:</span>
                                            </div>
                                            <div style="font-family: monospace; color: var(--text-primary); font-size: 11px; background: var(--bg-tertiary); padding: 6px; border-radius: 4px; word-break: break-all;">
                                                ${analysis.pixelScriptVar}
                                            </div>
                                        </div>
                                    ` : ''}
                                </div>
                            </div>
                        ` : ''}

                        <!-- SBSD Script URLs -->
                        ${(analysis.sbsdUrls && analysis.sbsdUrls.length > 0) ? `
                            <div style="border-top: 1px solid var(--border); padding-top: 16px; margin-bottom: 16px;">
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                                    <span style="color: var(--text-secondary); font-size: 12px; font-weight: 500;">SBSD Script URL</span>
                                </div>
                                <div style="display: flex; flex-direction: column; gap: 8px;">
                                    ${analysis.sbsdUrls.map(url => `
                                        <div style="background: var(--bg-primary); padding: 10px; border-radius: 6px; border-left: 3px solid var(--accent);">
                                            <div style="color: var(--text-secondary); font-size: 10px; margin-bottom: 4px;">Script URL:</div>
                                            <div style="font-family: monospace; color: var(--text-primary); font-size: 11px; background: var(--bg-tertiary); padding: 6px; border-radius: 4px; word-break: break-all;">
                                                ${url}
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}

                    </div>
                ` : ''}


                ${analysis.sensorDataUrls && analysis.sensorDataUrls.length > 0 ? `
                    <h4 style="font-size: 13px; color: var(--text-secondary); margin: 16px 0 8px 0; text-transform: uppercase;">🔗 Sensor Data URLs</h4>
                    <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px;">
                        ${analysis.sensorDataUrls.map((url, idx) => `
                            <div style="background: var(--bg-tertiary); padding: 10px 12px; border-radius: 6px;">
                                <div style="display: flex; align-items: center; margin-bottom: 4px;">
                                    <span style="color: var(--text-secondary); font-size: 11px; margin-right: 8px;">${idx + 1}.</span>
                                    <span style="color: var(--text-primary); font-size: 12px; font-weight: 500;">Akamai Endpoint</span>
                                </div>
                                <div style="font-family: monospace; color: var(--text-muted); font-size: 11px; background: var(--bg-primary); padding: 6px; border-radius: 4px; word-break: break-all;">${url}</div>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}


                <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">
                    <button class="export-scripts-btn" style="width: 100%; padding: 12px; background: var(--accent); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; margin-bottom: 12px; display: flex; align-items: center; justify-content: center; gap: 8px;">
                        <span>📤</span>
                        Export Code
                    </button>
                    <button class="modal-close" style="width: 100%; padding: 10px; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 6px; color: var(--text-primary); cursor: pointer; font-size: 13px;">Close</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => modal.remove());
        });

        // Add language tab handlers
        const langTabs = modal.querySelectorAll('.lang-tab');
        const codeContainers = modal.querySelectorAll('.code-container');

        langTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetLang = tab.getAttribute('data-lang');

                // Update tab styles
                langTabs.forEach(t => {
                    t.style.background = 'var(--bg-secondary)';
                    t.style.color = 'var(--text-primary)';
                    t.classList.remove('active');
                });
                tab.style.background = 'var(--accent)';
                tab.style.color = 'white';
                tab.classList.add('active');

                // Show/hide code containers
                codeContainers.forEach(container => {
                    const containerLang = container.getAttribute('data-lang');
                    container.style.display = containerLang === targetLang ? 'block' : 'none';
                });
            });
        });

        // Add export scripts button handler
        const exportScriptsBtn = modal.querySelector('.export-scripts-btn');
        if (exportScriptsBtn) {
            exportScriptsBtn.addEventListener('click', () => {
                // Include both sensorDataUrls and akamaiScriptPath
                const allSensorUrls = [...(analysis.sensorDataUrls || [])];
                if (analysis.akamaiScriptPath && !allSensorUrls.includes(analysis.akamaiScriptPath)) {
                    allSensorUrls.push(analysis.akamaiScriptPath);
                }
                this.showScriptParsingModal(analysis.scripts, allSensorUrls);
            });
        }

        // Add copy code button handler
        const copyBtn = modal.querySelector('.copy-parsing-code');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                // Find the currently visible textarea
                const visibleContainer = modal.querySelector('.code-container[style*="display: block"]') || modal.querySelector('.code-container[data-lang="javascript"]');
                const textarea = visibleContainer?.querySelector('.parsing-code-area');

                if (textarea) {
                    textarea.select();
                    document.execCommand('copy');

                    // Show feedback
                    const originalText = copyBtn.textContent;
                    copyBtn.textContent = '✓ Copied!';
                    copyBtn.style.background = 'var(--success)';

                    setTimeout(() => {
                        copyBtn.textContent = originalText;
                        copyBtn.style.background = 'var(--accent)';
                    }, 2000);
                }
            });
        }

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        setTimeout(() => modal.style.opacity = '1', 10);
    }

    /**
     * Show script parsing code modal
     */
    showScriptParsingModal(scripts, sensorDataUrls = []) {
        const modal = document.createElement('div');
        modal.className = 'tool-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 10000; opacity: 0; transition: opacity 0.2s;';

        // Convert sensor data URLs to script-like objects for export
        const sensorUrlScripts = sensorDataUrls.map((url, index) => ({
            type: 'sensor-url',
            src: url,
            url: url,
            categories: ['sensor-url']
        }));

        const scriptCategories = {
            pixel: scripts.filter(s => s.categories.includes('pixel')),
            sensor: scripts.filter(s => s.categories.includes('sensor')),
            sbsd: scripts.filter(s => s.categories.includes('sbsd')),
            sensorUrl: sensorUrlScripts
        };

        const parsingCodes = this.generateScriptParsingCode(scriptCategories);

        modal.innerHTML = `
            <div style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 900px; max-height: 90vh; overflow: hidden; width: 95%; display: flex; flex-direction: column;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-shrink: 0;">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">📜 Script Parsing Code Generator</h3>
                    <button class="modal-close" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-secondary); padding: 0; width: 24px; height: 24px;">×</button>
                </div>

                <div style="background: var(--bg-tertiary); padding: 16px; border-radius: 8px; margin-bottom: 16px; flex-shrink: 0;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                        <div style="color: var(--text-primary); font-size: 14px; font-weight: 600;">Export Options</div>
                        <div style="display: flex; gap: 8px;">
                            <button class="export-type-btn active" data-type="all" style="background: var(--accent); color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 10px; cursor: pointer;">All Types</button>
                            ${scriptCategories.pixel.length > 0 ? '<button class="export-type-btn" data-type="pixel" style="background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border); padding: 4px 8px; border-radius: 4px; font-size: 10px; cursor: pointer;">Pixel</button>' : ''}
                            ${(scriptCategories.sensor.length > 0 || scriptCategories.sensorUrl.length > 0) ? '<button class="export-type-btn" data-type="sensor" style="background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border); padding: 4px 8px; border-radius: 4px; font-size: 10px; cursor: pointer;">Sensor</button>' : ''}
                            ${scriptCategories.sbsd.length > 0 ? '<button class="export-type-btn" data-type="sbsd" style="background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border); padding: 4px 8px; border-radius: 4px; font-size: 10px; cursor: pointer;">SBSD</button>' : ''}
                        </div>
                    </div>
                </div>

                <!-- Language Tabs -->
                <div style="display: flex; gap: 4px; margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 8px; flex-shrink: 0; flex-wrap: wrap;">
                    <button class="lang-tab active" data-lang="javascript" style="padding: 6px 12px; border: none; background: var(--accent); color: white; border-radius: 4px; cursor: pointer; font-size: 11px;">JavaScript</button>
                    <button class="lang-tab" data-lang="python" style="padding: 6px 12px; border: none; background: var(--bg-secondary); color: var(--text-primary); border-radius: 4px; cursor: pointer; font-size: 11px;">Python</button>
                    <button class="lang-tab" data-lang="nodejs" style="padding: 6px 12px; border: none; background: var(--bg-secondary); color: var(--text-primary); border-radius: 4px; cursor: pointer; font-size: 11px;">Node.js</button>
                    <button class="lang-tab" data-lang="php" style="padding: 6px 12px; border: none; background: var(--bg-secondary); color: var(--text-primary); border-radius: 4px; cursor: pointer; font-size: 11px;">PHP</button>
                    <button class="lang-tab" data-lang="csharp" style="padding: 6px 12px; border: none; background: var(--bg-secondary); color: var(--text-primary); border-radius: 4px; cursor: pointer; font-size: 11px;">C#</button>
                    <button class="lang-tab" data-lang="go" style="padding: 6px 12px; border: none; background: var(--bg-secondary); color: var(--text-primary); border-radius: 4px; cursor: pointer; font-size: 11px;">Go</button>
                </div>

                <!-- Code Areas -->
                <div style="position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column;">
                    <div class="code-container" data-lang="javascript" style="display: flex; flex-direction: column; height: 100%;">
                        <textarea readonly class="parsing-code-area" style="flex: 1; min-height: 250px; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border); border-radius: 4px; padding: 8px; font-family: monospace; font-size: 10px; resize: none; box-sizing: border-box;">${parsingCodes.javascript}</textarea>
                        <div style="margin-top: 6px; font-size: 10px; color: var(--text-muted); flex-shrink: 0;">🌐 Browser console code for intercepting and parsing Akamai scripts</div>
                    </div>

                    <div class="code-container" data-lang="python" style="display: none; flex-direction: column; height: 100%;">
                        <textarea readonly class="parsing-code-area" style="flex: 1; min-height: 250px; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border); border-radius: 4px; padding: 8px; font-family: monospace; font-size: 10px; resize: none; box-sizing: border-box;">${parsingCodes.python}</textarea>
                        <div style="margin-top: 6px; font-size: 10px; color: var(--text-muted); flex-shrink: 0;">🐍 Python script with requests and BeautifulSoup</div>
                    </div>

                    <div class="code-container" data-lang="nodejs" style="display: none; flex-direction: column; height: 100%;">
                        <textarea readonly class="parsing-code-area" style="flex: 1; min-height: 250px; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border); border-radius: 4px; padding: 8px; font-family: monospace; font-size: 10px; resize: none; box-sizing: border-box;">${parsingCodes.nodejs}</textarea>
                        <div style="margin-top: 6px; font-size: 10px; color: var(--text-muted); flex-shrink: 0;">📦 Node.js script with axios and cheerio</div>
                    </div>

                    <div class="code-container" data-lang="php" style="display: none; flex-direction: column; height: 100%;">
                        <textarea readonly class="parsing-code-area" style="flex: 1; min-height: 250px; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border); border-radius: 4px; padding: 8px; font-family: monospace; font-size: 10px; resize: none; box-sizing: border-box;">${parsingCodes.php}</textarea>
                        <div style="margin-top: 6px; font-size: 10px; color: var(--text-muted); flex-shrink: 0;">🐘 PHP script with cURL and DOMDocument</div>
                    </div>

                    <div class="code-container" data-lang="csharp" style="display: none; flex-direction: column; height: 100%;">
                        <textarea readonly class="parsing-code-area" style="flex: 1; min-height: 250px; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border); border-radius: 4px; padding: 8px; font-family: monospace; font-size: 10px; resize: none; box-sizing: border-box;">${parsingCodes.csharp}</textarea>
                        <div style="margin-top: 6px; font-size: 10px; color: var(--text-muted); flex-shrink: 0;">🔷 C# with HttpClient and HtmlAgilityPack</div>
                    </div>

                    <div class="code-container" data-lang="go" style="display: none; flex-direction: column; height: 100%;">
                        <textarea readonly class="parsing-code-area" style="flex: 1; min-height: 250px; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border); border-radius: 4px; padding: 8px; font-family: monospace; font-size: 10px; resize: none; box-sizing: border-box;">${parsingCodes.go}</textarea>
                        <div style="margin-top: 6px; font-size: 10px; color: var(--text-muted); flex-shrink: 0;">🐹 Go with net/http and goquery</div>
                    </div>

                    <!-- Copy Button -->
                    <button class="copy-parsing-code" style="position: absolute; top: 8px; right: 8px; background: var(--accent); color: white; border: none; padding: 6px 12px; border-radius: 4px; font-size: 11px; cursor: pointer; z-index: 10;">Copy Code</button>
                </div>

                <!-- Close Button -->
                <div style="text-align: center; margin-top: 16px; flex-shrink: 0;">
                    <button class="modal-close" style="width: 100%; padding: 10px; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 6px; color: var(--text-primary); cursor: pointer; font-size: 13px;">Close</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close handlers
        modal.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => modal.remove());
        });

        // Export type button handlers
        const exportTypeBtns = modal.querySelectorAll('.export-type-btn');
        let currentExportType = 'all';

        const updateCodeForExportType = (exportType) => {
            let filteredCategories = {};

            if (exportType === 'all') {
                filteredCategories = scriptCategories;
            } else {
                filteredCategories = {
                    pixel: exportType === 'pixel' ? scriptCategories.pixel : [],
                    sensor: exportType === 'sensor' ? scriptCategories.sensor : [],
                    sensorUrl: exportType === 'sensor' ? scriptCategories.sensorUrl : [],
                    sbsd: exportType === 'sbsd' ? scriptCategories.sbsd : []
                };
            }

            const newParsingCodes = this.generateScriptParsingCode(filteredCategories);

            // Update all textareas
            const textareas = modal.querySelectorAll('.parsing-code-area');
            textareas.forEach(textarea => {
                const container = textarea.closest('.code-container');
                const lang = container.dataset.lang;
                if (newParsingCodes[lang]) {
                    textarea.value = newParsingCodes[lang];
                }
            });
        };

        exportTypeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const exportType = btn.dataset.type;
                currentExportType = exportType;

                // Update active export type button
                exportTypeBtns.forEach(b => {
                    b.style.background = 'var(--bg-secondary)';
                    b.style.color = 'var(--text-primary)';
                    b.style.border = '1px solid var(--border)';
                    b.classList.remove('active');
                });
                btn.style.background = 'var(--accent)';
                btn.style.color = 'white';
                btn.style.border = 'none';
                btn.classList.add('active');

                // Update code based on export type
                updateCodeForExportType(exportType);
            });
        });

        // Language tab handlers
        const langTabs = modal.querySelectorAll('.lang-tab');
        const codeContainers = modal.querySelectorAll('.code-container');

        langTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const lang = tab.dataset.lang;

                // Update active tab
                langTabs.forEach(t => {
                    t.style.background = 'var(--bg-secondary)';
                    t.style.color = 'var(--text-primary)';
                    t.classList.remove('active');
                });
                tab.style.background = 'var(--accent)';
                tab.style.color = 'white';
                tab.classList.add('active');

                // Show corresponding code container
                codeContainers.forEach(container => {
                    container.style.display = container.dataset.lang === lang ? 'flex' : 'none';
                });
            });
        });

        // Copy button handler
        const copyBtn = modal.querySelector('.copy-parsing-code');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                const visibleContainer = modal.querySelector('.code-container[style*="display: block"]') || modal.querySelector('.code-container[data-lang="javascript"]');
                const textarea = visibleContainer?.querySelector('.parsing-code-area');

                if (textarea) {
                    textarea.select();
                    document.execCommand('copy');

                    const originalText = copyBtn.textContent;
                    copyBtn.textContent = '✓ Copied!';
                    copyBtn.style.background = 'var(--success)';

                    setTimeout(() => {
                        copyBtn.textContent = originalText;
                        copyBtn.style.background = 'var(--accent)';
                    }, 2000);
                }
            });
        }

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        setTimeout(() => modal.style.opacity = '1', 10);
    }

    /**
     * Generate parsing code for specific script types
     */
    generateScriptParsingCode(scriptCategories) {
        const hasPixel = scriptCategories.pixel.length > 0;
        const hasSensor = scriptCategories.sensor.length > 0;
        const hasSensorUrl = scriptCategories.sensorUrl.length > 0;
        const hasSbsd = scriptCategories.sbsd.length > 0;

        return {
            javascript: `// Akamai Script Parser - JavaScript
// Parse ${hasPixel ? 'Pixel Challenge, ' : ''}${hasSensor ? 'Sensor Data, ' : ''}${hasSensorUrl ? 'Sensor URLs, ' : ''}${hasSbsd ? 'SBSD Challenge' : ''} scripts

function parseAkamaiScripts() {
    const results = {
        pixel: {},
        sensor: {},
        sensorUrl: {},
        sbsd: {}
    };

    // Get all script elements
    const scripts = document.querySelectorAll('script');

    scripts.forEach((script, index) => {
        const content = script.textContent || script.innerHTML;
        const src = script.src;

        console.log(\`[Script \${index + 1}] Source: \${src || 'inline'}\`);

        ${hasPixel ? `
        // Parse Pixel Challenge data
        if (content.includes('bazadebezolkohpepadr') || content.includes('pixel_')) {
            // Extract pixel HTML variable
            const pixelVar = content.match(/bazadebezolkohpepadr="(\\d+)"/);
            if (pixelVar) results.pixel.htmlVar = parseInt(pixelVar[1]);

            // Extract pixel script variable using provided TypeScript parsers
            const indexMatch = content.match(/g=_\\[(\\d+)\\]/);
            if (indexMatch) {
                const index = parseInt(indexMatch[1]);
                const arrayMatch = content.match(/var _=\\[([^\\]]+)\\]/);
                if (arrayMatch) {
                    const strings = arrayMatch[1].match(/"[^"]*"/g);
                    if (strings && index < strings.length) {
                        results.pixel.scriptVar = strings[index].replace(/^"|"$/g, "");
                    }
                }
            }

            // Extract pixel script URL
            const urlMatch = content.match(/src="(https?:\\/\\/.+\\/akam\\/\\d+\\/\\w+)"/);
            if (urlMatch) {
                results.pixel.scriptUrl = urlMatch[1];
                const parts = urlMatch[1].split("/");
                parts[parts.length - 1] = "pixel_" + parts[parts.length - 1];
                results.pixel.postUrl = parts.join("/");
            }

            console.log('[Pixel Challenge]', results.pixel);
        }` : ''}

        ${hasSensor ? `
        // Parse Sensor Data
        if (content.includes('sensor_data') || content.includes('bmak.')) {
            // Extract sensor_data from various patterns
            const patterns = [
                /"sensor_data"\\s*:\\s*"([^"]+)"/,
                /sensor_data\\s*=\\s*["']([^"']+)["']/,
                /sensor_data["'\\s:=]+["']?([a-zA-Z0-9+/=]+)["']?/
            ];

            patterns.forEach((pattern, i) => {
                const match = content.match(pattern);
                if (match && match[1]) {
                    results.sensor[\`pattern_\${i + 1}\`] = match[1];
                    console.log(\`[Sensor Data Pattern \${i + 1}]\`, match[1].substring(0, 50) + '...');
                }
            });

            // Extract bmak API calls
            if (content.includes('bmak.')) {
                const bmakCalls = content.match(/bmak\\.[a-zA-Z_]+/g);
                if (bmakCalls) results.sensor.bmakCalls = [...new Set(bmakCalls)];
            }
        }` : ''}

        ${hasSensorUrl ? `
        // Parse Sensor Data URLs
        const sensorUrls = [${scriptCategories.sensorUrl.map(script => `'${script.url}'`).join(', ')}];

        sensorUrls.forEach((url, index) => {
            console.log(\`[Sensor URL \${index + 1}]\`, url);

            // Extract domain and path information
            try {
                const urlObj = new URL(url);
                results.sensorUrl[\`url_\${index + 1}\`] = {
                    full: url,
                    domain: urlObj.hostname,
                    path: urlObj.pathname,
                    searchParams: urlObj.searchParams.toString()
                };

                // Try to fetch endpoint info (if same origin)
                if (urlObj.hostname === window.location.hostname) {
                    fetch(url, { method: 'HEAD' })
                        .then(response => {
                            console.log(\`[Sensor URL \${index + 1} Response]\`, response.status, response.statusText);
                        })
                        .catch(err => console.log(\`[Sensor URL \${index + 1} Error]\`, err.message));
                }
            } catch (e) {
                console.log(\`[Sensor URL \${index + 1} Parse Error]\`, e.message);
                results.sensorUrl[\`url_\${index + 1}\`] = { full: url, error: e.message };
            }
        });` : ''}

        ${hasSbsd ? `
        // Parse SBSD Challenge
        if (content.includes('.well-known/sbsd') || content.includes('sbsd')) {
            // Extract SBSD URLs
            const sbsdUrls = content.match(/\\.well-known\\/sbsd[^"'\\s]*/g);
            if (sbsdUrls) {
                results.sbsd.urls = [...new Set(sbsdUrls)];
                console.log('[SBSD URLs]', results.sbsd.urls);
            }

            // Extract SBSD version parameter
            const versionMatch = content.match(/\\.well-known\\/sbsd\\?v=([^"'&\\s]+)/);
            if (versionMatch) {
                results.sbsd.version = versionMatch[1];
                console.log('[SBSD Version]', results.sbsd.version);
            }
        }` : ''}
    });

    return results;
}

// Run the parser
const akamaiData = parseAkamaiScripts();
console.log('=== Akamai Parsing Results ===', akamaiData);`,

            python: `# Akamai Script Parser - Python
import requests
import re
from bs4 import BeautifulSoup
import json

def parse_akamai_scripts(url):
    """Parse ${hasPixel ? 'Pixel Challenge, ' : ''}${hasSensor ? 'Sensor Data, ' : ''}${hasSbsd ? 'SBSD Challenge' : ''} from Akamai scripts"""

    results = {
        'pixel': {},
        'sensor': {},
        'sbsd': {}
    }

    # Fetch the page
    response = requests.get(url, headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    })

    soup = BeautifulSoup(response.text, 'html.parser')
    scripts = soup.find_all('script')

    for i, script in enumerate(scripts):
        content = script.string or ''
        src = script.get('src', '')

        print(f"[Script {i + 1}] Source: {src or 'inline'}")

        ${hasPixel ? `
        # Parse Pixel Challenge data
        if 'bazadebezolkohpepadr' in content or 'pixel_' in content:
            # Extract pixel HTML variable
            pixel_var = re.search(r'bazadebezolkohpepadr="(\\d+)"', content)
            if pixel_var:
                results['pixel']['html_var'] = int(pixel_var.group(1))

            # Extract pixel script variable
            index_match = re.search(r'g=_\\[(\\d+)\\]', content)
            if index_match:
                index = int(index_match.group(1))
                array_match = re.search(r'var _=\\[([^\\]]+)\\]', content)
                if array_match:
                    strings = re.findall(r'"[^"]*"', array_match.group(1))
                    if index < len(strings):
                        results['pixel']['script_var'] = strings[index].strip('"')

            # Extract pixel script URL
            url_match = re.search(r'src="(https?://.+/akam/\\d+/\\w+)"', content)
            if url_match:
                script_url = url_match.group(1)
                results['pixel']['script_url'] = script_url
                parts = script_url.split("/")
                parts[-1] = "pixel_" + parts[-1]
                results['pixel']['post_url'] = "/".join(parts)

            print(f"[Pixel Challenge] {results['pixel']}")` : ''}

        ${hasSensor ? `
        # Parse Sensor Data
        if 'sensor_data' in content or 'bmak.' in content:
            # Extract sensor_data patterns
            patterns = [
                r'"sensor_data"\\s*:\\s*"([^"]+)"',
                r'sensor_data\\s*=\\s*["\']([^"\']+)["\']',
                r'sensor_data["\\'\\s:=]+["\']?([a-zA-Z0-9+/=]+)["\']?'
            ]

            for j, pattern in enumerate(patterns):
                match = re.search(pattern, content)
                if match:
                    results['sensor'][f'pattern_{j + 1}'] = match.group(1)
                    print(f"[Sensor Data Pattern {j + 1}] {match.group(1)[:50]}...")

            # Extract bmak API calls
            if 'bmak.' in content:
                bmak_calls = re.findall(r'bmak\\.[a-zA-Z_]+', content)
                if bmak_calls:
                    results['sensor']['bmak_calls'] = list(set(bmak_calls))` : ''}

        ${hasSbsd ? `
        # Parse SBSD Challenge
        if '.well-known/sbsd' in content or 'sbsd' in content:
            # Extract SBSD URLs
            sbsd_urls = re.findall(r'\\.well-known/sbsd[^"\'\\s]*', content)
            if sbsd_urls:
                results['sbsd']['urls'] = list(set(sbsd_urls))
                print(f"[SBSD URLs] {results['sbsd']['urls']}")

            # Extract SBSD version
            version_match = re.search(r'\\.well-known/sbsd\\?v=([^"\'&\\s]+)', content)
            if version_match:
                results['sbsd']['version'] = version_match.group(1)
                print(f"[SBSD Version] {results['sbsd']['version']}")` : ''}

    return results

# Usage
url = "https://example.com"
akamai_data = parse_akamai_scripts(url)
print("=== Akamai Parsing Results ===")
print(json.dumps(akamai_data, indent=2))`,

            nodejs: `// Akamai Script Parser - Node.js
const axios = require('axios');
const cheerio = require('cheerio');

async function parseAkamaiScripts(url) {
    const results = {
        pixel: {},
        sensor: {},
        sbsd: {}
    };

    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const $ = cheerio.load(response.data);
        const scripts = $('script');

        scripts.each((index, element) => {
            const content = $(element).html() || '';
            const src = $(element).attr('src') || '';

            console.log(\`[Script \${index + 1}] Source: \${src || 'inline'}\`);

            ${hasPixel ? `
            // Parse Pixel Challenge data
            if (content.includes('bazadebezolkohpepadr') || content.includes('pixel_')) {
                // Extract pixel HTML variable
                const pixelVar = content.match(/bazadebezolkohpepadr="(\\d+)"/);
                if (pixelVar) results.pixel.htmlVar = parseInt(pixelVar[1]);

                // Extract pixel script variable
                const indexMatch = content.match(/g=_\\[(\\d+)\\]/);
                if (indexMatch) {
                    const index = parseInt(indexMatch[1]);
                    const arrayMatch = content.match(/var _=\\[([^\\]]+)\\]/);
                    if (arrayMatch) {
                        const strings = arrayMatch[1].match(/"[^"]*"/g);
                        if (strings && index < strings.length) {
                            results.pixel.scriptVar = strings[index].replace(/^"|"$/g, "");
                        }
                    }
                }

                // Extract pixel script URL
                const urlMatch = content.match(/src="(https?:\\/\\/.+\\/akam\\/\\d+\\/\\w+)"/);
                if (urlMatch) {
                    results.pixel.scriptUrl = urlMatch[1];
                    const parts = urlMatch[1].split("/");
                    parts[parts.length - 1] = "pixel_" + parts[parts.length - 1];
                    results.pixel.postUrl = parts.join("/");
                }

                console.log('[Pixel Challenge]', results.pixel);
            }` : ''}

            ${hasSensor ? `
            // Parse Sensor Data
            if (content.includes('sensor_data') || content.includes('bmak.')) {
                // Extract sensor_data patterns
                const patterns = [
                    /"sensor_data"\\s*:\\s*"([^"]+)"/,
                    /sensor_data\\s*=\\s*["']([^"']+)["']/,
                    /sensor_data["'\\s:=]+["']?([a-zA-Z0-9+/=]+)["']?/
                ];

                patterns.forEach((pattern, i) => {
                    const match = content.match(pattern);
                    if (match && match[1]) {
                        results.sensor[\`pattern_\${i + 1}\`] = match[1];
                        console.log(\`[Sensor Data Pattern \${i + 1}]\`, match[1].substring(0, 50) + '...');
                    }
                });

                // Extract bmak API calls
                if (content.includes('bmak.')) {
                    const bmakCalls = content.match(/bmak\\.[a-zA-Z_]+/g);
                    if (bmakCalls) results.sensor.bmakCalls = [...new Set(bmakCalls)];
                }
            }` : ''}

            ${hasSbsd ? `
            // Parse SBSD Challenge
            if (content.includes('.well-known/sbsd') || content.includes('sbsd')) {
                // Extract SBSD URLs
                const sbsdUrls = content.match(/\\.well-known\\/sbsd[^"'\\s]*/g);
                if (sbsdUrls) {
                    results.sbsd.urls = [...new Set(sbsdUrls)];
                    console.log('[SBSD URLs]', results.sbsd.urls);
                }

                // Extract SBSD version
                const versionMatch = content.match(/\\.well-known\\/sbsd\\?v=([^"'&\\s]+)/);
                if (versionMatch) {
                    results.sbsd.version = versionMatch[1];
                    console.log('[SBSD Version]', results.sbsd.version);
                }
            }` : ''}
        });

    } catch (error) {
        console.error('Error parsing scripts:', error);
    }

    return results;
}

// Usage
(async () => {
    const url = "https://example.com";
    const akamaiData = await parseAkamaiScripts(url);
    console.log('=== Akamai Parsing Results ===');
    console.log(JSON.stringify(akamaiData, null, 2));
})();`,

            php: `<?php
// Akamai Script Parser - PHP

function parseAkamaiScripts($url) {
    $results = [
        'pixel' => [],
        'sensor' => [],
        'sbsd' => []
    ];

    // Fetch the page
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);

    $html = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200) {
        echo "HTTP Error: $httpCode\\n";
        return $results;
    }

    // Parse HTML
    $dom = new DOMDocument();
    libxml_use_internal_errors(true);
    $dom->loadHTML($html);
    libxml_clear_errors();

    $xpath = new DOMXPath($dom);
    $scripts = $xpath->query('//script');

    foreach ($scripts as $index => $script) {
        $content = $script->textContent;
        $src = $script->getAttribute('src');

        echo "[Script " . ($index + 1) . "] Source: " . ($src ?: 'inline') . "\\n";

        ${hasPixel ? `
        // Parse Pixel Challenge data
        if (strpos($content, 'bazadebezolkohpepadr') !== false || strpos($content, 'pixel_') !== false) {
            // Extract pixel HTML variable
            if (preg_match('/bazadebezolkohpepadr="(\\d+)"/', $content, $matches)) {
                $results['pixel']['html_var'] = intval($matches[1]);
            }

            // Extract pixel script variable
            if (preg_match('/g=_\\[(\\d+)\\]/', $content, $indexMatch)) {
                $index = intval($indexMatch[1]);
                if (preg_match('/var _=\\[([^\\]]+)\\]/', $content, $arrayMatch)) {
                    preg_match_all('/"[^"]*"/', $arrayMatch[1], $strings);
                    if (isset($strings[0][$index])) {
                        $results['pixel']['script_var'] = trim($strings[0][$index], '"');
                    }
                }
            }

            // Extract pixel script URL
            if (preg_match('/src="(https?:\\/\\/.+\\/akam\\/\\d+\\/\\w+)"/', $content, $urlMatch)) {
                $scriptUrl = $urlMatch[1];
                $results['pixel']['script_url'] = $scriptUrl;
                $parts = explode("/", $scriptUrl);
                $parts[count($parts) - 1] = "pixel_" . $parts[count($parts) - 1];
                $results['pixel']['post_url'] = implode("/", $parts);
            }

            echo "[Pixel Challenge] " . json_encode($results['pixel']) . "\\n";
        }` : ''}

        ${hasSensor ? `
        // Parse Sensor Data
        if (strpos($content, 'sensor_data') !== false || strpos($content, 'bmak.') !== false) {
            // Extract sensor_data patterns
            $patterns = [
                '/"sensor_data"\\s*:\\s*"([^"]+)"/',
                '/sensor_data\\s*=\\s*["\']([^"\']+)["\']/',
                '/sensor_data["\\'\\s:=]+["\']?([a-zA-Z0-9+\/=]+)["\']?/'
            ];

            foreach ($patterns as $i => $pattern) {
                if (preg_match($pattern, $content, $match)) {
                    $results['sensor']["pattern_" . ($i + 1)] = $match[1];
                    echo "[Sensor Data Pattern " . ($i + 1) . "] " . substr($match[1], 0, 50) . "...\\n";
                }
            }

            // Extract bmak API calls
            if (strpos($content, 'bmak.') !== false) {
                preg_match_all('/bmak\\.[a-zA-Z_]+/', $content, $bmakCalls);
                if (!empty($bmakCalls[0])) {
                    $results['sensor']['bmak_calls'] = array_unique($bmakCalls[0]);
                }
            }
        }` : ''}

        ${hasSbsd ? `
        // Parse SBSD Challenge
        if (strpos($content, '.well-known/sbsd') !== false || strpos($content, 'sbsd') !== false) {
            // Extract SBSD URLs
            preg_match_all('/\\.well-known\\/sbsd[^"\'\\s]*/', $content, $sbsdUrls);
            if (!empty($sbsdUrls[0])) {
                $results['sbsd']['urls'] = array_unique($sbsdUrls[0]);
                echo "[SBSD URLs] " . json_encode($results['sbsd']['urls']) . "\\n";
            }

            // Extract SBSD version
            if (preg_match('/\\.well-known\\/sbsd\\?v=([^"\'&\\s]+)/', $content, $versionMatch)) {
                $results['sbsd']['version'] = $versionMatch[1];
                echo "[SBSD Version] " . $results['sbsd']['version'] . "\\n";
            }
        }` : ''}
    }

    return $results;
}

// Usage
$url = "https://example.com";
$akamaiData = parseAkamaiScripts($url);
echo "=== Akamai Parsing Results ===\\n";
echo json_encode($akamaiData, JSON_PRETTY_PRINT) . "\\n";
?>`,

            csharp: `// C# - Akamai Script Parser
using System;
using System.Net.Http;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using HtmlAgilityPack;

public class AkamaiParser
{
    private static readonly HttpClient client = new HttpClient();

    static AkamaiParser()
    {
        client.DefaultRequestHeaders.Add("User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
    }

    public static async Task ParseAkamaiScripts(string url)
    {
        try
        {
            var response = await client.GetStringAsync(url);
            var doc = new HtmlDocument();
            doc.LoadHtml(response);

            var scripts = doc.DocumentNode.SelectNodes("//script");
            if (scripts == null) return;

            var results = new {
                pixel = new { },
                sensor = new { },
                sbsd = new { }
            };

            for (int i = 0; i < scripts.Count; i++)
            {
                var script = scripts[i];
                var content = script.InnerText ?? "";
                var src = script.GetAttributeValue("src", "");

                Console.WriteLine($"[Script {i + 1}] Source: {(string.IsNullOrEmpty(src) ? "inline" : src)}");

                ${hasPixel ? `
                // Parse Pixel Challenge data
                if (content.Contains("bazadebezolkohpepadr") || content.Contains("pixel_"))
                {
                    var pixelVar = Regex.Match(content, @"bazadebezolkohpepadr=""(\\d+)""");
                    if (pixelVar.Success)
                    {
                        Console.WriteLine($"[Pixel HTML Var] {pixelVar.Groups[1].Value}");
                    }
                }` : ''}

                ${hasSensor ? `
                // Parse Sensor Data
                if (content.Contains("sensor_data") || content.Contains("bmak."))
                {
                    var patterns = new[] {
                        @"""sensor_data""\\s*:\\s*""([^""]+)""",
                        @"sensor_data\\s*=\\s*[""']([^""']+)[""']"
                    };

                    foreach (var pattern in patterns)
                    {
                        var match = Regex.Match(content, pattern);
                        if (match.Success)
                        {
                            Console.WriteLine($"[Sensor Data] {match.Groups[1].Value.Substring(0, Math.Min(50, match.Groups[1].Value.Length))}...");
                        }
                    }
                }` : ''}

                ${hasSbsd ? `
                // Parse SBSD Challenge
                if (content.Contains(".well-known/sbsd") || content.Contains("sbsd"))
                {
                    var sbsdUrls = Regex.Matches(content, @"\\.well-known/sbsd[^""'\\s]*");
                    foreach (Match match in sbsdUrls)
                    {
                        Console.WriteLine($"[SBSD URL] {match.Value}");
                    }
                }` : ''}
            }

            Console.WriteLine("=== C# Parsing Complete ===");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error: {ex.Message}");
        }
    }

    static async Task Main(string[] args)
    {
        await ParseAkamaiScripts("https://example.com");
    }
}`,

            go: `// Go - Akamai Script Parser
package main

import (
    "fmt"
    "io/ioutil"
    "net/http"
    "regexp"
    "strings"

    "github.com/PuerkitoBio/goquery"
)

func parseAkamaiScripts(url string) error {
    client := &http.Client{}
    req, err := http.NewRequest("GET", url, nil)
    if err != nil {
        return err
    }

    req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")

    resp, err := client.Do(req)
    if err != nil {
        return err
    }
    defer resp.Body.Close()

    doc, err := goquery.NewDocumentFromReader(resp.Body)
    if err != nil {
        return err
    }

    results := map[string]interface{}{
        "pixel": map[string]interface{}{},
        "sensor": map[string]interface{}{},
        "sbsd": map[string]interface{}{},
    }

    doc.Find("script").Each(func(i int, s *goquery.Selection) {
        content := s.Text()
        src, _ := s.Attr("src")

        if src == "" {
            src = "inline"
        }

        fmt.Printf("[Script %d] Source: %s\\n", i+1, src)

        ${hasPixel ? `
        // Parse Pixel Challenge data
        if strings.Contains(content, "bazadebezolkohpepadr") || strings.Contains(content, "pixel_") {
            re := regexp.MustCompile(\`bazadebezolkohpepadr="(\\d+)"\`)
            matches := re.FindStringSubmatch(content)
            if len(matches) > 1 {
                fmt.Printf("[Pixel HTML Var] %s\\n", matches[1])
            }
        }` : ''}

        ${hasSensor ? `
        // Parse Sensor Data
        if strings.Contains(content, "sensor_data") || strings.Contains(content, "bmak.") {
            patterns := []string{
                \`"sensor_data"\\s*:\\s*"([^"]+)"\`,
                \`sensor_data\\s*=\\s*["']([^"']+)["']\`,
            }

            for _, pattern := range patterns {
                re := regexp.MustCompile(pattern)
                matches := re.FindStringSubmatch(content)
                if len(matches) > 1 {
                    preview := matches[1]
                    if len(preview) > 50 {
                        preview = preview[:50] + "..."
                    }
                    fmt.Printf("[Sensor Data] %s\\n", preview)
                }
            }
        }` : ''}

        ${hasSbsd ? `
        // Parse SBSD Challenge
        if strings.Contains(content, ".well-known/sbsd") || strings.Contains(content, "sbsd") {
            re := regexp.MustCompile(\`\\.well-known/sbsd[^"'\\s]*\`)
            matches := re.FindAllString(content, -1)
            for _, match := range matches {
                fmt.Printf("[SBSD URL] %s\\n", match)
            }
        }` : ''}
    })

    fmt.Println("=== Go Parsing Complete ===")
    _ = results // Use results to avoid unused variable warning
    return nil
}

func main() {
    if err := parseAkamaiScripts("https://example.com"); err != nil {
        fmt.Printf("Error: %v\\n", err)
    }
}`,

        };
    }

    /**
     * Check capture state
     */
    async checkCaptureState() {
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'AKAMAI_GET_CAPTURE_STATE',
                tabId: this.tabInfo.id
            });
            if (response && response.isCapturing) {
                this.updateButtonState(true);
            }
        } catch (error) {
            console.error('Error checking capture state:', error);
        }
    }

    /**
     * Update button state
     */
    updateButtonState(isCapturing) {
        const btn = document.querySelector('#akamaiStartCapture');
        if (!btn) return;

        const icon = btn.querySelector('.tool-btn-icon');
        const label = btn.querySelector('.tool-btn-label');

        if (isCapturing) {
            icon.textContent = '⏹️';
            label.textContent = 'Stop Capturing';
            btn.style.background = 'var(--danger)';
        } else {
            icon.textContent = '🎬';
            label.textContent = 'Start Capturing';
            btn.style.background = '';
        }
    }

    /**
     * Start capturing Akamai data
     */
    async startCapturing() {
        try {
            if (!this.tabInfo || !this.tabInfo.id) {
                throw new Error('Tab information not available');
            }

            // First check for Akamai cookies to ensure Akamai is present
            console.log('[Akamai] Checking for Akamai cookies before starting capture...');
            const cookies = await chrome.cookies.getAll({ url: this.tabInfo.url });

            // Check for _abck cookie (primary Akamai indicator)
            const abckCookie = cookies.find(c => c.name === '_abck');
            const bmSzCookie = cookies.find(c => c.name === 'bm_sz');
            const akBmscCookie = cookies.find(c => c.name === 'ak_bmsc');

            // Must have at least _abck to proceed
            if (!abckCookie) {
                console.log('[Akamai] No _abck cookie found - Akamai not detected on this page');

                // Show error notification
                NotificationHelper.error('No Akamai detected on this page. The _abck cookie is not present.');

                // Show in-page notification as well
                await chrome.scripting.executeScript({
                    target: { tabId: this.tabInfo.id },
                    func: () => {
                        // Remove existing notifications
                        const existing = document.getElementById('akamai-capture-notification');
                        if (existing) existing.remove();

                        const notif = document.createElement('div');
                        notif.id = 'akamai-capture-notification';
                        notif.style.cssText = `
                            position: fixed;
                            top: 20px;
                            right: 20px;
                            background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%);
                            color: white;
                            padding: 20px 24px;
                            border-radius: 12px;
                            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
                            z-index: 999999;
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                            min-width: 320px;
                            animation: slideIn 0.3s ease-out;
                        `;

                        const styleTag = document.createElement('style');
                        styleTag.textContent = `
                            @keyframes slideIn { from { transform: translateX(400px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
                            @keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(400px); opacity: 0; } }
                        `;
                        document.head.appendChild(styleTag);

                        notif.innerHTML = `
                            <div style="font-weight: 600; font-size: 16px; margin-bottom: 8px;">
                                ❌ No Akamai Detected
                            </div>
                            <div style="opacity: 0.9; font-size: 14px;">
                                The _abck cookie is not present on this page.
                            </div>
                            <div style="opacity: 0.8; font-size: 12px; margin-top: 8px;">
                                Akamai Bot Manager is not active here.
                            </div>
                        `;

                        document.body.appendChild(notif);

                        // Auto-remove after 5 seconds
                        setTimeout(() => {
                            notif.style.animation = 'slideOut 0.3s ease-in';
                            setTimeout(() => notif.remove(), 300);
                        }, 5000);
                    }
                });

                return; // Exit early - no Akamai to capture
            }

            // Log detected cookies
            console.log('[Akamai] ✅ Akamai cookies detected:', {
                _abck: !!abckCookie,
                bm_sz: !!bmSzCookie,
                ak_bmsc: !!akBmscCookie,
                abckLength: abckCookie?.value?.length || 0
            });

            // Delete the _abck cookie to force sensor_data regeneration
            console.log('[Akamai] Deleting _abck cookie to force sensor_data regeneration...');
            try {
                await chrome.cookies.remove({
                    url: this.tabInfo.url,
                    name: '_abck'
                });
                console.log('[Akamai] ✅ _abck cookie deleted successfully');
            } catch (err) {
                console.log('[Akamai] ⚠️ Could not delete _abck cookie:', err);
            }

            // Check if already capturing
            const stateResponse = await chrome.runtime.sendMessage({
                type: 'AKAMAI_GET_CAPTURE_STATE',
                tabId: this.tabInfo.id
            });

            if (stateResponse && stateResponse.isCapturing) {
                await this.stopCapturing();
                return;
            }

            // Start capture in background
            const startResponse = await chrome.runtime.sendMessage({
                type: 'AKAMAI_START_CAPTURE',
                tabId: this.tabInfo.id
            });

            if (startResponse && startResponse.status === 'started') {
                this.updateButtonState(true);

                // Show notification in page with clear reload instruction
                await chrome.scripting.executeScript({
                    target: { tabId: this.tabInfo.id },
                    func: () => {
                        // Remove existing notifications
                        const existing = document.getElementById('akamai-capture-notification');
                        if (existing) existing.remove();

                        const notif = document.createElement('div');
                        notif.id = 'akamai-capture-notification';
                        notif.style.cssText = `
                            position: fixed;
                            top: 20px;
                            right: 20px;
                            background: linear-gradient(135deg, #FF6B35 0%, #F7931E 100%);
                            color: white;
                            padding: 20px 24px;
                            border-radius: 12px;
                            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
                            z-index: 999999;
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                            min-width: 320px;
                            animation: slideIn 0.3s ease-out;
                        `;

                        const styleTag = document.createElement('style');
                        styleTag.textContent = `
                            @keyframes slideIn { from { transform: translateX(400px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
                            @keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(400px); opacity: 0; } }
                        `;
                        document.head.appendChild(styleTag);

                        notif.innerHTML = `
                            <style>
                                @keyframes slideIn {
                                    from { transform: translateX(400px); opacity: 0; }
                                    to { transform: translateX(0); opacity: 1; }
                                }
                            </style>
                            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                                <div style="font-size: 32px;">🎬</div>
                                <div>
                                    <div style="font-weight: 600; font-size: 16px; margin-bottom: 4px;">Akamai Capture Active</div>
                                    <div style="font-size: 14px; opacity: 0.95; color: #FFE4B5;">⚠️ Please reload the page now!</div>
                                </div>
                            </div>
                            <div style="background: rgba(0,0,0,0.2); padding: 8px; border-radius: 6px; margin-top: 8px;">
                                <div style="font-size: 12px; margin-bottom: 4px;">Monitoring for:</div>
                                <div style="font-size: 11px; opacity: 0.9;">• sensor_data POST requests</div>
                                <div style="font-size: 11px; opacity: 0.9;">• SBSD endpoints (.well-known/sbsd)</div>
                                <div style="font-size: 11px; opacity: 0.9;">• SEC_CPT challenges (/sec_cpt/)</div>
                            </div>
                            <div id="capture-timer" style="font-size: 12px; opacity: 0.8; margin-top: 8px; text-align: center;">
                                ⏱️ Auto-stop in <span id="countdown">60</span> seconds
                            </div>
                        `;

                        document.body.appendChild(notif);

                        // Add countdown timer
                        let seconds = 60;
                        const countdownInterval = setInterval(() => {
                            seconds--;
                            const countdownEl = document.getElementById('countdown');
                            if (countdownEl) {
                                countdownEl.textContent = seconds;
                            }
                            if (seconds <= 0) {
                                clearInterval(countdownInterval);
                                if (notif && notif.parentNode) {
                                    notif.remove();
                                }
                            }
                        }, 1000);

                        // Store interval ID for cleanup
                        window.akamaiCaptureCountdown = countdownInterval;
                    }
                });

                NotificationHelper.info('Akamai capture started - reload the page!');
            }
        } catch (error) {
            console.error('Failed to start capturing:', error);
            NotificationHelper.error('Failed to start capturing: ' + error.message);
        }
    }

    /**
     * Stop capturing
     */
    async stopCapturing() {
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'AKAMAI_STOP_CAPTURE',
                tabId: this.tabInfo.id
            });

            this.updateButtonState(false);

            // Remove notification
            await chrome.scripting.executeScript({
                target: { tabId: this.tabInfo.id },
                func: () => {
                    const notif = document.getElementById('akamai-capture-notification');
                    if (notif) notif.remove();
                }
            }).catch(() => {});

            if (response && response.results && response.results.sensorData) {
                // Capture completed successfully
                await this.processCapturedData(response.results);
                NotificationHelper.success('Akamai data captured successfully!');
            } else {
                NotificationHelper.info('Capture stopped');
            }
        } catch (error) {
            console.error('Failed to stop capturing:', error);
            NotificationHelper.error('Failed to stop capturing: ' + error.message);
        }
    }

    /**
     * Parse pixel HTML variable
     */
    parsePixelHtmlVar(src) {
        const result = /bazadebezolkohpepadr="(\d+)"/.exec(src);
        if (result == null || result.length < 2) {
            return null;
        }
        return parseInt(result[1]);
    }

    /**
     * Parse pixel script URL
     */
    parsePixelScriptUrl(src) {
        const result = /src="(https?:\/\/.+\/akam\/\d+\/\w+)"/.exec(src);
        if (result == null || result.length < 2) {
            return null;
        }

        const scriptUrl = result[1];

        // Create post URL
        const parts = scriptUrl.split("/");
        parts[parts.length - 1] = "pixel_" + parts[parts.length - 1];
        const postUrl = parts.join("/");

        return {
            scriptUrl: scriptUrl,
            postUrl: postUrl
        };
    }

    /**
     * Parse pixel script variable
     */
    parsePixelScriptVar(src) {
        const indexResult = /g=_\[(\d+)]/.exec(src);
        if (indexResult == null || indexResult.length < 2) {
            return null;
        }
        const index = parseInt(indexResult[1]);

        const arrayDeclaration = /var _=\[(.+?)];/.exec(src);
        if (arrayDeclaration == null || arrayDeclaration.length < 2) {
            return null;
        }

        const rawStrings = arrayDeclaration[1].match(/"[^"]*"/g);
        if (rawStrings == null || index >= rawStrings.length) {
            return null;
        }

        // Remove leading and trailing quotes
        return rawStrings[index].replace(/^"|"$/g, "");
    }

    /**
     * Process captured data and save to history
     */
    async processCapturedData(interceptedData) {
        try {
            // Get cookies and page info
            const cookies = await chrome.cookies.getAll({ url: this.tabInfo.url });
            const abckCookie = cookies.find(c => c.name === '_abck');
            const sbsdCookie = cookies.find(c => c.name === 'sbsd');
            const sbsdOCookie = cookies.find(c => c.name === 'sbsd_o');

            if (!abckCookie) {
                NotificationHelper.error('No _abck cookie found');
                return;
            }

            // Check modes
            const isEasyMode = abckCookie.value.includes('~0~');
            const requiresSbsd = !!(sbsdCookie || sbsdOCookie);

            // Get page info and pixel challenge data
            const pageInfo = await chrome.scripting.executeScript({
                target: { tabId: this.tabInfo.id },
                func: () => {
                    const htmlContent = document.documentElement.outerHTML;
                    const requiresSecCpt = htmlContent.includes('/sec_cpt/') || htmlContent.includes('cp_challenge');

                    // Parse Akamai script path
                    let akamaiScriptPath = null;
                    const scriptMatch = /<script type="text\/javascript"\s*(?:nonce=".*?")?\s*src="([a-z\d/\-_]+)"><\/script>/i.exec(htmlContent);
                    if (scriptMatch && scriptMatch[1]) {
                        akamaiScriptPath = scriptMatch[1];
                    }

                    // Check for Pixel challenge
                    let requiresPixel = false;
                    let pixelHtmlVar = null;
                    let pixelScriptUrls = null;
                    let pixelScriptVar = null;

                    // Check for pixel HTML variable
                    const pixelVarMatch = /bazadebezolkohpepadr="(\d+)"/.exec(htmlContent);
                    if (pixelVarMatch && pixelVarMatch[1]) {
                        requiresPixel = true;
                        pixelHtmlVar = parseInt(pixelVarMatch[1]);
                    }

                    // Parse pixel script URL
                    const pixelUrlMatch = /src="(https?:\/\/.+\/akam\/\d+\/\w+)"/.exec(htmlContent);
                    if (pixelUrlMatch && pixelUrlMatch[1]) {
                        const scriptUrl = pixelUrlMatch[1];
                        const parts = scriptUrl.split("/");
                        parts[parts.length - 1] = "pixel_" + parts[parts.length - 1];
                        const postUrl = parts.join("/");
                        pixelScriptUrls = { scriptUrl, postUrl };
                    }

                    // Parse pixel script variable from script content
                    const scripts = Array.from(document.querySelectorAll('script'));
                    for (const script of scripts) {
                        const content = script.textContent;
                        if (!content) continue;

                        // Look for pixel script pattern
                        const indexMatch = /g=_\[(\d+)]/.exec(content);
                        if (indexMatch && indexMatch[1]) {
                            const index = parseInt(indexMatch[1]);
                            const arrayMatch = /var _=\[(.+?)];/.exec(content);
                            if (arrayMatch && arrayMatch[1]) {
                                const rawStrings = arrayMatch[1].match(/"[^"]*"/g);
                                if (rawStrings && index < rawStrings.length) {
                                    pixelScriptVar = rawStrings[index].replace(/^"|"$/g, "");
                                    break;
                                }
                            }
                        }
                    }

                    return {
                        requiresSecCpt,
                        akamaiScriptPath,
                        requiresPixel,
                        pixelHtmlVar,
                        pixelScriptUrls,
                        pixelScriptVar
                    };
                }
            });

            const pageData = pageInfo?.[0]?.result || {
                requiresSecCpt: false,
                akamaiScriptPath: null,
                requiresPixel: false,
                pixelHtmlVar: null,
                pixelScriptUrls: null,
                pixelScriptVar: null
            };

            // Determine version/mode
            let version = 'Standard';
            if (isEasyMode) {
                version = 'Easy Mode';
            } else if (pageData.requiresPixel) {
                version = 'Pixel Challenge';
            } else if (pageData.requiresSecCpt) {
                version = 'sec_cpt';
            } else if (requiresSbsd) {
                version = 'SBSD';
            }

            // Create capture data in reCAPTCHA-like format
            const captureData = {
                type: 'akamai',
                siteKey: abckCookie.value.substring(0, 100) + (abckCookie.value.length > 100 ? '...' : ''),
                abckFullLength: abckCookie.value.length,
                version: version,
                isEasyMode: isEasyMode,
                requiresSbsd: requiresSbsd,
                requiresSecCpt: pageData.requiresSecCpt,
                requiresPixel: pageData.requiresPixel,
                akamaiScriptPath: pageData.akamaiScriptPath,
                sensorData: interceptedData.sensorData,
                sensorEndpoint: interceptedData.endpoint,
                sbsdCookie: sbsdCookie ? sbsdCookie.value.substring(0, 50) : null,
                sbsdOCookie: sbsdOCookie ? sbsdOCookie.value.substring(0, 50) : null,
                pixelHtmlVar: pageData.pixelHtmlVar,
                pixelScriptUrl: pageData.pixelScriptUrls?.scriptUrl || null,
                pixelPostUrl: pageData.pixelScriptUrls?.postUrl || null,
                pixelScriptVar: pageData.pixelScriptVar,
                siteUrl: this.tabInfo.url
            };

            // Save to unified history (same storage as reCAPTCHA)
            await this.saveCaptureToHistory(captureData);

            // Refresh display
            if (this.renderCapturedDataSection) {
                await this.renderCapturedDataSection();
            }
        } catch (error) {
            console.error('Failed to process captured data:', error);
            NotificationHelper.error('Failed to process data: ' + error.message);
        }
    }


    /**
     * Save capture to history (unified storage with reCAPTCHA)
     */
    async saveCaptureToHistory(captureData) {
        // Note: History saving is handled by the background.js AKAMAI_CAPTURE_COMPLETED handler
        // We don't save here to avoid duplicates
        console.log('[Akamai] Capture data processed, history will be saved by background handler');
    }

    /**
     * Extract Sensor Information - Delete cookies and capture raw sensor data
     */
    async extractSensorInformation() {
        console.log('[AKAMAI-EXTRACT] ========== STARTING EXTRACTION ==========');
        try {
            console.log('[AKAMAI-EXTRACT] Step 1: Getting current tab...');

            // Get current tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) {
                console.error('[AKAMAI-EXTRACT] ❌ No active tab found');
                throw new Error('No active tab found');
            }

            console.log('[AKAMAI-EXTRACT] ✓ Tab found:', { id: tab.id, url: tab.url, title: tab.title });

            // Delete Akamai-related cookies to force regeneration
            console.log('[AKAMAI-EXTRACT] Step 2: Deleting Akamai cookies...');
            const cookiesToDelete = ['_abck', 'sbsd', 'sbsd_o', 'ak_bmsc', 'bm_sz', 'bm_sv', 'bm_mi'];
            let deletedCount = 0;

            for (const cookieName of cookiesToDelete) {
                try {
                    await chrome.cookies.remove({
                        url: tab.url,
                        name: cookieName
                    });
                    console.log(`[AKAMAI-EXTRACT] ✓ Deleted cookie: ${cookieName}`);
                    deletedCount++;
                } catch (err) {
                    console.log(`[AKAMAI-EXTRACT] ⚠️ Could not delete cookie ${cookieName}:`, err.message);
                }
            }
            console.log(`[AKAMAI-EXTRACT] Deleted ${deletedCount}/${cookiesToDelete.length} cookies`);

            // Store extraction mode flag
            console.log('[AKAMAI-EXTRACT] Step 3: Setting up extraction mode...');
            this.isExtracting = true;

            // Set up listener for extraction result
            console.log('[AKAMAI-EXTRACT] Step 4: Adding listener for extraction result...');
            const extractionListener = (message) => {
                console.log('[AKAMAI-EXTRACT] Received message:', message.type);
                if (message.type === 'AKAMAI_EXTRACTION_RESULT') {
                    console.log('[AKAMAI-EXTRACT] ✅ EXTRACTION RESULT RECEIVED!');
                    console.log('[AKAMAI-EXTRACT] Extracted data:', message.extractedData);

                    // Display the sensor data
                    console.log('[AKAMAI-EXTRACT] Step: Displaying sensor data modal...');
                    this.displaySensorDataModal(message.extractedData);

                    // Clean up
                    console.log('[AKAMAI-EXTRACT] Step: Cleaning up...');
                    this.isExtracting = false;
                    chrome.runtime.onMessage.removeListener(extractionListener);
                    console.log('[AKAMAI-EXTRACT] ========== EXTRACTION COMPLETE ==========');
                }
            };

            chrome.runtime.onMessage.addListener(extractionListener);
            console.log('[AKAMAI-EXTRACT] ✓ Listener added');

            // Send message to start extraction mode
            console.log('[AKAMAI-EXTRACT] Step 5: Sending message to background to start extraction...');
            const response = await chrome.runtime.sendMessage({
                type: 'AKAMAI_EXTRACT_SENSOR',
                tabId: tab.id
            });
            console.log('[AKAMAI-EXTRACT] Background response:', response);

            if (response && response.status === 'success') {
                console.log('[AKAMAI-EXTRACT] ✓ Extraction mode enabled successfully');
                console.log('[AKAMAI-EXTRACT] Step 6: Preparing to reload page...');

                // Show notification in page
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => {
                        // Remove existing notifications
                        const existing = document.getElementById('akamai-extract-notification');
                        if (existing) existing.remove();

                        const notif = document.createElement('div');
                        notif.id = 'akamai-extract-notification';
                        notif.style.cssText = `
                            position: fixed;
                            top: 20px;
                            right: 20px;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            color: white;
                            padding: 20px 24px;
                            border-radius: 12px;
                            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
                            z-index: 999999;
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                            min-width: 320px;
                            animation: slideIn 0.3s ease-out;
                        `;

                        const styleTag = document.createElement('style');
                        styleTag.textContent = `
                            @keyframes slideIn { from { transform: translateX(400px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
                        `;
                        document.head.appendChild(styleTag);

                        notif.innerHTML = `
                            <div style="font-weight: 600; font-size: 16px; margin-bottom: 8px;">
                                📊 Extracting Sensor Information
                            </div>
                            <div style="opacity: 0.9; font-size: 14px;">
                                Page will reload to capture sensor data...
                            </div>
                        `;

                        document.body.appendChild(notif);

                        // Auto-remove after 3 seconds
                        setTimeout(() => {
                            if (notif && notif.parentNode) {
                                notif.remove();
                            }
                        }, 3000);
                    }
                });

                // Wait a bit for notification to show, then reload
                console.log('[AKAMAI-EXTRACT] Step 7: Waiting 500ms before reload...');
                setTimeout(async () => {
                    console.log('[AKAMAI-EXTRACT] Step 8: Reloading tab...');
                    await chrome.tabs.reload(tab.id);
                    console.log('[AKAMAI-EXTRACT] ✓ Tab reload initiated');
                }, 500);

                NotificationHelper.info('Extracting sensor information...');
                console.log('[AKAMAI-EXTRACT] ✓ Notification shown');
                console.log('[AKAMAI-EXTRACT] Waiting for sensor data capture...');
            } else {
                console.error('[AKAMAI-EXTRACT] ❌ Failed response from background:', response);
                throw new Error('Failed to start extraction mode');
            }
        } catch (error) {
            console.error('[AKAMAI-EXTRACT] ❌ ERROR:', error);
            console.error('[AKAMAI-EXTRACT] Stack trace:', error.stack);
            NotificationHelper.error('Failed to extract sensor information: ' + error.message);
            this.isExtracting = false;
            console.log('[AKAMAI-EXTRACT] ========== EXTRACTION FAILED ==========');
        }
    }

    /**
     * Display extracted sensor data in a modal
     */
    displaySensorDataModal(data) {
        const modal = document.createElement('div');
        modal.className = 'tool-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 10000; opacity: 0; transition: opacity 0.2s;';

        // Extract data values
        const sensorData = data?.sensorData || '';
        const sbsdData = data?.sbsdData || '';
        const sensorScriptUrl = data?.sensorScriptUrl || '';
        const sbsdScriptUrl = data?.sbsdScriptUrl || '';

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 900px; max-height: 90vh; overflow-y: auto; width: 95%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3 style="margin: 0; font-size: 18px; color: var(--text-primary);">📊 Extracted Sensor Information</h3>
                    <button class="modal-close" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-secondary); padding: 0; width: 24px; height: 24px;">×</button>
                </div>

                <!-- Sensor Data Input -->
                <div style="margin-bottom: 20px;">
                    <label style="display: block; color: var(--text-secondary); font-size: 12px; margin-bottom: 8px; text-transform: uppercase; font-weight: 600;">
                        Sensor Data ${sensorData ? `(${sensorData.length} chars)` : '(Not captured)'}
                    </label>
                    <div style="position: relative;">
                        <textarea
                            id="sensorDataInput"
                            readonly
                            style="width: 100%; min-height: 120px; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 6px; padding: 10px; color: var(--text-primary); font-family: monospace; font-size: 12px; resize: vertical; cursor: text;"
                            placeholder="No sensor data captured"
                        >${sensorData}</textarea>
                        ${sensorData ? `
                        <button
                            class="copy-sensor-btn"
                            style="position: absolute; top: 10px; right: 10px; background: var(--primary); color: white; border: none; border-radius: 4px; padding: 6px 12px; font-size: 11px; cursor: pointer;"
                            data-copy="sensorDataInput"
                        >Copy</button>` : ''}
                    </div>
                </div>

                ${sbsdData ? `
                <!-- SBSD Data Input -->
                <div style="margin-bottom: 20px;">
                    <label style="display: block; color: var(--text-secondary); font-size: 12px; margin-bottom: 8px; text-transform: uppercase; font-weight: 600;">
                        SBSD Data (${sbsdData.length} chars)
                    </label>
                    <div style="position: relative;">
                        <textarea
                            id="sbsdDataInput"
                            readonly
                            style="width: 100%; min-height: 80px; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 6px; padding: 10px; color: var(--text-primary); font-family: monospace; font-size: 12px; resize: vertical; cursor: text;"
                        >${sbsdData}</textarea>
                        <button
                            class="copy-sbsd-btn"
                            style="position: absolute; top: 10px; right: 10px; background: var(--primary); color: white; border: none; border-radius: 4px; padding: 6px 12px; font-size: 11px; cursor: pointer;"
                            data-copy="sbsdDataInput"
                        >Copy</button>
                    </div>
                </div>
                ` : ''}

                ${sensorScriptUrl ? `
                <!-- Sensor Script URL Input -->
                <div style="margin-bottom: 20px;">
                    <label style="display: block; color: var(--text-secondary); font-size: 12px; margin-bottom: 8px; text-transform: uppercase; font-weight: 600;">
                        Sensor Script URL
                    </label>
                    <div style="position: relative;">
                        <input
                            id="sensorScriptUrlInput"
                            type="text"
                            readonly
                            value="${sensorScriptUrl}"
                            style="width: 100%; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 6px; padding: 10px; color: var(--text-primary); font-family: monospace; font-size: 12px; cursor: text;"
                        />
                        <button
                            class="copy-sensor-url-btn"
                            style="position: absolute; top: 50%; right: 10px; transform: translateY(-50%); background: var(--primary); color: white; border: none; border-radius: 4px; padding: 6px 12px; font-size: 11px; cursor: pointer;"
                            data-copy="sensorScriptUrlInput"
                        >Copy</button>
                    </div>
                </div>
                ` : ''}

                ${sbsdScriptUrl ? `
                <!-- SBSD Script URL Input -->
                <div style="margin-bottom: 20px;">
                    <label style="display: block; color: var(--text-secondary); font-size: 12px; margin-bottom: 8px; text-transform: uppercase; font-weight: 600;">
                        SBSD Script URL
                    </label>
                    <div style="position: relative;">
                        <input
                            id="sbsdScriptUrlInput"
                            type="text"
                            readonly
                            value="${sbsdScriptUrl}"
                            style="width: 100%; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 6px; padding: 10px; color: var(--text-primary); font-family: monospace; font-size: 12px; cursor: text;"
                        />
                        <button
                            class="copy-sbsd-url-btn"
                            style="position: absolute; top: 50%; right: 10px; transform: translateY(-50%); background: var(--primary); color: white; border: none; border-radius: 4px; padding: 6px 12px; font-size: 11px; cursor: pointer;"
                            data-copy="sbsdScriptUrlInput"
                        >Copy</button>
                    </div>
                </div>
                ` : ''}

                <!-- Copy All Button -->
                <div style="text-align: center; margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border);">
                    <button
                        id="copyAllDataBtn"
                        style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 6px; padding: 10px 24px; font-size: 14px; cursor: pointer; font-weight: 500;"
                    >
                        Copy All Data as JSON
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Helper function to copy text
        const copyToClipboard = (text, button) => {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);

            // Show feedback
            const originalText = button.textContent;
            button.textContent = '✅ Copied!';
            button.style.background = 'var(--success)';

            setTimeout(() => {
                button.textContent = originalText;
                button.style.background = 'var(--primary)';
            }, 2000);
        };

        // Individual copy button handlers
        modal.querySelectorAll('button[data-copy]').forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.getAttribute('data-copy');
                const targetElement = modal.querySelector(`#${targetId}`);
                if (targetElement) {
                    copyToClipboard(targetElement.value, btn);
                }
            });
        });

        // Copy all data as JSON
        const copyAllBtn = modal.querySelector('#copyAllDataBtn');
        if (copyAllBtn) {
            copyAllBtn.addEventListener('click', () => {
                const allData = {
                    sensorData: sensorData,
                    sbsdData: sbsdData,
                    sensorScriptUrl: sensorScriptUrl,
                    sbsdScriptUrl: sbsdScriptUrl,
                    timestamp: Date.now()
                };
                copyToClipboard(JSON.stringify(allData, null, 2), copyAllBtn);
            });
        }

        // Close handlers
        modal.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => {
                modal.style.opacity = '0';
                setTimeout(() => modal.remove(), 300);
            });
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.opacity = '0';
                setTimeout(() => modal.remove(), 300);
            }
        });

        setTimeout(() => modal.style.opacity = '1', 10);
    }













    /**
     * Render tools HTML
     */
    renderTools() {
        return `
            <div class="recaptcha-tools-grid">
                <button class="recaptcha-tool-btn" id="akamaiCheckCookies">
                    <div class="tool-btn-icon">🍪</div>
                    <div class="tool-btn-label">Check Cookies</div>
                </button>

                <button class="recaptcha-tool-btn" id="akamaiAnalyzeContent">
                    <div class="tool-btn-icon">🔗</div>
                    <div class="tool-btn-label">Analyze Scripts</div>
                </button>

                <button class="recaptcha-tool-btn" id="akamaiStartCapture">
                    <div class="tool-btn-icon">🎬</div>
                    <div class="tool-btn-label">Start Capturing</div>
                </button>

                <button class="recaptcha-tool-btn" id="akamaiExtractSensor">
                    <div class="tool-btn-icon">📊</div>
                    <div class="tool-btn-label">Extract Sensor Information</div>
                </button>
            </div>
        `;
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Check if currently capturing
        this.checkCaptureState();

        const actions = [
            { id: 'akamaiCheckCookies', method: () => this.checkCookies() },
            { id: 'akamaiAnalyzeContent', method: () => this.analyzeContent() },
            { id: 'akamaiStartCapture', method: () => this.startCapturing() },
            { id: 'akamaiExtractSensor', method: () => this.extractSensorInformation() }
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
     * Load capture history from storage (unified with reCAPTCHA)
     * @returns {Promise<Array>} Array of Akamai capture history items
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

            // Filter for Akamai captures only and remove expired items
            const now = Date.now();
            const validAkamaiHistory = history.filter(item => {
                if (item.type !== 'akamai') return false;
                if (!item.expiresAt) return false;
                return item.expiresAt > now;
            });

            return validAkamaiHistory;
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

        this.currentCaptureHistory = filteredHistory;

        let historyItems;
        if (filteredHistory.length === 0) {
            historyItems = `
                <div class="empty-capture-state" style="padding: 32px 16px; text-align: center; opacity: 0.7;">
                    <div style="font-size: 48px; margin-bottom: 12px;">📭</div>
                    <div style="font-size: 14px; font-weight: 500; margin-bottom: 8px;">No captures yet</div>
                    <div style="font-size: 12px; opacity: 0.8;">Click "Start Capturing" above to capture Akamai data</div>
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
                            <button class="clear-history-btn" id="clearAkamaiHistory" title="Clear all captured data">
                                <span>🗑️</span>
                            </button>
                        ` : ''}
                    </div>
                </div>
                <div class="history-list" id="akamaiHistoryList">
                    ${historyItems}
                </div>
            </div>
        `;
    }

    /**
     * Render capture history items HTML
     */
    renderCaptureHistoryItems(items) {
        return items.map((item) => {
            const { captureData, timestamp, hostname } = item;
            const timeAgo = this.getTimeAgo(timestamp);
            const faviconUrl = `https://www.google.com/s2/favicons?domain=${hostname}`;

            // Determine display mode and color based on new field names
            let modeDisplay = '';
            let modeColor = 'var(--text-primary)';

            if (captureData.abckCookieLevel === 'easy') {
                modeDisplay = 'Easy Mode';
                modeColor = 'var(--success)';
            } else if (captureData.requiresPixel) {
                modeDisplay = 'Pixel';
                modeColor = 'var(--danger)';
            } else if (captureData.requiresSecCpt) {
                modeDisplay = 'sec_cpt';
                modeColor = 'var(--danger)';
            } else if (captureData.requiresSbsd) {
                modeDisplay = 'SBSD';
                modeColor = 'var(--danger)';
            } else {
                modeDisplay = 'Standard';
            }

            // Add badges for challenges
            const badges = [];
            if (captureData.requiresPixel) badges.push('Pixel');
            if (captureData.requiresSbsd) badges.push('SBSD');
            if (captureData.requiresSecCpt) badges.push('sec_cpt');
            const badgesHtml = badges.length > 0 ?
                `<div style="display: flex; gap: 4px; margin-top: 4px;">
                    ${badges.map(badge => `<span style="font-size: 10px; background: var(--danger); color: white; padding: 2px 6px; border-radius: 3px;">⚠️ ${badge}</span>`).join('')}
                </div>` : '';

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
                                <span class="capture-type-label">ABCK Level</span>
                                <span class="capture-type-value" style="color: ${captureData.abckCookieLevel === 'easy' ? 'var(--success)' : 'var(--text-primary)'};">${captureData.abckCookieLevel === 'easy' ? 'Easy' : 'Standard'}</span>
                            </div>
                            ${captureData.akamaiVersion ? `
                            <div class="capture-type-row">
                                <span class="capture-type-label">Version</span>
                                <span class="capture-type-value" style="color: var(--info);">${captureData.akamaiVersion}</span>
                            </div>
                            ` : ''}
                            ${badgesHtml}
                        </div>
                        <button class="capture-expand" data-capture-id="${item.id}">
                            <span class="expand-arrow">›</span>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Re-render just the capture history section
     */
    async renderCapturedDataSection() {
        const advancedContent = document.querySelector('#advancedContent');
        if (!advancedContent) return;

        const existingHistory = advancedContent.querySelector('.capture-history-section');
        const captureHistoryHtml = await this.renderCaptureHistoryHTML();

        if (existingHistory) {
            if (captureHistoryHtml) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = captureHistoryHtml;
                const newSection = tempDiv.firstElementChild;
                existingHistory.replaceWith(newSection);
                this.setupCaptureHistoryListeners();
            } else {
                existingHistory.remove();
            }
        } else {
            if (captureHistoryHtml) {
                advancedContent.insertAdjacentHTML('beforeend', captureHistoryHtml);
                this.setupCaptureHistoryListeners();
            }
        }
    }

    /**
     * Setup capture history event listeners
     */
    setupCaptureHistoryListeners() {
        const clearBtn = document.querySelector('#clearAkamaiHistory');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearCaptureHistory());
        }

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
     * Toggle capture details display
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

        const history = await this.loadCaptureHistory();
        const capture = history.find(item => item.id === captureId);
        if (!capture) return;

        const { captureData } = capture;

        const detailsHtml = `
            <div class="history-item-details">
                <div class="details-grid">
                    ${captureData.abckCookie ? `
                        <div class="detail-row">
                            <span class="detail-label">ABCK:</span>
                            <span class="detail-value">✅</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">ABCK Level:</span>
                            <span class="detail-value" style="color: ${captureData.abckCookieLevel === 'easy' ? 'var(--success)' : 'var(--text-primary)'};">${captureData.abckCookieLevel === 'easy' ? 'Easy' : 'Standard'}</span>
                        </div>
                    ` : `
                        <div class="detail-row">
                            <span class="detail-label">ABCK:</span>
                            <span class="detail-value">❌ Not found</span>
                        </div>
                    `}
                    ${captureData.akamaiVersion ? `
                        <div class="detail-row">
                            <span class="detail-label">Version:</span>
                            <span class="detail-value" style="color: var(--info);">${captureData.akamaiVersion}</span>
                        </div>
                    ` : ''}
                    ${captureData.requiresSbsd ? `
                        <div class="detail-row">
                            <span class="detail-label">SBSD Challenge:</span>
                            <span class="detail-value">⚠️ Required</span>
                        </div>
                    ` : ''}
                    ${captureData.requiresSecCpt ? `
                        <div class="detail-row">
                            <span class="detail-label">sec_cpt Challenge:</span>
                            <span class="detail-value">⚠️ Required</span>
                        </div>
                    ` : ''}
                    ${captureData.requiresPixel ? `
                        <div class="detail-row">
                            <span class="detail-label">Pixel Challenge:</span>
                            <span class="detail-value">⚠️ Required</span>
                        </div>
                    ` : ''}
                </div>
                <div class="details-actions">
                    <button class="detail-action-btn copy-all-btn" data-capture-id="${captureId}">
                        📄 Copy All Data
                    </button>
                </div>
            </div>
        `;

        captureCard.insertAdjacentHTML('beforeend', detailsHtml);
        captureCard.classList.add('expanded');

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
     * Clear all Akamai capture history
     */
    async clearCaptureHistory() {
        if (!confirm('Clear all Akamai captured data? This cannot be undone.')) {
            return;
        }

        try {
            // Load unified history
            const result = await chrome.storage.local.get(['scrapfly_advanced_history']);
            if (!result.scrapfly_advanced_history) {
                await this.renderCapturedDataSection();
                return;
            }

            let history = result.scrapfly_advanced_history;
            if (typeof history === 'string') {
                history = JSON.parse(history);
            }
            if (!history.items) {
                history = { items: [], lastUpdated: Date.now() };
            }

            // Remove only Akamai captures
            history.items = history.items.filter(item => item.type !== 'akamai');
            history.lastUpdated = Date.now();

            // Save as JSON string to match reCAPTCHA format
            await chrome.storage.local.set({
                scrapfly_advanced_history: JSON.stringify(history, null, 2)
            });
            await this.renderCapturedDataSection();
        } catch (error) {
            console.error('Failed to clear capture history:', error);
        }
    }

    /**
     * Get relative time string
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
     * Process Akamai capture completion (called from background.js)
     * @param {number} tabId - Tab ID
     * @param {Object} interceptorData - Data from AkamaiInterceptor
     * @param {Object} chrome - Chrome API object
     * @returns {Promise<Object>} Processing result
     */
    static async processCaptureCompletion(tabId, interceptorData, chrome) {
        try {
            console.log('[Akamai] 🎯 Capture completed, processing data...');

            // Get tab info
            const tab = await chrome.tabs.get(tabId);
            if (!tab || !tab.url) {
                console.error('[Akamai] Tab not found or no URL');
                return { success: false, error: 'Tab not found or no URL' };
            }

            // Get cookies
            const cookies = await chrome.cookies.getAll({ url: tab.url });
            const abckCookie = cookies.find(c => c.name === '_abck');
            const sbsdCookie = cookies.find(c => c.name === 'sbsd');
            const sbsdOCookie = cookies.find(c => c.name === 'sbsd_o');

            // _abck cookie is optional - sensor_data is still valuable without it
            if (!abckCookie) {
                console.log('[Akamai] No _abck cookie found yet, but continuing with sensor_data capture');
            }

            // Analyze page content
            const pageInfo = await chrome.scripting.executeScript({
                target: { tabId: tabId },
                func: AkamaiAdvanced.analyzePage
            });

            const pageData = pageInfo?.[0]?.result || {
                requiresSecCpt: false,
                akamaiScriptPath: null,
                requiresPixel: false,
                pixelHtmlVar: null,
                pixelScriptUrls: null,
                pixelScriptVar: null
            };

            // Check modes - _abck cookie is optional
            const isEasyMode = abckCookie ? abckCookie.value.includes('~0~') : false;
            const requiresSbsd = !!(sbsdCookie || sbsdOCookie);

            // Determine version
            let version = 'Standard';
            if (isEasyMode) {
                version = 'Easy Mode';
            } else if (pageData.requiresPixel) {
                version = 'Pixel Challenge';
            } else if (pageData.requiresSecCpt) {
                version = 'sec_cpt';
            } else if (requiresSbsd) {
                version = 'SBSD';
            }

            // Create capture data - handle missing _abck cookie
            const captureData = {
                type: 'akamai',
                siteKey: abckCookie ? (abckCookie.value.substring(0, 100) + (abckCookie.value.length > 100 ? '...' : '')) : null,
                abckCookie: abckCookie ? (abckCookie.value.substring(0, 100) + (abckCookie.value.length > 100 ? '...' : '')) : null,
                abckFullLength: abckCookie ? abckCookie.value.length : 0,
                version: version,
                isEasyMode: isEasyMode,
                requiresSbsd: requiresSbsd,
                requiresSecCpt: pageData.requiresSecCpt,
                requiresPixel: pageData.requiresPixel,
                akamaiScriptPath: pageData.akamaiScriptPath,
                sensorData: interceptorData.sensorData,
                sensorEndpoint: interceptorData.endpoint,
                sensorLocation: 'Network Request',
                sbsdCookie: sbsdCookie ? sbsdCookie.value.substring(0, 50) : null,
                sbsdOCookie: sbsdOCookie ? sbsdOCookie.value.substring(0, 50) : null,
                pixelHtmlVar: pageData.pixelHtmlVar,
                pixelScriptUrl: pageData.pixelScriptUrls?.scriptUrl || null,
                pixelPostUrl: pageData.pixelScriptUrls?.postUrl || null,
                pixelScriptVar: pageData.pixelScriptVar,
                siteUrl: tab.url
            };

            // Debug logs
            AkamaiAdvanced.logCaptureDebugInfo(interceptorData, abckCookie, sbsdCookie, sbsdOCookie, pageData, version, captureData);

            // Save to unified history
            const hostname = new URL(tab.url).hostname;
            const result = await chrome.storage.local.get(['scrapfly_advanced_history']);
            let history = result.scrapfly_advanced_history || { items: [], lastUpdated: Date.now() };

            if (typeof history === 'string') {
                history = JSON.parse(history);
            }
            if (!history.items) {
                history = { items: [], lastUpdated: Date.now() };
            }

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

            history.items.unshift(newCapture);

            if (history.items.length > 100) {
                history.items = history.items.slice(0, 100);
            }

            history.lastUpdated = Date.now();

            // Save as JSON string to match reCAPTCHA format
            await chrome.storage.local.set({
                scrapfly_advanced_history: JSON.stringify(history, null, 2)
            });
            console.log('[Akamai] ✅ Capture saved to unified history as JSON string:', newCapture.id);

            // Clear advanced selection
            await chrome.storage.local.remove('scrapfly_advanced_selected');
            console.log('[Akamai] Cleared advanced selection');

            // Notify popup to refresh UI
            chrome.runtime.sendMessage({ type: 'CAPTURE_COMPLETED' }).catch(() => {});

            // Show success notification
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                func: () => {
                    // Clear existing notifications
                    const allNotifs = document.querySelectorAll('[id^="akamai-capture-notification"]');
                    allNotifs.forEach(notif => notif.remove());

                    // Create Akamai success notification
                    const notif = document.createElement('div');
                    notif.id = 'akamai-capture-notification-success';
                    notif.style.cssText = `
                        position: fixed !important;
                        top: 20px !important;
                        right: 20px !important;
                        background: linear-gradient(135deg, #00D9A0 0%, #00A67E 100%) !important;
                        color: white !important;
                        padding: 20px 24px !important;
                        border-radius: 12px !important;
                        box-shadow: 0 8px 32px rgba(0,0,0,0.3) !important;
                        z-index: 2147483647 !important;
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
                        min-width: 320px !important;
                    `;
                    notif.innerHTML = `
                        <style>
                            @keyframes slideIn { from { transform: translateX(400px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
                        </style>
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="font-size: 32px;">✅</div>
                            <div>
                                <div style="font-weight: 600; font-size: 16px; margin-bottom: 4px;">Akamai Data Captured!</div>
                                <div style="font-size: 13px; opacity: 0.9;">Check the Advanced tab for details</div>
                            </div>
                        </div>
                    `;
                    notif.style.animation = 'slideIn 0.3s ease-out';
                    document.body.appendChild(notif);

                    setTimeout(() => {
                        if (notif && notif.parentNode) {
                            notif.remove();
                        }
                    }, 5000);
                }
            }).catch(err => {
                console.log('[Akamai] Could not show notification:', err);
            });

            return { success: true, captureData: captureData, captureId: newCapture.id };

        } catch (error) {
            console.error('[Akamai] Error processing capture:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Analyze page content for Akamai detection (injected into page context)
     * @returns {Object} Page analysis results
     */
    static analyzePage() {
        const htmlContent = document.documentElement.outerHTML;
        const requiresSecCpt = htmlContent.includes('/sec_cpt/') || htmlContent.includes('cp_challenge');

        // Parse Akamai script path
        let akamaiScriptPath = null;
        const scriptMatch = /<script type="text\/javascript"\s*(?:nonce=".*?")?\s*src="([a-z\d/\-_]+)"><\/script>/i.exec(htmlContent);
        if (scriptMatch && scriptMatch[1]) {
            akamaiScriptPath = scriptMatch[1];
        }

        // Pixel challenge detection
        let requiresPixel = false;
        let pixelHtmlVar = null;
        let pixelScriptUrls = null;
        let pixelScriptVar = null;

        // Parse pixel HTML variable
        const pixelVarMatch = /bazadebezolkohpepadr="(\d+)"/.exec(htmlContent);
        if (pixelVarMatch && pixelVarMatch[1]) {
            requiresPixel = true;
            pixelHtmlVar = parseInt(pixelVarMatch[1]);
        }

        // Parse pixel script URL
        const pixelUrlMatch = /src="(https?:\/\/.+\/akam\/\d+\/\w+)"/.exec(htmlContent);
        if (pixelUrlMatch && pixelUrlMatch[1]) {
            const scriptUrl = pixelUrlMatch[1];
            const parts = scriptUrl.split("/");
            parts[parts.length - 1] = "pixel_" + parts[parts.length - 1];
            const postUrl = parts.join("/");
            pixelScriptUrls = { scriptUrl, postUrl };
        }

        // Parse pixel script variable
        const scripts = Array.from(document.querySelectorAll('script'));
        for (const script of scripts) {
            const content = script.textContent;
            if (!content) continue;

            const indexMatch = /g=_\[(\d+)]/.exec(content);
            if (indexMatch && indexMatch[1]) {
                const index = parseInt(indexMatch[1]);
                const arrayMatch = /var _=\[(.+?)];/.exec(content);
                if (arrayMatch && arrayMatch[1]) {
                    const rawStrings = arrayMatch[1].match(/"[^"]*"/g);
                    if (rawStrings && index < rawStrings.length) {
                        pixelScriptVar = rawStrings[index].replace(/^"|"$/g, "");
                        break;
                    }
                }
            }
        }

        return {
            requiresSecCpt,
            akamaiScriptPath,
            requiresPixel,
            pixelHtmlVar,
            pixelScriptUrls,
            pixelScriptVar
        };
    }

    /**
     * Log debug information for capture
     */
    static logCaptureDebugInfo(interceptorData, abckCookie, sbsdCookie, sbsdOCookie, pageData, version, captureData) {
        console.log('[Akamai Debug] ========== CAPTURE COMPLETED - FULL DATA ==========');
        console.log('[Akamai Debug] 📡 INTERCEPTED DATA:');
        console.log('[Akamai Debug]   sensor_data:', interceptorData.sensorData ? interceptorData.sensorData.substring(0, 100) + '...' : 'NOT CAPTURED');
        console.log('[Akamai Debug]   sensor_data length:', interceptorData.sensorData ? interceptorData.sensorData.length : 0);
        console.log('[Akamai Debug]   endpoint:', interceptorData.endpoint);
        console.log('[Akamai Debug]   timestamp:', new Date(interceptorData.timestamp).toISOString());

        console.log('[Akamai Debug] 🍪 COOKIES:');
        console.log('[Akamai Debug]   _abck:', {
            value: abckCookie.value.substring(0, 100) + '...',
            fullLength: abckCookie.value.length,
            domain: abckCookie.domain
        });
        console.log('[Akamai Debug]   sbsd:', sbsdCookie ? sbsdCookie.value.substring(0, 50) : 'NOT FOUND');
        console.log('[Akamai Debug]   sbsd_o:', sbsdOCookie ? sbsdOCookie.value.substring(0, 50) : 'NOT FOUND');

        console.log('[Akamai Debug] 🎯 MODE DETECTION:');
        console.log('[Akamai Debug]   Version:', version);
        console.log('[Akamai Debug]   Easy Mode:', captureData.isEasyMode);
        console.log('[Akamai Debug]   SBSD Required:', captureData.requiresSbsd);
        console.log('[Akamai Debug]   sec_cpt Required:', pageData.requiresSecCpt);
        console.log('[Akamai Debug]   Pixel Challenge:', pageData.requiresPixel);

        console.log('[Akamai Debug] 🎨 PIXEL CHALLENGE DATA:');
        console.log('[Akamai Debug]   HTML Var:', pageData.pixelHtmlVar || 'NOT FOUND');
        console.log('[Akamai Debug]   Script URL:', pageData.pixelScriptUrls?.scriptUrl || 'NOT FOUND');
        console.log('[Akamai Debug]   Post URL:', pageData.pixelScriptUrls?.postUrl || 'NOT FOUND');
        console.log('[Akamai Debug]   Script Var:', pageData.pixelScriptVar || 'NOT FOUND');

        console.log('[Akamai Debug] 📜 SCRIPTS:');
        console.log('[Akamai Debug]   Script Path:', pageData.akamaiScriptPath || 'NOT FOUND');

        console.log('[Akamai Debug] 💾 FINAL CAPTURE DATA:');
        console.log('[Akamai Debug]', captureData);
        console.log('[Akamai Debug] ========================================');
    }

    /**
     * Render Akamai capture data in a clean format
     * @param {Object} captureData - The captured Akamai data
     * @returns {string} HTML string
     */
    static renderCaptureDisplay(captureData) {
        if (!captureData) {
            return `
                <div style="padding: 16px; text-align: center; color: var(--text-secondary);">
                    No Akamai data captured yet
                </div>
            `;
        }

        // Determine protection level based on cookie length and mode
        let protectionLevel = 'Standard';
        let protectionColor = 'var(--text-primary)';

        if (captureData.isEasyMode || captureData.abckFullLength === 0) {
            protectionLevel = 'Easy';
            protectionColor = 'var(--success)';
        } else if (captureData.requiresPixel) {
            protectionLevel = 'Pixel Challenge';
            protectionColor = 'var(--danger)';
        } else if (captureData.requiresSbsd) {
            protectionLevel = 'SBSD Challenge';
            protectionColor = 'var(--warning)';
        } else if (captureData.requiresSecCpt) {
            protectionLevel = 'SEC_CPT';
            protectionColor = 'var(--warning)';
        }

        // Parse script URLs from the path if available
        const scriptUrl = captureData.akamaiScriptPath || captureData.sensorEndpoint || '';
        const sensorUrl = captureData.sensorEndpoint || '';
        const pixelUrl = captureData.pixelScriptUrl || '';
        const sbsdUrl = captureData.sbsdEndpoint || '';

        return `
            <div style="padding: 16px;">
                <!-- Header Section -->
                <div style="margin-bottom: 20px;">
                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                        <span style="font-size: 24px;">🤖</span>
                        <div>
                            <div style="color: var(--text-primary); font-weight: 600; font-size: 14px;">Akamai Bot Manager</div>
                            <div style="color: var(--text-secondary); font-size: 11px;">Captured ${this.getTimeAgo(captureData.timestamp)}</div>
                            ${captureData.akamaiVersion ? `<div style="color: var(--info); font-size: 11px;">${captureData.akamaiVersion}</div>` : ''}
                        </div>
                    </div>

                    <!-- Protection Level -->
                    <div style="background: var(--bg-tertiary); padding: 10px; border-radius: 6px; margin-bottom: 12px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="color: var(--text-secondary); font-size: 12px;">Cookie Protection Level:</span>
                            <span style="color: ${protectionColor}; font-weight: 600; font-size: 12px;">${protectionLevel}</span>
                        </div>
                    </div>
                </div>

                <!-- Cookies Section -->
                <div style="margin-bottom: 16px;">
                    <div style="color: var(--text-secondary); font-size: 11px; text-transform: uppercase; margin-bottom: 8px; font-weight: 600;">Cookies</div>

                    <!-- _abck Cookie -->
                    ${captureData.abckCookie ? `
                        <div style="background: var(--bg-tertiary); padding: 10px; border-radius: 6px; margin-bottom: 6px;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="color: var(--text-primary); font-size: 12px; font-family: monospace;">_abck</span>
                                <span style="color: var(--success); font-size: 16px;">✓</span>
                            </div>
                        </div>
                    ` : ''}

                    <!-- sbsd Cookie -->
                    ${captureData.requiresSbsd ? `
                        <div style="background: var(--bg-tertiary); padding: 10px; border-radius: 6px; margin-bottom: 6px;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="color: var(--text-primary); font-size: 12px; font-family: monospace;">sbsd challenge</span>
                                <span style="color: ${captureData.sbsdCookie ? 'var(--success)' : 'var(--text-muted)'}; font-size: 16px;">${captureData.sbsdCookie ? '✓' : '○'}</span>
                            </div>
                        </div>
                    ` : ''}

                    <!-- sec_cpt Cookie -->
                    ${captureData.requiresSecCpt ? `
                        <div style="background: var(--bg-tertiary); padding: 10px; border-radius: 6px; margin-bottom: 6px;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="color: var(--text-primary); font-size: 12px; font-family: monospace;">sec_cpt challenge</span>
                                <span style="color: var(--warning); font-size: 16px;">✓</span>
                            </div>
                        </div>
                    ` : ''}
                </div>

                <!-- URL Paths Section -->
                ${(sensorUrl || pixelUrl || sbsdUrl) ? `
                    <div style="margin-bottom: 16px;">
                        <div style="color: var(--text-secondary); font-size: 11px; text-transform: uppercase; margin-bottom: 8px; font-weight: 600;">URL Paths</div>

                        ${sensorUrl ? `
                            <div style="background: var(--bg-tertiary); padding: 10px; border-radius: 6px; margin-bottom: 6px;">
                                <div style="color: var(--text-secondary); font-size: 10px; margin-bottom: 4px;">Sensor URL Path:</div>
                                <div style="color: var(--text-primary); font-size: 11px; font-family: monospace; word-break: break-all;">
                                    ${this.extractPath(sensorUrl)}
                                </div>
                            </div>
                        ` : ''}

                        ${captureData.requiresSbsd && sbsdUrl ? `
                            <div style="background: var(--bg-tertiary); padding: 10px; border-radius: 6px; margin-bottom: 6px;">
                                <div style="color: var(--text-secondary); font-size: 10px; margin-bottom: 4px;">SBSD URL Path:</div>
                                <div style="color: var(--text-primary); font-size: 11px; font-family: monospace; word-break: break-all;">
                                    ${this.extractPath(sbsdUrl)}
                                </div>
                            </div>
                        ` : ''}

                        ${captureData.requiresPixel && pixelUrl ? `
                            <div style="background: var(--bg-tertiary); padding: 10px; border-radius: 6px; margin-bottom: 6px;">
                                <div style="color: var(--text-secondary); font-size: 10px; margin-bottom: 4px;">Pixel URL Path:</div>
                                <div style="color: var(--text-primary); font-size: 11px; font-family: monospace; word-break: break-all;">
                                    ${this.extractPath(pixelUrl)}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                ` : ''}

                <!-- Sensor Data Section -->
                ${captureData.sensorData ? `
                    <div style="margin-bottom: 16px;">
                        <div style="color: var(--text-secondary); font-size: 11px; text-transform: uppercase; margin-bottom: 8px; font-weight: 600;">Sensor Data</div>
                        <div style="background: var(--bg-tertiary); padding: 10px; border-radius: 6px;">
                            <div style="color: var(--text-secondary); font-size: 10px; margin-bottom: 4px;">Captured sensor_data (${captureData.sensorData.length} chars):</div>
                            <div style="color: var(--text-primary); font-size: 10px; font-family: monospace; word-break: break-all; max-height: 60px; overflow-y: auto; background: var(--bg-primary); padding: 6px; border-radius: 4px;">
                                ${captureData.sensorData.substring(0, 200)}${captureData.sensorData.length > 200 ? '...' : ''}
                            </div>
                        </div>
                    </div>
                ` : ''}

                <!-- Action Buttons -->
                <div style="display: flex; gap: 8px;">
                    <button class="copy-akamai-data" style="flex: 1; padding: 8px; background: var(--accent); color: white; border: none; border-radius: 6px; font-size: 12px; cursor: pointer;" data-copy="${this.escapeHtml(JSON.stringify(captureData))}">
                        Copy All Data
                    </button>
                    ${captureData.sensorData ? `
                        <button class="copy-sensor-data" style="flex: 1; padding: 8px; background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border); border-radius: 6px; font-size: 12px; cursor: pointer;" data-copy="${this.escapeHtml(captureData.sensorData)}">
                            Copy Sensor Data
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }

    /**
     * Extract path from URL
     * @param {string} url - Full URL
     * @returns {string} Path portion of URL
     */
    static extractPath(url) {
        if (!url) return '';
        try {
            const urlObj = new URL(url);
            return urlObj.pathname;
        } catch {
            // If not a valid URL, might already be a path
            return url;
        }
    }

    /**
     * Get time ago string
     * @param {number} timestamp - Timestamp in milliseconds
     * @returns {string} Time ago string
     */
    static getTimeAgo(timestamp) {
        if (!timestamp) return 'recently';

        const now = Date.now();
        const diff = now - timestamp;
        const minutes = Math.floor(diff / 60000);

        if (minutes < 1) return 'just now';
        if (minutes < 60) return `${minutes} min${minutes > 1 ? 's' : ''} ago`;

        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;

        const days = Math.floor(hours / 24);
        return `${days} day${days > 1 ? 's' : ''} ago`;
    }

    /**
     * Escape HTML for safe insertion
     * @param {string} str - String to escape
     * @returns {string} Escaped string
     */
    static escapeHtml(str) {
        if (!str) return '';
        return str.replace(/"/g, '&quot;')
                  .replace(/'/g, '&#39;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;');
    }

    /**
     * Handle AKAMAI_STOP_CAPTURE message from background
     * @param {number} tabId - Tab ID
     * @param {object} captureResults - Capture results from akamaiStopCapture
     */
    static async handleStopCapture(tabId, captureResults) {
        try {
            // If we have captured data that wasn't already saved, save it now
            if (captureResults && captureResults.results && captureResults.results.sensorData) {
                // Check if this data was already saved by checking history
                const historyResult = await chrome.storage.local.get(['scrapfly_advanced_history']);
                let history = historyResult.scrapfly_advanced_history || { items: [], lastUpdated: Date.now() };
                if (typeof history === 'string') {
                    history = JSON.parse(history);
                }
                if (!history.items) {
                    history = { items: [], lastUpdated: Date.now() };
                }

                // Check if we already have a recent capture (within last 5 seconds)
                const recentCapture = history.items.find(item =>
                    item.type === 'akamai' &&
                    (Date.now() - item.timestamp) < 5000
                );

                if (!recentCapture) {
                    // This is a manual stop with data that wasn't auto-saved
                    // Save it now using the same logic as AKAMAI_CAPTURE_COMPLETED
                    const tab = await chrome.tabs.get(tabId);
                    if (tab && tab.url) {
                        // Call the capture completed handler
                        await AkamaiAdvanced.handleCaptureCompleted(tabId, captureResults.results);
                    }
                }
            }

            // Always send stop notification to popup regardless of data
            await chrome.runtime.sendMessage({
                type: 'AKAMAI_CAPTURE_STOPPED',
                tabId: tabId,
                results: captureResults
            });
        } catch (error) {
            console.error('[AKAMAI-CAPTURE] Error in handleStopCapture:', error);
        }
    }

    /**
     * Handle AKAMAI_CAPTURE_COMPLETED message from background
     * @param {number} tabId - Tab ID
     * @param {object} interceptorData - Data from the interceptor
     */
    static async handleCaptureCompleted(tabId, interceptorData) {
        console.log('[AKAMAI-CAPTURE] ========== CAPTURE_COMPLETED START ==========');
        console.log('[AKAMAI-CAPTURE] Processing capture completion for tab:', tabId);
        console.log('[AKAMAI-CAPTURE] Interceptor data received:', {
            hasSensorData: !!interceptorData?.sensorData,
            sensorDataLength: interceptorData?.sensorData?.length,
            endpoint: interceptorData?.endpoint
        });

        try {
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
                scrapfly_advanced_history: JSON.stringify(history)
            });
            console.log('[AKAMAI-CAPTURE] ✓ History saved to storage');

            // Send capture complete message to popup
            console.log('[AKAMAI-CAPTURE] Step 7: Sending AKAMAI_CAPTURE_SAVED to popup...');
            try {
                await chrome.runtime.sendMessage({
                    type: 'AKAMAI_CAPTURE_SAVED',
                    captureData: newCapture
                });
                console.log('[AKAMAI-CAPTURE] ✓ Message sent to popup');
            } catch (msgError) {
                console.log('[AKAMAI-CAPTURE] ⚠️ Popup not available (expected if closed):', msgError.message);
            }

            console.log('[AKAMAI-CAPTURE] ========== CAPTURE_COMPLETED END ==========');
        } catch (error) {
            console.error('[AKAMAI-CAPTURE] ❌ Error in capture process:', error);
            console.error('[AKAMAI-CAPTURE] Error stack:', error.stack);
        }
    }

    /**
     * Handle AKAMAI_EXTRACT_SENSOR message from background
     * @param {number} tabId - Tab ID
     */
    static async handleExtractSensor(tabId) {
        console.log('[AKAMAI-EXTRACT] ========== EXTRACT SENSOR START ==========');
        try {
            console.log('[AKAMAI-EXTRACT] Tab ID:', tabId);

            // Get current tab URL
            console.log('[AKAMAI-EXTRACT] Step 1: Getting tab info...');
            const tab = await chrome.tabs.get(tabId);
            if (!tab || !tab.url) {
                console.error('[AKAMAI-EXTRACT] ❌ Unable to get tab URL');
                throw new Error('Unable to get tab URL');
            }
            console.log('[AKAMAI-EXTRACT] ✓ Tab info:', { id: tab.id, url: tab.url });

            // Delete _abck cookies for the current site
            console.log('[AKAMAI-EXTRACT] Step 2: Getting cookies for:', tab.url);
            const cookies = await chrome.cookies.getAll({ url: tab.url, name: '_abck' });
            console.log('[AKAMAI-EXTRACT] Found', cookies.length, '_abck cookies');

            for (const cookie of cookies) {
                await chrome.cookies.remove({
                    url: tab.url,
                    name: cookie.name
                });
                console.log('[AKAMAI-EXTRACT] ✓ Deleted cookie:', cookie.name);
            }
            console.log('[AKAMAI-EXTRACT] ✓ All _abck cookies deleted');

            // Enable extraction mode in interceptor
            console.log('[AKAMAI-EXTRACT] Step 3: Enabling extraction mode...');

            // First, ensure the interceptor is set up
            if (typeof setupAkamaiInterceptor === 'function') {
                console.log('[AKAMAI-EXTRACT] Setting up Akamai interceptor...');
                setupAkamaiInterceptor();
            }

            // Set up extraction mode in the capture state
            if (typeof akamaiCaptureState !== 'undefined' && akamaiCaptureState) {
                console.log('[AKAMAI-EXTRACT] Setting extraction mode in capture state...');
                akamaiCaptureState.set(tabId, {
                    active: true,
                    extractMode: true,
                    startTime: Date.now(),
                    tabUrl: tab.url,
                    results: null,
                    waitingForReload: false,  // Don't wait for reload in extraction mode
                    extractedData: null,
                    timeout: setTimeout(() => {
                        // Auto-stop after 30 seconds
                        const state = akamaiCaptureState.get(tabId);
                        if (state && state.extractMode) {
                            akamaiCaptureState.delete(tabId);
                            console.log('[AKAMAI-EXTRACT] ⏱️ Auto-stopped after 30s timeout');
                        }
                    }, 30000)
                });
                console.log('[AKAMAI-EXTRACT] ✓ Extraction mode enabled for tab:', tabId);
            } else {
                console.error('[AKAMAI-EXTRACT] ❌ akamaiCaptureState is not available!');
                throw new Error('Capture state not initialized');
            }

            // Reload the page
            console.log('[AKAMAI-EXTRACT] Step 4: Reloading page...');
            await chrome.tabs.reload(tabId);
            console.log('[AKAMAI-EXTRACT] ✓ Page reload initiated');

            console.log('[AKAMAI-EXTRACT] ========== WAITING FOR SENSOR DATA ==========');

        } catch (error) {
            console.error('[AKAMAI-EXTRACT] ❌ Error:', error);
            console.error('[AKAMAI-EXTRACT] Stack:', error.stack);
            throw error;
        }
    }

    /**
     * Handle AKAMAI_EXTRACTION_COMPLETED message from background
     * @param {number} tabId - Tab ID
     * @param {object} extractedData - Extracted sensor data
     */
    static async handleExtractionCompleted(tabId, extractedData) {
        console.log('[AKAMAI-EXTRACT] ========== EXTRACTION COMPLETED ==========');
        try {
            console.log('[AKAMAI-EXTRACT] Tab ID:', tabId);
            console.log('[AKAMAI-EXTRACT] Extracted data:', {
                hasSensorData: !!extractedData?.sensorData,
                hasSbsdData: !!extractedData?.sbsdData,
                hasSecData: !!extractedData?.secData,
                scriptUrl: extractedData?.scriptUrl,
                endpointsCount: extractedData?.endpoints?.length || 0
            });

            // Stop capture
            console.log('[AKAMAI-EXTRACT] Step 1: Stopping capture state...');
            if (typeof akamaiCaptureState !== 'undefined' && akamaiCaptureState) {
                const state = akamaiCaptureState.get(tabId);
                console.log('[AKAMAI-EXTRACT] Current state:', state);
                if (state && state.timeout) {
                    clearTimeout(state.timeout);
                    console.log('[AKAMAI-EXTRACT] ✓ Timeout cleared');
                }
                akamaiCaptureState.delete(tabId);
                console.log('[AKAMAI-EXTRACT] ✓ State deleted for tab:', tabId);
            }

            // Send data to popup
            console.log('[AKAMAI-EXTRACT] Step 2: Sending data to popup...');
            try {
                await chrome.runtime.sendMessage({
                    type: 'AKAMAI_EXTRACTION_RESULT',
                    extractedData: extractedData
                });
                console.log('[AKAMAI-EXTRACT] ✓ Data sent to popup');
            } catch (msgError) {
                console.log('[AKAMAI-EXTRACT] ⚠️ Popup not available (expected if closed):', msgError.message);
            }

            console.log('[AKAMAI-EXTRACT] ========== EXTRACTION COMPLETED END ==========');
        } catch (error) {
            console.error('[AKAMAI-EXTRACT] ❌ Error:', error);
            console.error('[AKAMAI-EXTRACT] Stack:', error.stack);
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AkamaiAdvanced;
} else if (typeof window !== 'undefined') {
    window.AkamaiAdvanced = AkamaiAdvanced;
}