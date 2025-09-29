/**
 * NotificationManager - Centralized notification system for Scrapfly extension
 * Handles toast notifications, confirmation dialogs, and badge notifications
 */
class NotificationManager {
  constructor() {
    this.toasts = [];
    this.confirmDialogs = [];
    this.initialized = false;
    this.container = null;
    this.maxToasts = 5;
  }

  /**
   * Initialize the notification system
   */
  initialize() {
    if (this.initialized) return;

    // Create main container for notifications
    this.container = document.createElement('div');
    this.container.id = 'notification-container';
    this.container.className = 'notification-container';
    document.body.appendChild(this.container);

    // Add styles if not already added
    if (!document.querySelector('#notification-styles')) {
      const link = document.createElement('link');
      link.id = 'notification-styles';
      link.rel = 'stylesheet';
      // Check if chrome.runtime is available
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
        link.href = chrome.runtime.getURL('Modules/NotificationManager.css');
      } else {
        link.href = 'Modules/NotificationManager.css';
      }
      document.head.appendChild(link);
    }

    this.initialized = true;
  }

  /**
   * Show a toast notification
   * @param {string} message - Notification message
   * @param {string} type - Notification type (success, error, warning, info)
   * @param {Object} options - Additional options
   * @returns {string} Toast ID
   */
  showToast(message, type = 'info', options = {}) {
    if (!this.initialized) this.initialize();

    const defaults = {
      duration: 5000,
      position: 'top-right',
      showProgress: true,
      closeable: true,
      icon: this.getIcon(type)
    };

    const settings = { ...defaults, ...options };
    const toastId = `toast-${Date.now()}`;

    // Create toast element
    const toast = document.createElement('div');
    toast.id = toastId;
    toast.className = `notification-toast notification-${type} notification-${settings.position}`;
    toast.setAttribute('data-show', 'false');

    // Build toast HTML
    toast.innerHTML = `
      <div class="notification-toast-content">
        <span class="notification-icon">${settings.icon}</span>
        <div class="notification-body">
          <div class="notification-message">${message}</div>
        </div>
        ${settings.closeable ? '<button class="notification-close">&times;</button>' : ''}
      </div>
      ${settings.showProgress ? '<div class="notification-progress"><div class="notification-progress-bar"></div></div>' : ''}
    `;

    // Add to container
    this.container.appendChild(toast);

    // Trigger reflow to enable transition
    toast.offsetHeight;

    // Show toast with animation
    requestAnimationFrame(() => {
      toast.setAttribute('data-show', 'true');
    });

    // Setup close button
    if (settings.closeable) {
      const closeBtn = toast.querySelector('.notification-close');
      closeBtn.addEventListener('click', () => this.removeToast(toastId));
    }

    // Setup auto-dismiss
    if (settings.duration > 0) {
      // Animate progress bar
      if (settings.showProgress) {
        const progressBar = toast.querySelector('.notification-progress-bar');
        progressBar.style.transition = `width ${settings.duration}ms linear`;
        requestAnimationFrame(() => {
          progressBar.style.width = '0%';
        });
      }

      // Remove after duration
      setTimeout(() => this.removeToast(toastId), settings.duration);
    }

    // Track toast
    this.toasts.push({ id: toastId, element: toast });

    // Remove oldest toast if exceeded max
    if (this.toasts.length > this.maxToasts) {
      const oldest = this.toasts.shift();
      this.removeToast(oldest.id);
    }

    return toastId;
  }

  /**
   * Remove a toast notification
   * @param {string} toastId - Toast ID to remove
   */
  removeToast(toastId) {
    const toast = document.getElementById(toastId);
    if (!toast) return;

    // Animate out
    toast.setAttribute('data-show', 'false');

    // Remove from DOM after animation
    setTimeout(() => {
      toast.remove();
      this.toasts = this.toasts.filter(t => t.id !== toastId);
    }, 300);
  }

  /**
   * Show success toast
   * @param {string} message - Success message
   * @param {Object} options - Additional options
   */
  success(message, options = {}) {
    return this.showToast(message, 'success', options);
  }

  /**
   * Show error toast
   * @param {string} message - Error message
   * @param {Object} options - Additional options
   */
  error(message, options = {}) {
    return this.showToast(message, 'error', { ...options, duration: 7000 });
  }

  /**
   * Show warning toast
   * @param {string} message - Warning message
   * @param {Object} options - Additional options
   */
  warning(message, options = {}) {
    return this.showToast(message, 'warning', options);
  }

  /**
   * Show info toast
   * @param {string} message - Info message
   * @param {Object} options - Additional options
   */
  info(message, options = {}) {
    return this.showToast(message, 'info', options);
  }

  /**
   * Show confirmation dialog
   * @param {Object} options - Dialog options
   * @returns {Promise<boolean>} User's choice
   */
  confirm(options = {}) {
    if (!this.initialized) this.initialize();

    const defaults = {
      title: 'Confirm',
      message: 'Are you sure?',
      confirmText: 'Confirm',
      cancelText: 'Cancel',
      type: 'info', // info, warning, danger
      showIcon: true,
      icon: null
    };

    const settings = { ...defaults, ...options };
    if (!settings.icon) {
      settings.icon = this.getIcon(settings.type === 'danger' ? 'error' : settings.type);
    }

    return new Promise((resolve) => {
      const dialogId = `confirm-${Date.now()}`;

      // Create backdrop
      const backdrop = document.createElement('div');
      backdrop.className = 'notification-backdrop';
      backdrop.setAttribute('data-show', 'false');

      // Create dialog
      const dialog = document.createElement('div');
      dialog.id = dialogId;
      dialog.className = `notification-confirm notification-confirm-${settings.type}`;
      dialog.setAttribute('data-show', 'false');

      // Build dialog HTML
      dialog.innerHTML = `
        <div class="notification-confirm-content">
          ${settings.showIcon ? `<div class="notification-confirm-icon">${settings.icon}</div>` : ''}
          <h3 class="notification-confirm-title">${settings.title}</h3>
          <p class="notification-confirm-message">${settings.message}</p>
          <div class="notification-confirm-buttons">
            <button class="notification-btn notification-btn-cancel">${settings.cancelText}</button>
            <button class="notification-btn notification-btn-confirm notification-btn-${settings.type}">${settings.confirmText}</button>
          </div>
        </div>
      `;

      // Add to body
      document.body.appendChild(backdrop);
      document.body.appendChild(dialog);

      // Trigger reflow
      backdrop.offsetHeight;
      dialog.offsetHeight;

      // Show with animation
      requestAnimationFrame(() => {
        backdrop.setAttribute('data-show', 'true');
        dialog.setAttribute('data-show', 'true');
      });

      // Setup event handlers
      const confirmBtn = dialog.querySelector('.notification-btn-confirm');
      const cancelBtn = dialog.querySelector('.notification-btn-cancel');

      const cleanup = () => {
        backdrop.setAttribute('data-show', 'false');
        dialog.setAttribute('data-show', 'false');

        setTimeout(() => {
          backdrop.remove();
          dialog.remove();
        }, 300);
      };

      confirmBtn.addEventListener('click', () => {
        cleanup();
        resolve(true);
      });

      cancelBtn.addEventListener('click', () => {
        cleanup();
        resolve(false);
      });

      backdrop.addEventListener('click', () => {
        cleanup();
        resolve(false);
      });
    });
  }

  /**
   * Set badge on extension icon
   * @param {string} text - Badge text
   * @param {string} color - Badge color type (success, error, warning, info)
   */
  async setBadge(text, color = 'info') {
    const colors = {
      success: '#10b981',
      error: '#ef4444',
      warning: '#f59e0b',
      info: '#3b82f6',
      danger: '#ef4444'
    };

    try {
      if (typeof chrome !== 'undefined' && chrome.action) {
        await chrome.action.setBadgeText({ text: String(text) });
        await chrome.action.setBadgeBackgroundColor({ color: colors[color] || colors.info });
      }
    } catch (error) {
      console.error('Failed to set badge:', error);
    }
  }

  /**
   * Clear badge from extension icon
   */
  async clearBadge() {
    try {
      if (typeof chrome !== 'undefined' && chrome.action) {
        await chrome.action.setBadgeText({ text: '' });
      }
    } catch (error) {
      console.error('Failed to clear badge:', error);
    }
  }

  /**
   * Get icon for notification type
   * @param {string} type - Notification type
   * @returns {string} Icon HTML or emoji
   */
  getIcon(type) {
    const icons = {
      success: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20 6L9 17l-5-5"/>
      </svg>`,
      error: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>`,
      warning: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>`,
      info: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="16" x2="12" y2="12"/>
        <line x1="12" y1="8" x2="12.01" y2="8"/>
      </svg>`
    };

    return icons[type] || icons.info;
  }

  /**
   * Show a loading notification
   * @param {string} message - Loading message
   * @returns {Object} Loading controller with update and close methods
   */
  loading(message = 'Loading...') {
    const toastId = this.showToast(message, 'info', {
      duration: 0,
      closeable: false,
      icon: `<div class="notification-spinner"></div>`
    });

    return {
      update: (newMessage) => {
        const toast = document.getElementById(toastId);
        if (toast) {
          const messageEl = toast.querySelector('.notification-message');
          if (messageEl) messageEl.textContent = newMessage;
        }
      },
      close: () => this.removeToast(toastId)
    };
  }

  /**
   * Show in-page capture notification
   * @param {Object} options - Notification options
   * @param {string} options.type - Capture type ('recaptcha', 'akamai', etc.)
   * @param {string} options.variant - Notification variant ('progress', 'success', 'complete')
   * @param {string} options.title - Notification title
   * @param {string} options.message - Notification message
   * @param {number} options.timeRemaining - Time remaining in milliseconds (for progress variant)
   * @param {number} options.resultsCount - Number of captured results (for success/complete variants)
   * @param {number} options.duration - Auto-dismiss duration in milliseconds (default: 3000)
   * @param {boolean} options.aggressiveCleanup - Whether to perform aggressive cleanup before showing (default: false)
   */
  static showInPageNotification(options = {}) {
    const {
      type = 'recaptcha',
      variant = 'success',
      title,
      message,
      timeRemaining,
      resultsCount,
      duration = 3000,
      aggressiveCleanup = false
    } = options;

    const typeLabel = type === 'recaptcha' ? 'reCAPTCHA' : type === 'akamai' ? 'Akamai' : type;
    console.log(`[${typeLabel}] Showing ${variant} notification`);

    // Aggressive cleanup for stop/complete variants
    if (aggressiveCleanup) {
      const allNotifs = document.querySelectorAll('[id^="scrapfly-capture-notification"], [id^="akamai-capture-notification"]');
      allNotifs.forEach(n => {
        n.style.animation = 'none';
        n.remove();
      });

      const oldStyles = document.querySelectorAll('style[data-scrapfly-notification]');
      oldStyles.forEach(s => s.remove());
    } else {
      // Normal cleanup
      const existingNotif = document.getElementById('scrapfly-capture-notification');
      if (existingNotif) existingNotif.remove();
    }

    // Clear timer if exists
    if (window.scrapflyTimerInterval) {
      clearInterval(window.scrapflyTimerInterval);
      window.scrapflyTimerInterval = null;
    }

    // Determine gradient based on variant
    const gradients = {
      progress: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      success: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
      complete: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
      akamai: 'linear-gradient(135deg, #00D9A0 0%, #00A67E 100%)'
    };

    const gradient = type === 'akamai' ? gradients.akamai : gradients[variant] || gradients.success;

    // Create notification element
    const uniqueId = `scrapfly-capture-notification-${Date.now()}`;
    const notif = document.createElement('div');
    notif.id = uniqueId;
    notif.style.cssText = `
      position: fixed !important;
      top: 20px !important;
      right: 20px !important;
      background: ${gradient} !important;
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

    // Build notification content based on variant
    let content = '';

    if (variant === 'progress' && timeRemaining !== undefined) {
      // Progress notification with timer
      content = `
        <div style="font-weight: 600; font-size: 16px; margin-bottom: 8px;">
          ${title || `🎯 ${typeLabel} Capture - Step 2`}
        </div>
        <div style="opacity: 0.9;">
          ${message || `Now trigger or click the ${typeLabel}`}
        </div>
        <div id="scrapfly-timer" style="margin-top: 12px; font-size: 12px; opacity: 0.8; font-weight: 600;">
          ⏱️ ${Math.floor(timeRemaining / 1000)}s remaining
        </div>
      `;
    } else if (variant === 'success' && resultsCount !== undefined) {
      // Success notification
      content = `
        <div style="font-weight: 600; font-size: 16px; margin-bottom: 8px;">
          ${title || '✅ Capture Complete!'}
        </div>
        <div style="opacity: 0.9;">
          ${message || `${resultsCount} ${typeLabel} request${resultsCount !== 1 ? 's' : ''} captured and decoded`}
        </div>
      `;
    } else if (variant === 'complete') {
      // Complete notification (with or without results)
      const hasResults = resultsCount !== undefined && resultsCount > 0;
      content = `
        <div style="font-weight: 600; font-size: 16px; margin-bottom: 8px;">
          ${title || `✅ Capture ${hasResults ? 'Successful' : 'Completed'}`}
        </div>
        <div style="opacity: 0.9;">
          ${message || (hasResults
            ? `${resultsCount} request${resultsCount !== 1 ? 's' : ''} captured and decoded`
            : `No ${typeLabel} requests captured`)}
        </div>
      `;
    } else if (type === 'akamai' && variant === 'success') {
      // Akamai specific layout
      content = `
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="font-size: 32px;">✅</div>
          <div>
            <div style="font-weight: 600; font-size: 16px; margin-bottom: 4px;">
              ${title || 'Akamai Data Captured!'}
            </div>
            <div style="font-size: 13px; opacity: 0.9;">
              ${message || 'Check the Advanced tab for details'}
            </div>
          </div>
        </div>
      `;
    } else {
      // Generic notification
      content = `
        <div style="font-weight: 600; font-size: 16px; margin-bottom: 8px;">
          ${title || `${typeLabel} Capture`}
        </div>
        <div style="opacity: 0.9;">
          ${message || 'Capture notification'}
        </div>
      `;
    }

    // Add styles and content
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

    if (aggressiveCleanup) {
      document.head.appendChild(styleTag);
    }

    notif.innerHTML = content;

    // Add to DOM
    const addNotification = () => {
      document.body.appendChild(notif);
      console.log(`[${typeLabel}] Notification shown`);

      // Setup timer for progress variant
      if (variant === 'progress' && timeRemaining !== undefined) {
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
      }

      // Auto-dismiss after duration
      if (duration > 0 && variant !== 'progress') {
        setTimeout(() => {
          notif.style.animation = 'slideOut 0.3s ease-out';
          notif.style.animationFillMode = 'forwards';
          setTimeout(() => {
            notif.remove();
            console.log(`[${typeLabel}] Notification removed`);
          }, 300);
        }, duration);
      }
    };

    // Use requestAnimationFrame for aggressive cleanup to ensure proper timing
    if (aggressiveCleanup) {
      requestAnimationFrame(() => {
        setTimeout(() => addNotification(), 100);
      });
    } else {
      addNotification();
    }
  }
}

// Create singleton instance
const notificationManager = new NotificationManager();

// Create NotificationHelper as a safe wrapper with fallback methods
const NotificationHelper = {
  /**
   * Safe confirm dialog
   */
  async confirm(options) {
    if (notificationManager && typeof notificationManager.confirm === 'function') {
      return await notificationManager.confirm(options);
    }
    // Fallback to native confirm
    return confirm(options.message || 'Are you sure?');
  },

  /**
   * Safe success notification
   */
  success(message, options) {
    if (notificationManager && typeof notificationManager.success === 'function') {
      return notificationManager.success(message, options);
    }
    console.log('✓', message);
  },

  /**
   * Safe error notification
   */
  error(message, options) {
    if (notificationManager && typeof notificationManager.error === 'function') {
      return notificationManager.error(message, options);
    }
    alert('Error: ' + message);
  },

  /**
   * Safe info notification
   */
  info(message, options) {
    if (notificationManager && typeof notificationManager.info === 'function') {
      return notificationManager.info(message, options);
    }
    console.log('ℹ', message);
  },

  /**
   * Safe warning notification
   */
  warning(message, options) {
    if (notificationManager && typeof notificationManager.warning === 'function') {
      return notificationManager.warning(message, options);
    }
    console.warn('⚠', message);
  },

  /**
   * Safe loading indicator
   */
  loading(message) {
    if (notificationManager && typeof notificationManager.loading === 'function') {
      return notificationManager.loading(message);
    }
    console.log('Loading...', message);
    return { close: () => {}, update: () => {} };
  },

  /**
   * Safe badge setter
   */
  async setBadge(text, color) {
    if (notificationManager && typeof notificationManager.setBadge === 'function') {
      return await notificationManager.setBadge(text, color);
    }
  },

  /**
   * Safe badge clearer
   */
  async clearBadge() {
    if (notificationManager && typeof notificationManager.clearBadge === 'function') {
      return await notificationManager.clearBadge();
    }
  },

  /**
   * Initialize notification manager if available
   */
  initialize() {
    if (notificationManager && typeof notificationManager.initialize === 'function') {
      return notificationManager.initialize();
    }
  }
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = notificationManager;
} else if (typeof window !== 'undefined') {
  window.NotificationManager = notificationManager;
  window.NotificationHelper = NotificationHelper;
  // Debug log to verify loading
  console.log('NotificationManager loaded and attached to window', window.NotificationManager);
}