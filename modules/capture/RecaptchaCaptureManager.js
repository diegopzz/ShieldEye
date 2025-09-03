/**
 * RecaptchaCaptureManager - Handles reCAPTCHA parameter capture from network requests
 */
class RecaptchaCaptureManager {
  constructor() {
    this.anchorData = new Map();
    this.capturedParams = new Map();
  }

  /**
   * Process reCAPTCHA anchor request
   */
  captureAnchor(tabId, url, initiator) {
    const site_key = url.searchParams.get('k');
    const size = url.searchParams.get('size') || 'normal';
    const s = url.searchParams.get('s');
    
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
      tabId: tabId
    };

    this.anchorData.set(site_key, params);
    console.log('Captured reCAPTCHA anchor:', params);
    
    return params;
  }

  /**
   * Process reCAPTCHA reload request
   */
  captureReload(tabId, url, requestBody, initiator) {
    const site_key = url.searchParams.get('k');
    
    if (!site_key || !this.anchorData.has(site_key)) {
      console.log('No anchor data found for site_key:', site_key);
      return null;
    }

    const anchorData = this.anchorData.get(site_key);
    
    let action = '';
    let isInvisibleFromMessage = false;
    
    if (requestBody && requestBody.raw && requestBody.raw.length > 0) {
      try {
        const bodyStr = String.fromCharCode.apply(null, new Uint8Array(requestBody.raw[0].bytes));
        if (bodyStr.includes('action') || url.pathname.includes('reload')) {
          action = 'homepage';
        }
      } catch (e) {
        console.log('Could not parse reload body:', e);
      }
    }
    
    const isReCaptchaV3 = action.length > 0;
    const isInvisible = !isReCaptchaV3 && anchorData.is_invisible;
    const recaptchaV2Normal = !anchorData.is_invisible && !isReCaptchaV3;
    
    const finalParams = {
      ...anchorData,
      action: action,
      isReCaptchaV3: isReCaptchaV3,
      isInvisible: isInvisible,
      recaptchaV2Normal: recaptchaV2Normal,
      reload_detected: true,
      version: isReCaptchaV3 ? 'v3' : 'v2'
    };
    
    this.capturedParams.set(tabId, finalParams);
    this.anchorData.delete(site_key);
    
    return finalParams;
  }

  /**
   * Get captured parameters for a tab
   */
  getCapturedParams(tabId) {
    return this.capturedParams.get(tabId) || null;
  }

  /**
   * Clear data for a tab
   */
  clearTabData(tabId) {
    this.capturedParams.delete(tabId);
    
    // Clean anchor data for the tab
    for (const [key, data] of this.anchorData.entries()) {
      if (data.tabId === tabId) {
        this.anchorData.delete(key);
      }
    }
  }

  /**
   * Get all anchor data (for debugging)
   */
  getAnchorData() {
    return Array.from(this.anchorData.values());
  }
}

// Export for use in background.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RecaptchaCaptureManager;
}