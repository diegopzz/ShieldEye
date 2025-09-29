class Advanced {
  static AVAILABLE_MODULES = {
    'recaptcha': {
      name: 'ReCaptchaAdvanced',
      file: 'ReCaptcha/ReCaptchaAdvanced.js',
      displayName: 'reCAPTCHA Detection Tools',
      icon: '🔴'
    },
    'akamai': {
      name: 'AkamaiAdvanced',
      file: 'Akamai/AkamaiAdvanced.js',
      displayName: 'Akamai Bot Manager Tools',
      icon: '🔷'
    },
  };

  constructor(detectorManager, detectionSection) {
    this.detectorManager = detectorManager;
    this.detectionSection = detectionSection;
    this.analysisResults = null;
    this.isRunningAnalysis = false;
    this.loadedModules = {};
    this.currentTab = null;
    this.selectedDetection = null;
    this.availableDetectionTools = [];
    this.captureHistoryPagination = null;
  }

  /**
   * Display advanced tools interface
   */
  async displayAdvancedTools() {
    console.log('Advanced.displayAdvancedTools called');

    const noAdvancedState = document.querySelector('#noAdvancedState');
    const advancedContent = document.querySelector('#advancedContent');

    // Check if DetectorManager is initialized
    if (!this.detectorManager.initialized) {
      this.showPlaceholderState();
      return;
    }

    // Get current tab info
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      this.currentTab = tab;
    } catch (error) {
      console.error('Failed to get current tab:', error);
    }

    // Setup message listener for capture completion
    this.setupCaptureCompletionListener();

    // Show advanced tools
    if (noAdvancedState) noAdvancedState.style.display = 'none';
    if (advancedContent) {
      advancedContent.style.display = 'block';
      await this.renderAdvancedInterface();
      await this.restoreSelectedDetection();
    }
  }

  /**
   * Setup listener for capture completion messages
   */
  setupCaptureCompletionListener() {
    if (this.captureCompletionListener) return; // Already setup

    this.captureCompletionListener = async (message) => {
      if (message.type === 'AKAMAI_CAPTURE_COMPLETED' || message.type === 'RECAPTCHA_CAPTURE_COMPLETED') {
        console.log('[Advanced] Capture completed, updating captured data display');

        // Don't clear the tools panel, just update the captured data section
        if (this.activeModule) {
          // Update capture button state for Akamai
          if (message.type === 'AKAMAI_CAPTURE_COMPLETED') {
            const captureBtn = document.querySelector('#akamaiStartCapture');
            if (captureBtn) {
              captureBtn.classList.remove('capturing');
              captureBtn.querySelector('.tool-btn-label').textContent = 'Start Capturing';
            }
          }

          // Update capture button state for reCAPTCHA
          if (message.type === 'RECAPTCHA_CAPTURE_COMPLETED') {
            const captureBtn = document.querySelector('#recaptchaStartCapture');
            if (captureBtn) {
              captureBtn.classList.remove('capturing');
              captureBtn.querySelector('.tool-btn-label').textContent = 'Start Capturing';
            }
          }

          // Refresh the captured data display
          if (this.activeModule.renderCapturedDataSection) {
            console.log('[Advanced] Refreshing captured data display');
            await this.activeModule.renderCapturedDataSection();
          }
        }
      }
    };

    chrome.runtime.onMessage.addListener(this.captureCompletionListener);
  }

  /**
   * Show placeholder state for advanced tools
   */
  showPlaceholderState() {
    const noAdvancedState = document.querySelector('#noAdvancedState');
    const advancedContent = document.querySelector('#advancedContent');

    if (noAdvancedState) noAdvancedState.style.display = 'flex';
    if (advancedContent) advancedContent.style.display = 'none';
  }

  /**
   * Get current detection results
   * @returns {Array} Current detections from Detection section
   */
  getCurrentDetections() {
    if (this.detectionSection && this.detectionSection.currentResults) {
      return this.detectionSection.currentResults;
    }
    return [];
  }

  /**
   * Get available detection modules for current detections
   * @returns {Array} Array of {detection, module} objects
   */
  getDetectionModules() {
    const detections = this.getCurrentDetections();
    const availableTools = [];

    detections.forEach(detection => {
      const detectorId = detection.detector?.id;
      if (detectorId && Advanced.AVAILABLE_MODULES[detectorId]) {
        availableTools.push({
          detection,
          module: Advanced.AVAILABLE_MODULES[detectorId]
        });
      }
    });

    return availableTools;
  }

  /**
   * Load and initialize a detection module
   * @param {string} moduleId - Module ID (e.g., 'recaptcha')
   * @param {object} detection - Detection result object
   * @returns {object} Module instance
   */
  async loadDetectionModule(moduleId, detection) {
    if (this.loadedModules[moduleId]) {
      return this.loadedModules[moduleId];
    }

    const moduleInfo = Advanced.AVAILABLE_MODULES[moduleId];
    if (!moduleInfo) {
      console.error(`Module ${moduleId} not found in registry`);
      return null;
    }

    try {
      const ModuleClass = window[moduleInfo.name];
      if (!ModuleClass) {
        console.error(`Module class ${moduleInfo.name} not loaded`);
        return null;
      }

      const moduleInstance = new ModuleClass(detection, this.currentTab);
      this.loadedModules[moduleId] = moduleInstance;
      return moduleInstance;
    } catch (error) {
      console.error(`Failed to initialize module ${moduleId}:`, error);
      return null;
    }
  }

  /**
   * Render advanced tools interface
   */
  async renderAdvancedInterface() {
    const advancedContent = document.querySelector('#advancedContent');
    if (!advancedContent) return;

    const detectionTools = this.getDetectionModules();
    this.availableDetectionTools = detectionTools;

    let captchaToolsHtml = '';
    if (detectionTools.length > 0) {
      const detectionsOptions = detectionTools.map(({ detection, module }) => {
        const detectorId = detection.detector?.id;
        const displayName = detection.detector?.name || module.displayName;
        const iconPath = detection.detector?.icon ?
          chrome.runtime.getURL(`detectors/icons/${detection.detector.icon}`) : '';

        return `
          <div class="detection-option" data-detector-id="${detectorId}">
            ${iconPath ? `<img src="${iconPath}" class="detection-icon" alt="${displayName}">` : '<span class="detection-icon-placeholder">🔒</span>'}
            <span class="detection-name">${displayName}</span>
          </div>
        `;
      }).join('');

      captchaToolsHtml = `
        <div class="captcha-tools-section">
          <div class="captcha-tools-header">
            <div class="header-left">
              <span class="header-icon">🎯</span>
              <h3>Advanced Detection Tools</h3>
            </div>
            <button class="help-btn" id="showCaptchaHelp" title="Help">?</button>
          </div>
          <p class="section-description">Monitor and capture CAPTCHA parameters in real-time</p>

          <div class="available-detections-section">
            <div class="custom-select-wrapper">
              <div id="detectionSelector" class="detection-selector-custom">
                <div class="selector-display">
                  <span class="placeholder-text">Select a detection...</span>
                </div>
                <div class="selector-dropdown" style="display: none;">
                  ${detectionsOptions}
                </div>
              </div>
            </div>
          </div>

          <div class="detection-actions">
            <button class="action-btn primary-action" id="loadDetectionTools" disabled>
              <span class="btn-icon">▶️</span>
              Load Tools
            </button>
            <button class="action-btn secondary-action" id="clearDetectionTools">
              <span class="btn-icon">✕</span>
              Clear All
            </button>
          </div>

          <div id="detectionToolsPanel" class="detection-tools-panel" style="display: none;">
            <!-- Selected detection tools will be rendered here -->
          </div>
        </div>
      `;
    } else {
      // No detections available
      captchaToolsHtml = `
        <div class="captcha-tools-section">
          <div class="captcha-tools-header">
            <div class="header-left">
              <span class="header-icon">🎯</span>
              <h3>Advanced Detection Tools</h3>
            </div>
          </div>
          <div class="empty-capture-state" style="padding: 48px 16px; text-align: center; opacity: 0.7;">
            <div style="font-size: 48px; margin-bottom: 12px;">🔍</div>
            <div style="font-size: 14px; font-weight: 500; margin-bottom: 8px;">Nothing was detected</div>
            <div style="font-size: 12px; opacity: 0.8;">This page doesn't have any supported type</div>
          </div>
        </div>
      `;
    }

    const interfaceHtml = `
      ${captchaToolsHtml}
    `;

    advancedContent.innerHTML = interfaceHtml;

    this.setupDetectionToolsListeners();
  }


  /**
   * Setup detection tools selection listeners
   */
  setupDetectionToolsListeners() {
    const selector = document.querySelector('#detectionSelector');
    const loadBtn = document.querySelector('#loadDetectionTools');
    const clearBtn = document.querySelector('#clearDetectionTools');

    if (selector) {
      const display = selector.querySelector('.selector-display');
      const dropdown = selector.querySelector('.selector-dropdown');
      const options = selector.querySelectorAll('.detection-option');

      if (display) {
        display.addEventListener('click', () => {
          const isOpen = dropdown.style.display === 'block';
          dropdown.style.display = isOpen ? 'none' : 'block';
          selector.classList.toggle('open', !isOpen);
        });
      }

      options.forEach(option => {
        option.addEventListener('click', () => {
          const detectorId = option.getAttribute('data-detector-id');
          const iconHtml = option.querySelector('.detection-icon, .detection-icon-placeholder')?.outerHTML || '';
          const name = option.querySelector('.detection-name')?.textContent || '';

          if (display) {
            display.innerHTML = `${iconHtml}<span class="selected-name">${name}</span>`;
            display.setAttribute('data-selected', detectorId);
          }

          dropdown.style.display = 'none';
          selector.classList.remove('open');

          if (loadBtn) {
            loadBtn.disabled = false;
          }
        });
      });

      document.addEventListener('click', (e) => {
        if (!selector.contains(e.target)) {
          dropdown.style.display = 'none';
          selector.classList.remove('open');
        }
      });
    }

    if (loadBtn) {
      loadBtn.addEventListener('click', () => this.loadSelectedDetectionTools());
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clearDetectionToolsPanel());
    }
  }

  /**
   * Load tools for selected detection
   */
  async loadSelectedDetectionTools() {
    const selector = document.querySelector('#detectionSelector');
    const panel = document.querySelector('#detectionToolsPanel');

    if (!selector || !panel) return;

    const display = selector.querySelector('.selector-display');
    const detectorId = display?.getAttribute('data-selected');
    if (!detectorId) return;

    const selected = this.availableDetectionTools.find(({ detection }) => detection.detector?.id === detectorId);

    if (!selected) return;

    const { detection, module } = selected;
    const moduleInstance = await this.loadDetectionModule(detectorId, detection);

    if (moduleInstance && moduleInstance.renderTools) {
      // Render tools
      let toolsContent = moduleInstance.renderTools();

      // If module supports captured data section, render it below tools
      if (moduleInstance.renderCaptureHistoryHTML) {
        const capturedDataHtml = await moduleInstance.renderCaptureHistoryHTML();
        if (capturedDataHtml) {
          toolsContent += capturedDataHtml;
        }
      }

      panel.innerHTML = toolsContent;
      panel.style.display = 'block';

      // Store the active module reference
      this.activeModule = moduleInstance;

      if (moduleInstance.setupEventListeners) {
        moduleInstance.setupEventListeners();
      }

      // Setup capture history listeners if the module has them
      if (moduleInstance.setupCaptureHistoryListeners) {
        moduleInstance.setupCaptureHistoryListeners();
      }

      this.selectedDetection = detectorId;
      this.currentModuleInstance = moduleInstance;

      const currentHostname = this.currentTab ? new URL(this.currentTab.url).hostname : null;

      await chrome.storage.local.set({
        'scrapfly_advanced_selected': {
          detectorId: detectorId,
          timestamp: Date.now(),
          hostname: currentHostname
        }
      });

      // Re-render capture history section if module supports it
      if (moduleInstance.renderCapturedDataSection) {
        await moduleInstance.renderCapturedDataSection();
      }

      NotificationHelper.success(`Loaded ${detection.detector?.name || detectorId} tools`);
    }
  }

  /**
   * Clear detection tools panel
   */
  clearDetectionToolsPanel() {
    const panel = document.querySelector('#detectionToolsPanel');
    const selector = document.querySelector('#detectionSelector');
    const loadBtn = document.querySelector('#loadDetectionTools');

    if (panel) {
      panel.innerHTML = '';
      panel.style.display = 'none';
    }

    if (selector) {
      const display = selector.querySelector('.selector-display');
      const dropdown = selector.querySelector('.selector-dropdown');

      if (display) {
        display.innerHTML = '<span class="placeholder-text">Select a detection...</span>';
        display.removeAttribute('data-selected');
      }

      if (dropdown) {
        dropdown.style.display = 'none';
      }

      selector.classList.remove('open');
    }

    if (loadBtn) {
      loadBtn.disabled = true;
    }

    this.selectedDetection = null;
    this.activeModule = null; // Clear active module reference
    this.loadedModules = {};

    chrome.storage.local.remove('scrapfly_advanced_selected');
  }

  /**
   * Restore previously selected detection after popup reopens
   */
  async restoreSelectedDetection() {
    try {
      const result = await chrome.storage.local.get('scrapfly_advanced_selected');
      if (!result.scrapfly_advanced_selected) return;

      const { detectorId, timestamp, hostname } = result.scrapfly_advanced_selected;

      const currentHostname = this.currentTab ? new URL(this.currentTab.url).hostname : null;

      if (Date.now() - timestamp > 3 * 60 * 1000 || hostname !== currentHostname) {
        chrome.storage.local.remove('scrapfly_advanced_selected');
        this.clearDetectionToolsPanel();
        return;
      }

      const selector = document.querySelector('#detectionSelector');
      if (!selector) return;

      const option = selector.querySelector(`[data-detector-id="${detectorId}"]`);
      if (!option) return;

      const display = selector.querySelector('.selector-display');
      const iconHtml = option.querySelector('.detection-icon, .detection-icon-placeholder')?.outerHTML || '';
      const name = option.querySelector('.detection-name')?.textContent || '';

      if (display) {
        display.innerHTML = `${iconHtml}<span class="selected-name">${name}</span>`;
        display.setAttribute('data-selected', detectorId);
      }

      const loadBtn = document.querySelector('#loadDetectionTools');
      if (loadBtn) {
        loadBtn.disabled = false;
      }

      // Don't auto-load tools - user must click "Load Tools" button
    } catch (error) {
      console.error('Error restoring selected detection:', error);
    }
  }

  /**
   * Show help information for CAPTCHA tools
   */
  showCaptchaHelp() {
    NotificationHelper.info(
      'Select a detected CAPTCHA system from the dropdown, then click "Load Tools" to access specialized detection and monitoring features.'
    );
  }

  /**
   * Setup event listeners for advanced tools
   */
  setupAdvancedEventListeners() {
    // Help button
    const helpBtn = document.querySelector('#showCaptchaHelp');
    if (helpBtn) {
      helpBtn.addEventListener('click', () => this.showCaptchaHelp());
    }

    // Deep analysis button
    const runDeepAnalysisBtn = document.querySelector('#runDeepAnalysis');
    if (runDeepAnalysisBtn) {
      runDeepAnalysisBtn.addEventListener('click', () => this.runDeepAnalysis());
    }

    // Export options button
    const showExportBtn = document.querySelector('#showExportOptions');
    if (showExportBtn) {
      showExportBtn.addEventListener('click', () => this.showExportModal());
    }

    // Generate report button
    const generateReportBtn = document.querySelector('#generateReport');
    if (generateReportBtn) {
      generateReportBtn.addEventListener('click', () => this.generateSecurityReport());
    }

    // Bypass analysis button
    const analyzeBypassBtn = document.querySelector('#analyzeBypass');
    if (analyzeBypassBtn) {
      analyzeBypassBtn.addEventListener('click', () => this.analyzeBypassTechniques());
    }

    // Reload detectors button
    const reloadDetectorsBtn = document.querySelector('#reloadDetectors');
    if (reloadDetectorsBtn) {
      reloadDetectorsBtn.addEventListener('click', () => this.reloadDetectorsFromJSON());
    }

    // Clear results button
    const clearResultsBtn = document.querySelector('#clearResults');
    if (clearResultsBtn) {
      clearResultsBtn.addEventListener('click', () => this.clearAnalysisResults());
    }

    // Export modal handlers
    const closeExportBtn = document.querySelector('#closeExportModal');
    if (closeExportBtn) {
      closeExportBtn.addEventListener('click', () => this.hideExportModal());
    }

    // Export option handlers
    document.querySelectorAll('.export-option').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const format = e.target.dataset.format;
        this.exportData(format);
      });
    });
  }

  /**
   * Run deep analysis with advanced algorithms
   */
  async runDeepAnalysis() {
    if (this.isRunningAnalysis) return;

    this.isRunningAnalysis = true;
    const btn = document.querySelector('#runDeepAnalysis');
    const btnText = btn?.querySelector('.btn-text');
    const btnSpinner = btn?.querySelector('.btn-spinner');

    try {
      // Update UI to show loading
      if (btnText) btnText.textContent = 'Analyzing...';
      if (btnSpinner) btnSpinner.style.display = 'block';
      if (btn) btn.disabled = true;

      // Get current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) throw new Error('No active tab found');

      // Simulate deep analysis (in real implementation, this would be more comprehensive)
      console.log('Running deep analysis on:', tab.url);

      const analysisData = await this.performDeepAnalysis(tab);
      this.displayAnalysisResults(analysisData);

    } catch (error) {
      console.error('Deep analysis failed:', error);
      this.displayError('Failed to run deep analysis: ' + error.message);
    } finally {
      // Reset UI
      if (btnText) btnText.textContent = 'Run Analysis';
      if (btnSpinner) btnSpinner.style.display = 'none';
      if (btn) btn.disabled = false;
      this.isRunningAnalysis = false;
    }
  }

  /**
   * Perform deep analysis (placeholder implementation)
   * @param {object} tab - Chrome tab object
   * @returns {object} Analysis results
   */
  async performDeepAnalysis(tab) {
    // Simulate analysis delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    const detectors = this.detectorManager.getAllDetectors();
    const categories = Object.keys(detectors);

    return {
      url: tab.url,
      title: tab.title,
      timestamp: new Date().toISOString(),
      totalDetectors: Object.values(detectors).reduce((sum, cat) => sum + Object.keys(cat).length, 0),
      categories: categories.length,
      detectionScore: Math.floor(Math.random() * 100) + 1,
      riskLevel: this.calculateRiskLevel(Math.floor(Math.random() * 100) + 1),
      recommendations: this.generateRecommendations(),
      detectedSystems: this.generateMockDetections()
    };
  }

  /**
   * Display analysis results
   * @param {object} results - Analysis results
   */
  displayAnalysisResults(results) {
    this.analysisResults = results;

    const analysisResults = document.querySelector('#analysisResults');
    const resultsContent = document.querySelector('#resultsContent');

    if (!analysisResults || !resultsContent) return;

    const resultsHtml = `
      <div class="analysis-summary">
        <div class="summary-stat">
          <span class="stat-label">Detection Score</span>
          <span class="stat-value ${this.getScoreClass(results.detectionScore)}">${results.detectionScore}/100</span>
        </div>
        <div class="summary-stat">
          <span class="stat-label">Risk Level</span>
          <span class="stat-value risk-${results.riskLevel.toLowerCase()}">${results.riskLevel}</span>
        </div>
        <div class="summary-stat">
          <span class="stat-label">Systems Detected</span>
          <span class="stat-value">${results.detectedSystems.length}</span>
        </div>
      </div>

      <div class="detected-systems">
        <h5>Detected Security Systems</h5>
        <div class="systems-list">
          ${results.detectedSystems.map(system => `
            <div class="system-item">
              <span class="system-name">${system.name}</span>
              <span class="system-type">${system.type}</span>
              <span class="system-confidence">${system.confidence}%</span>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="recommendations">
        <h5>Recommendations</h5>
        <ul class="recommendations-list">
          ${results.recommendations.map(rec => `<li>${rec}</li>`).join('')}
        </ul>
      </div>
    `;

    resultsContent.innerHTML = resultsHtml;
    analysisResults.style.display = 'block';

    // Scroll to results
    analysisResults.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /**
   * Calculate risk level based on detection score
   * @param {number} score - Detection score
   * @returns {string} Risk level
   */
  calculateRiskLevel(score) {
    if (score >= 80) return 'High';
    if (score >= 60) return 'Medium';
    if (score >= 30) return 'Low';
    return 'Minimal';
  }

  /**
   * Get CSS class for detection score
   * @param {number} score - Detection score
   * @returns {string} CSS class name
   */
  getScoreClass(score) {
    if (score >= 80) return 'score-high';
    if (score >= 60) return 'score-medium';
    return 'score-low';
  }

  /**
   * Generate mock recommendations
   * @returns {Array} Array of recommendation strings
   */
  generateRecommendations() {
    const recommendations = [
      'Consider using residential proxies to avoid detection',
      'Implement request throttling to reduce suspicious activity',
      'Randomize user agent strings to appear more natural',
      'Use session persistence to maintain consistent behavior',
      'Monitor response patterns for detection indicators'
    ];

    return recommendations.slice(0, 3 + Math.floor(Math.random() * 3));
  }

  /**
   * Generate mock detected systems
   * @returns {Array} Array of detected system objects
   */
  generateMockDetections() {
    const systems = [
      { name: 'Cloudflare Bot Management', type: 'Anti-bot', confidence: 95 },
      { name: 'reCAPTCHA v3', type: 'Captcha', confidence: 87 },
      { name: 'FingerprintJS', type: 'Fingerprinting', confidence: 78 },
      { name: 'DataDome', type: 'Anti-bot', confidence: 92 },
      { name: 'PerimeterX', type: 'Bot Protection', confidence: 85 }
    ];

    return systems.slice(0, 2 + Math.floor(Math.random() * 4));
  }

  /**
   * Show export modal
   */
  showExportModal() {
    const exportModal = document.querySelector('#exportModal');
    if (exportModal) exportModal.style.display = 'flex';
  }

  /**
   * Hide export modal
   */
  hideExportModal() {
    const exportModal = document.querySelector('#exportModal');
    if (exportModal) exportModal.style.display = 'none';
  }

  /**
   * Export data in specified format
   * @param {string} format - Export format (json, csv, pdf, txt)
   */
  async exportData(format) {
    try {
      let data;
      let filename;
      let mimeType;

      switch (format) {
        case 'json':
          data = JSON.stringify(this.analysisResults, null, 2);
          filename = 'scrapfly-analysis.json';
          mimeType = 'application/json';
          break;
        case 'csv':
          data = this.convertToCSV(this.analysisResults);
          filename = 'scrapfly-analysis.csv';
          mimeType = 'text/csv';
          break;
        case 'txt':
          data = this.convertToText(this.analysisResults);
          filename = 'scrapfly-analysis.txt';
          mimeType = 'text/plain';
          break;
        case 'pdf':
          // PDF generation would require a library like jsPDF
          NotificationHelper.info('PDF export feature coming soon!', {
            duration: 3000
          });
          return;
        default:
          throw new Error('Unsupported format');
      }

      // Download file
      const blob = new Blob([data], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      console.log(`Exported data as ${format}`);
      this.hideExportModal();
      NotificationHelper.success(`Data exported successfully as ${format.toUpperCase()}`);

    } catch (error) {
      console.error('Export failed:', error);
      NotificationHelper.error('Export failed: ' + error.message);
    }
  }

  /**
   * Convert analysis results to CSV format
   * @param {object} results - Analysis results
   * @returns {string} CSV data
   */
  convertToCSV(results) {
    if (!results) return '';

    let csv = 'Property,Value\n';
    csv += `URL,${results.url}\n`;
    csv += `Detection Score,${results.detectionScore}\n`;
    csv += `Risk Level,${results.riskLevel}\n`;
    csv += `Systems Detected,${results.detectedSystems?.length || 0}\n`;

    if (results.detectedSystems) {
      csv += '\nDetected Systems\n';
      csv += 'Name,Type,Confidence\n';
      results.detectedSystems.forEach(system => {
        csv += `${system.name},${system.type},${system.confidence}\n`;
      });
    }

    return csv;
  }

  /**
   * Convert analysis results to text format
   * @param {object} results - Analysis results
   * @returns {string} Text data
   */
  convertToText(results) {
    if (!results) return '';

    let text = 'Scrapfly Security Analysis Report\n';
    text += '=' .repeat(40) + '\n\n';
    text += `URL: ${results.url}\n`;
    text += `Analysis Time: ${new Date(results.timestamp).toLocaleString()}\n`;
    text += `Detection Score: ${results.detectionScore}/100\n`;
    text += `Risk Level: ${results.riskLevel}\n\n`;

    if (results.detectedSystems?.length) {
      text += 'Detected Security Systems:\n';
      text += '-'.repeat(30) + '\n';
      results.detectedSystems.forEach(system => {
        text += `• ${system.name} (${system.type}) - ${system.confidence}% confidence\n`;
      });
      text += '\n';
    }

    if (results.recommendations?.length) {
      text += 'Recommendations:\n';
      text += '-'.repeat(20) + '\n';
      results.recommendations.forEach((rec, index) => {
        text += `${index + 1}. ${rec}\n`;
      });
    }

    return text;
  }

  /**
   * Generate security report
   */
  generateSecurityReport() {
    console.log('Generating security report...');
    NotificationHelper.info('Security report generation feature coming soon!', {
      duration: 3000
    });
  }

  /**
   * Analyze bypass techniques
   */
  analyzeBypassTechniques() {
    console.log('Analyzing bypass techniques...');
    NotificationHelper.info('Bypass analysis feature coming soon!', {
      duration: 3000
    });
  }

  /**
   * Clear analysis results
   */
  clearAnalysisResults() {
    const analysisResults = document.querySelector('#analysisResults');
    if (analysisResults) analysisResults.style.display = 'none';
    this.analysisResults = null;
  }

  /**
   * Display error message
   * @param {string} message - Error message
   */
  displayError(message) {
    const resultsContent = document.querySelector('#resultsContent');
    const analysisResults = document.querySelector('#analysisResults');

    if (resultsContent && analysisResults) {
      resultsContent.innerHTML = `
        <div class="error-message">
          <div class="error-icon">⚠️</div>
          <div class="error-text">${message}</div>
        </div>
      `;
      analysisResults.style.display = 'block';
    }
  }

  /**
   * Initialize advanced section
   */
  async initialize() {
    await this.loadHTML();
    console.log('Advanced section initialized');
  }

  /**
   * Reload detectors from JSON files (fixes corrupted data)
   */
  async reloadDetectorsFromJSON() {
    const reloadBtn = document.querySelector('#reloadDetectors');

    if (reloadBtn) {
      const originalText = reloadBtn.textContent;
      reloadBtn.textContent = 'Reloading...';
      reloadBtn.disabled = true;
    }

    try {
      // Use NotificationHelper to show loading message
      const loader = NotificationHelper.loading('Reloading detectors from JSON files...');

      // Call the reloadFromJSON method from DetectorManager
      const success = await this.detectorManager.reloadFromJSON();

      // Close the loader
      loader.close();

      if (success) {
        NotificationHelper.success('Detectors reloaded successfully from JSON files');

        // Refresh the Rules section if it's visible
        const rulesTab = document.querySelector('#rulesTab');
        if (rulesTab && rulesTab.style.display !== 'none') {
          // If Rules section exists, refresh it
          if (window.popup && window.popup.rules) {
            await window.popup.rules.displayRules();
          }
        }

        // Re-render advanced interface
        this.displayAdvancedTools();
      } else {
        NotificationHelper.error('Failed to reload detectors from JSON files');
      }
    } catch (error) {
      console.error('Error reloading detectors:', error);
      NotificationHelper.error('Error: ' + error.message);
    } finally {
      if (reloadBtn) {
        reloadBtn.textContent = 'Reload from JSON';
        reloadBtn.disabled = false;
      }
    }
  }

  /**
   * Load HTML template into advanced tab
   */
  async loadHTML() {
    try {
      const response = await fetch(chrome.runtime.getURL('Sections/Advanced/advanced.html'));
      const html = await response.text();

      const advancedTab = document.querySelector('#advancedTab');
      if (advancedTab) {
        advancedTab.innerHTML = html;
      }
    } catch (error) {
      console.error('Failed to load advanced HTML:', error);
    }
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Advanced;
} else if (typeof window !== 'undefined') {
  window.Advanced = Advanced;
}