// Browser API Compatibility Layer
// This script provides a unified API interface for both Chrome and Firefox

(function() {
  'use strict';

  // Detect browser and create unified API
  const browserAPI = (function() {
    if (typeof browser !== 'undefined' && browser.runtime) {
      return browser;
    } else if (typeof chrome !== 'undefined' && chrome.runtime) {
      return chrome;
    } else {
      throw new Error('No browser extension API found');
    }
  })();

  // Make browser API globally available
  window.browser = browserAPI;

  // Firefox-specific compatibility fixes
  if (browserAPI.runtime.getManifest().manifest_version === 3) {
    // Firefox doesn't support service workers in MV3, so we need to handle this
    if (typeof ServiceWorkerGlobalScope === 'undefined') {
      // We're in a background script context, not a service worker
      console.log('🦊 Running in Firefox background script context');
    }
  }

  // Ensure chrome namespace is available for compatibility
  if (typeof chrome === 'undefined') {
    window.chrome = browserAPI;
  }

  // Firefox-specific API differences
  if (browserAPI.runtime.getManifest().browser_specific_settings) {
    console.log('🦊 Firefox extension detected');
    
    // Firefox may have different behavior for some APIs
    // Add any Firefox-specific workarounds here
  }

})();
