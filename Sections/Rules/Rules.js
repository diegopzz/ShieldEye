class Rules {
  constructor(detectorManager) {
    this.detectorManager = detectorManager;
    this.categoryManager = detectorManager.getCategoryManager();
    this.initialized = false;
    this.paginationManager = null;
    this.colorManager = null;
    this.searchManager = null;
    this.allDetectors = [];
    this.filteredDetectors = [];
  }

  /**
   * Initialize rules section
   */
  async initialize() {
    if (!this.initialized) {
      await this.loadHTML();
      this.setupPagination();
      this.initializeColorManager();
      this.initializeSearchManager();
      this.setupEventListeners();
      this.initialized = true;
    }
  }

  /**
   * Load HTML template into rules tab
   */
  async loadHTML() {
    try {
      const response = await fetch(chrome.runtime.getURL('Sections/Rules/rules.html'));
      const html = await response.text();

      const rulesTab = document.querySelector('#rulesTab');
      if (rulesTab) {
        rulesTab.innerHTML = html;
      }
    } catch (error) {
      console.error('Failed to load rules HTML:', error);
    }
  }

  /**
   * Setup pagination manager
   */
  setupPagination() {
    this.paginationManager = new PaginationManager('rulesPagination', {
      itemsPerPage: 2,
      onPageChange: (page, items) => {
        this.renderDetectorsPage(items);
      }
    });
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Search functionality
    const searchInput = document.querySelector('#rulesSearch');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.handleSearch(e.target.value);
      });
    }

    // Button event listeners
    this.setupButtonListeners();

    // Modal functionality
    this.setupModalEventListeners();

    // Toggle switches - handle enable/disable
    document.addEventListener('change', (e) => {
      if (e.target.classList.contains('detector-toggle')) {
        const toggle = e.target;
        const detectorName = toggle.dataset.detector;
        const category = toggle.dataset.category;
        const enabled = toggle.checked;

        if (detectorName && category) {
          this.updateDetectorEnabledState(category, detectorName, enabled);
        }
      }
    });
  }

  /**
   * Setup button event listeners
   */
  setupButtonListeners() {
    // Import button
    const importBtn = document.querySelector('#importRulesBtn');
    const importFile = document.querySelector('#importRulesFile');
    if (importBtn && importFile) {
      importBtn.addEventListener('click', () => importFile.click());
      importFile.addEventListener('change', (e) => this.handleImport(e));
    }

    // Export button
    const exportBtn = document.querySelector('#exportRulesBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.handleExport());
    }

    // Clear button
    const clearBtn = document.querySelector('#clearRulesBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.handleClear());
    }

    // Add button
    const addBtn = document.querySelector('#addDetectorBtn');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.handleAddDetector());
    }
  }

  /**
   * Initialize color manager
   */
  initializeColorManager() {
    this.colorManager = new ColorManager();
    this.colorManager.initialize({
      onColorSelect: (color) => {
        console.log('Color selected:', color);
        // Handle color selection
        if (this.currentEditDetector) {
          this.currentEditDetector.detector.color = color;
        }
      },
      onColorChange: (color) => {
        console.log('Color changed:', color);
      }
    });
  }

  /**
   * Initialize search manager
   */
  initializeSearchManager() {
    if (typeof SearchManager !== 'undefined') {
      this.searchManager = new SearchManager({
        caseSensitive: false,
        searchOperator: 'AND'
      });
    } else {
      console.warn('SearchManager not loaded');
    }
  }

  /**
   * Setup modal event listeners
   */
  setupModalEventListeners() {
    // Close modal events
    const closeBtn = document.querySelector('#closeRuleModal');
    const cancelBtn = document.querySelector('#cancelRuleEdit');
    const backdrop = document.querySelector('.rule-modal-backdrop');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeEditModal());
    }
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.closeEditModal());
    }
    if (backdrop) {
      backdrop.addEventListener('click', () => this.closeEditModal());
    }

    // Save button
    const saveBtn = document.querySelector('#saveRuleEdit');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.saveRule());
    }

    // Change Icon button
    const changeIconBtn = document.querySelector('.change-icon-btn');
    if (changeIconBtn) {
      changeIconBtn.addEventListener('click', () => this.openIconPicker());
    }

    // Setup method settings modal
    this.setupMethodSettingsModal();

    // Setup DOM helper modal
    this.setupDomHelperModal();

    // Setup Regex helper modal
    this.setupRegexHelperModal();
  }

  /**
   * Setup method settings modal event listeners
   */
  setupMethodSettingsModal() {
    const modal = document.querySelector('#methodSettingsModal');
    const closeBtn = document.querySelector('#closeMethodSettings');
    const cancelBtn = document.querySelector('#cancelMethodSettings');
    const saveBtn = document.querySelector('#saveMethodSettings');
    const backdrop = modal?.querySelector('.rule-modal-backdrop');
    const slider = document.querySelector('#confidenceSlider');
    const valueDisplay = document.querySelector('#confidenceValue');

    // Close modal events
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeMethodSettingsModal());
    }
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.closeMethodSettingsModal());
    }
    if (backdrop) {
      backdrop.addEventListener('click', () => this.closeMethodSettingsModal());
    }

    // Save button
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.saveMethodSettings());
    }

    // Update confidence value display when slider changes
    if (slider && valueDisplay) {
      slider.addEventListener('input', (e) => {
        valueDisplay.textContent = e.target.value;
      });
    }

    // Setup click handlers for settings buttons (using event delegation)
    document.addEventListener('click', (e) => {
      if (e.target.closest('.method-action-btn.settings')) {
        e.stopPropagation();
        const button = e.target.closest('.method-action-btn.settings');
        const methodItem = button.closest('.method-item');
        if (methodItem) {
          this.openMethodSettingsModal(methodItem);
        }
      }

      // Handle delete button
      if (e.target.closest('.method-action-btn.delete')) {
        e.stopPropagation();
        const button = e.target.closest('.method-action-btn.delete');
        const methodItem = button.closest('.method-item');
        if (methodItem) {
          methodItem.remove();
        }
      }

      // Handle add method button
      if (e.target.closest('.add-method-btn')) {
        e.stopPropagation();
        const button = e.target.closest('.add-method-btn');
        this.addNewMethodItem(button);
      }

      // Handle add section button
      if (e.target.closest('.add-section-btn')) {
        e.stopPropagation();
        this.addNewMethodSection();
      }
    });
  }

  /**
   * Open method settings modal for a specific method item
   * @param {HTMLElement} methodItem - The method item element
   */
  openMethodSettingsModal(methodItem) {
    const modal = document.querySelector('#methodSettingsModal');
    if (!modal) return;

    // Store reference to current method item
    this.currentMethodItem = methodItem;

    // Determine method type from the method item
    const methodKey = methodItem.querySelector('.method-input')?.dataset.methodKey || '';
    const isContentMethod = methodKey === 'content';

    // Load current settings from data attributes
    const confidence = methodItem.dataset.confidence || '100';
    const nameRegex = methodItem.dataset.nameRegex === 'true';
    const nameWholeword = methodItem.dataset.nameWholeword === 'true';
    const nameCase = methodItem.dataset.nameCase === 'true';
    const valueRegex = methodItem.dataset.valueRegex === 'true';
    const valueWholeword = methodItem.dataset.valueWholeword === 'true';
    const valueCase = methodItem.dataset.valueCase === 'true';
    const checkScripts = methodItem.dataset.checkScripts === 'true'; // Default: false (entire page)
    const checkClasses = methodItem.dataset.checkClasses === 'true'; // Default: false (entire page)
    const checkValues = methodItem.dataset.checkValues === 'true'; // Default: false (entire page)

    // Set values in modal
    const confidenceSlider = document.querySelector('#confidenceSlider');
    const confidenceValue = document.querySelector('#confidenceValue');

    if (confidenceSlider) confidenceSlider.value = confidence;
    if (confidenceValue) confidenceValue.textContent = confidence;

    // Set checkboxes
    const setCheckbox = (id, value) => {
      const checkbox = document.querySelector(`#${id}`);
      if (checkbox) checkbox.checked = value;
    };

    setCheckbox('nameRegex', nameRegex);
    setCheckbox('nameWholeWord', nameWholeword);
    setCheckbox('nameCaseSensitive', nameCase);
    setCheckbox('valueRegex', valueRegex);
    setCheckbox('valueWholeWord', valueWholeword);
    setCheckbox('valueCaseSensitive', valueCase);
    setCheckbox('checkScripts', checkScripts);
    setCheckbox('checkClasses', checkClasses);
    setCheckbox('checkValues', checkValues);

    // Show/hide Content Search Scope section based on method type
    const contentScopeGroup = document.querySelector('#contentScopeGroup');
    if (contentScopeGroup) {
      contentScopeGroup.style.display = isContentMethod ? 'block' : 'none';
    }

    // Determine if this is a single-input type (no value field)
    const singleInputTypes = ['urls', 'url', 'content', 'dom'];
    const isSingleInput = singleInputTypes.includes(methodKey);

    // Update field titles based on method type
    const patternOptionsTitle = document.querySelector('#patternOptionsTitle');
    const valueFieldGroup = document.querySelector('#valueFieldOptionsGroup');

    if (patternOptionsTitle) {
      if (methodKey === 'urls' || methodKey === 'url') {
        patternOptionsTitle.textContent = 'URL Pattern Matching';
      } else if (methodKey === 'content') {
        patternOptionsTitle.textContent = 'Text/Word Matching';
      } else if (methodKey === 'dom') {
        patternOptionsTitle.textContent = 'DOM Selector Matching';
      } else {
        patternOptionsTitle.textContent = 'Name Field Matching';
      }
    }

    // Hide/show VALUE field options for single-input types
    if (valueFieldGroup) {
      valueFieldGroup.style.display = isSingleInput ? 'none' : 'block';
    }

    // Show modal
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  /**
   * Update visual indicators for method inputs
   * @param {HTMLElement} methodItem - The method item element
   */
  updateMethodIndicators(methodItem) {
    const nameInput = methodItem.querySelector('.method-input.method-name');
    const valueInput = methodItem.querySelector('.method-input.method-value');

    if (nameInput) {
      const nameIndicator = nameInput.nextElementSibling;

      if (nameIndicator && nameIndicator.classList.contains('input-indicators')) {
        const indicators = [];

        // Only show badges if input has value
        const hasValue = nameInput.value.trim().length > 0;

        if (hasValue) {
          if (methodItem.dataset.nameRegex === 'true') indicators.push('RX');
          if (methodItem.dataset.nameWholeword === 'true') indicators.push('WW');
          if (methodItem.dataset.nameCase === 'true') indicators.push('CS');
        }

        nameIndicator.innerHTML = indicators.map(ind =>
          `<span class="indicator-badge" data-type="${ind}">${ind}</span>`
        ).join('');
      }
    }

    if (valueInput) {
      const valueIndicator = valueInput.nextElementSibling;
      if (valueIndicator && valueIndicator.classList.contains('input-indicators')) {
        const indicators = [];

        // Only show badges if input has value
        const hasValue = valueInput.value.trim().length > 0;

        if (hasValue) {
          if (methodItem.dataset.valueRegex === 'true') indicators.push('RX');
          if (methodItem.dataset.valueWholeword === 'true') indicators.push('WW');
          if (methodItem.dataset.valueCase === 'true') indicators.push('CS');
        }

        valueIndicator.innerHTML = indicators.map(ind =>
          `<span class="indicator-badge" data-type="${ind}">${ind}</span>`
        ).join('');
      }
    }
  }

  /**
   * Close method settings modal
   */
  closeMethodSettingsModal() {
    const modal = document.querySelector('#methodSettingsModal');
    if (modal) {
      modal.style.display = 'none';
      document.body.style.overflow = '';
      this.currentMethodItem = null;
    }
  }

  /**
   * Setup DOM helper modal event listeners
   */
  setupDomHelperModal() {
    const modal = document.querySelector('#domHelperModal');
    const closeBtn = document.querySelector('#closeDomHelper');
    const cancelBtn = document.querySelector('#cancelDomHelper');
    const useBtn = document.querySelector('#useDomSelector');
    const backdrop = modal?.querySelector('.rule-modal-backdrop');
    const customInput = document.querySelector('#domCustomInput');

    // Close modal events
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeDomHelperModal());
    }
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.closeDomHelperModal());
    }
    if (backdrop) {
      backdrop.addEventListener('click', () => this.closeDomHelperModal());
    }

    // Use selector button
    if (useBtn) {
      useBtn.addEventListener('click', () => this.useDomSelector());
    }

    // Setup click handlers for DOM helper button and templates (using event delegation)
    document.addEventListener('click', (e) => {
      // Handle DOM helper button clicks
      if (e.target.closest('.dom-helper-btn')) {
        e.stopPropagation();
        const button = e.target.closest('.dom-helper-btn');
        const inputIndex = button.dataset.inputIndex;
        const methodItem = button.closest('.method-item');
        if (methodItem) {
          this.openDomHelperModal(methodItem, inputIndex);
        }
      }

      // Handle template clicks
      if (e.target.closest('.dom-template')) {
        e.stopPropagation();
        const template = e.target.closest('.dom-template');
        const templateCode = template.querySelector('.template-code')?.textContent;
        if (templateCode && customInput) {
          customInput.value = templateCode;
          customInput.focus();
        }
      }
    });
  }

  /**
   * Open DOM helper modal for a specific method item
   * @param {HTMLElement} methodItem - The method item element
   * @param {string} inputIndex - Index of the input field
   */
  openDomHelperModal(methodItem, inputIndex) {
    const modal = document.querySelector('#domHelperModal');
    if (!modal) return;

    // Store reference to current method item
    this.currentDomMethodItem = methodItem;

    // Get current DOM selector value
    const nameInput = methodItem.querySelector('.method-input.method-name');
    const currentValue = nameInput?.value || '';

    // Set custom input to current value
    const customInput = document.querySelector('#domCustomInput');
    if (customInput) {
      customInput.value = currentValue;
    }

    // Show modal
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  /**
   * Use the selected DOM selector
   */
  useDomSelector() {
    const customInput = document.querySelector('#domCustomInput');
    const selector = customInput?.value.trim();

    if (!selector) {
      NotificationHelper.error('Please enter a selector');
      return;
    }

    // Update the DOM input field
    if (this.currentDomMethodItem) {
      const nameInput = this.currentDomMethodItem.querySelector('.method-input.method-name');
      if (nameInput) {
        nameInput.value = selector;
      }
    }

    // Close modal
    this.closeDomHelperModal();
  }

  /**
   * Close DOM helper modal
   */
  closeDomHelperModal() {
    const modal = document.querySelector('#domHelperModal');
    if (modal) {
      modal.style.display = 'none';
      document.body.style.overflow = '';
      this.currentDomMethodItem = null;
    }
  }

  /**
   * Setup Regex helper modal event listeners
   */
  setupRegexHelperModal() {
    const modal = document.querySelector('#regexHelperModal');
    const closeBtn = document.querySelector('#closeRegexHelper');
    const closeFooterBtn = document.querySelector('#closeRegexHelperBtn');
    const backdrop = modal?.querySelector('.rule-modal-backdrop');

    // Close modal events
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeRegexHelperModal());
    }
    if (closeFooterBtn) {
      closeFooterBtn.addEventListener('click', () => this.closeRegexHelperModal());
    }
    if (backdrop) {
      backdrop.addEventListener('click', () => this.closeRegexHelperModal());
    }

    // Setup click handlers for regex helper button and patterns
    document.addEventListener('click', (e) => {
      // Handle regex helper button click (for both name and value fields)
      if (e.target.closest('#regexHelperBtn') || e.target.closest('#regexHelperBtnValue')) {
        e.stopPropagation();
        this.openRegexHelperModal();
      }

      // Handle regex pattern clicks - insert into input field
      if (e.target.closest('.regex-pattern')) {
        e.stopPropagation();
        const pattern = e.target.closest('.regex-pattern');
        const patternText = pattern.dataset.pattern;

        if (patternText && this.currentMethodItem) {
          // Insert pattern into the input field
          const nameInput = this.currentMethodItem.querySelector('.method-input.method-name');
          if (nameInput) {
            nameInput.value = patternText;

            // Auto-enable regex checkbox in the method settings
            this.currentMethodItem.dataset.nameRegex = 'true';

            // Update visual indicators
            this.updateMethodIndicators(this.currentMethodItem);

            // Show success message
            NotificationHelper.success('Pattern applied & Regex enabled!');

            // Close modal
            this.closeRegexHelperModal();
          }
        }
      }
    });
  }

  /**
   * Open Regex helper modal
   */
  openRegexHelperModal() {
    const modal = document.querySelector('#regexHelperModal');
    if (!modal) return;

    // Auto-enable regex toggle when opening helper
    if (this.currentMethodItem) {
      this.currentMethodItem.dataset.nameRegex = 'true';
      this.updateMethodIndicators(this.currentMethodItem);
    }

    // Get current input value from the method item (if available from currentMethodItem)
    let userInput = '';
    if (this.currentMethodItem) {
      const nameInput = this.currentMethodItem.querySelector('.method-input.method-name');
      userInput = nameInput?.value.trim() || '';
    }

    // Show/hide user input preview and generate suggestions
    const userInputPreview = document.querySelector('#userInputPreview');
    const currentInputText = document.querySelector('#currentInputText');
    const suggestedPatterns = document.querySelector('#suggestedPatterns');
    const suggestedPatternsContainer = document.querySelector('#suggestedPatternsContainer');

    if (userInput && userInputPreview && currentInputText && suggestedPatterns && suggestedPatternsContainer) {
      // Show user's input
      userInputPreview.style.display = 'block';
      currentInputText.textContent = userInput;

      // Generate suggested patterns
      const suggestions = this.generateRegexSuggestions(userInput);
      suggestedPatternsContainer.innerHTML = suggestions.map(s => `
        <div class="regex-pattern" data-pattern="${s.pattern}">
          <div class="template-code">${s.pattern}</div>
          <div class="template-description">${s.description}</div>
        </div>
      `).join('');
      suggestedPatterns.style.display = 'block';
    } else {
      if (userInputPreview) userInputPreview.style.display = 'none';
      if (suggestedPatterns) suggestedPatterns.style.display = 'none';
    }

    // Show modal
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  /**
   * Generate regex pattern suggestions based on user input
   * @param {string} input - User's input text
   * @returns {Array} - Array of suggestion objects with pattern and description
   */
  generateRegexSuggestions(input) {
    const escaped = input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const suggestions = [];

    // Exact match (escaped)
    suggestions.push({
      pattern: escaped,
      description: 'Exact match (special chars escaped)'
    });

    // Starts with
    suggestions.push({
      pattern: `^${escaped}`,
      description: 'Starts with your text'
    });

    // Ends with
    suggestions.push({
      pattern: `${escaped}$`,
      description: 'Ends with your text'
    });

    // Contains anywhere
    suggestions.push({
      pattern: `.*${escaped}.*`,
      description: 'Contains your text anywhere'
    });

    // Word boundary (whole word)
    suggestions.push({
      pattern: `\\b${escaped}\\b`,
      description: 'Exact word match (with boundaries)'
    });

    // Case insensitive hint
    if (input !== input.toLowerCase() && input !== input.toUpperCase()) {
      suggestions.push({
        pattern: escaped,
        description: 'Note: Toggle "Case Sensitive" OFF to ignore case'
      });
    }

    return suggestions;
  }

  /**
   * Close Regex helper modal
   */
  closeRegexHelperModal() {
    const modal = document.querySelector('#regexHelperModal');
    if (modal) {
      modal.style.display = 'none';
      document.body.style.overflow = '';
    }
  }

  /**
   * Open icon picker dialog
   */
  openIconPicker() {
    // List of available icons
    const availableIcons = [
      'custom.png',
      'akamai_official.png',
      'aws_official.png',
      'cloudflare_official.png',
      'datadome_official.png',
      'f5_official.png',
      'funcaptcha_official.png',
      'geetest_official.png',
      'hcaptcha_official.png',
      'imperva_official.png',
      'perimeterx_official.png',
      'reblaze_official.png',
      'recaptcha_official.png',
      'sucuri_official.png'
    ];

    // Create modal HTML
    const modalHtml = `
      <div class="icon-picker-modal" style="display: flex; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 10000; align-items: center; justify-content: center;">
        <div class="icon-picker-content" style="background: var(--bg-primary); border-radius: 8px; padding: 20px; max-width: 500px; max-height: 80vh; overflow-y: auto;">
          <h3 style="margin: 0 0 16px 0; font-size: 16px;">Choose Icon</h3>
          <div class="icon-grid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px;">
            ${availableIcons.map(icon => `
              <div class="icon-option" data-icon="${icon}" style="cursor: pointer; padding: 12px; border: 2px solid var(--border); border-radius: 6px; text-align: center; transition: all 0.2s;">
                <img src="${chrome.runtime.getURL('detectors/icons/' + icon)}" style="width: 48px; height: 48px; object-fit: contain; margin-bottom: 4px;" />
                <div style="font-size: 9px; color: var(--text-muted); word-break: break-word;">${icon.replace('_official.png', '').replace('.png', '')}</div>
              </div>
            `).join('')}
          </div>
          <div style="border-top: 1px solid var(--border); padding-top: 16px; margin-top: 16px;">
            <button id="uploadCustomIcon" style="width: 100%; padding: 10px; background: var(--accent); color: white; border: none; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; margin-bottom: 8px;">
              Upload Custom Icon
            </button>
            <button id="cancelIconPicker" style="width: 100%; padding: 10px; background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border); border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer;">
              Cancel
            </button>
          </div>
        </div>
      </div>
    `;

    // Add modal to page
    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHtml;
    document.body.appendChild(modalContainer);

    // Add hover effects
    const iconOptions = modalContainer.querySelectorAll('.icon-option');
    iconOptions.forEach(option => {
      option.addEventListener('mouseenter', () => {
        option.style.borderColor = 'var(--accent)';
        option.style.background = 'var(--bg-secondary)';
      });
      option.addEventListener('mouseleave', () => {
        option.style.borderColor = 'var(--border)';
        option.style.background = 'transparent';
      });
      option.addEventListener('click', () => {
        const iconName = option.dataset.icon;
        this.selectIcon(iconName);
        document.body.removeChild(modalContainer);
      });
    });

    // Upload custom icon button
    const uploadBtn = modalContainer.querySelector('#uploadCustomIcon');
    uploadBtn.addEventListener('click', () => {
      document.body.removeChild(modalContainer);
      this.uploadCustomIcon();
    });

    // Cancel button
    const cancelBtn = modalContainer.querySelector('#cancelIconPicker');
    cancelBtn.addEventListener('click', () => {
      document.body.removeChild(modalContainer);
    });

    // Close on backdrop click
    const modal = modalContainer.querySelector('.icon-picker-modal');
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modalContainer);
      }
    });
  }

  /**
   * Select an icon from the available icons
   */
  selectIcon(iconName) {
    // Update current icon display in modal
    const currentIcon = document.querySelector('#currentDetectorIcon');
    if (currentIcon) {
      currentIcon.src = chrome.runtime.getURL('detectors/icons/' + iconName);
    }

    // Store the icon in the detector
    if (this.currentEditDetector) {
      this.currentEditDetector.detector.icon = iconName;
      // Remove custom icon if one was set
      delete this.currentEditDetector.detector.customIcon;
      delete this.currentEditDetector.customIcon;
    }
  }

  /**
   * Upload a custom icon file
   */
  uploadCustomIcon() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (file) {
        // Check file size (limit to 100KB)
        if (file.size > 100 * 1024) {
          NotificationHelper.error('Icon file size must be less than 100KB');
          return;
        }

        // Read file as data URL
        const reader = new FileReader();
        reader.onload = (event) => {
          const dataUrl = event.target.result;

          // Update current icon display in modal
          const currentIcon = document.querySelector('#currentDetectorIcon');
          if (currentIcon) {
            currentIcon.src = dataUrl;
          }

          // Store the new icon data URL in the detector
          if (this.currentEditDetector) {
            this.currentEditDetector.customIcon = dataUrl;
            this.currentEditDetector.detector.customIcon = dataUrl;
          }
        };
        reader.readAsDataURL(file);
      }
    };

    input.click();
  }

  /**
   * Save method settings from modal to method item
   */
  saveMethodSettings() {
    if (!this.currentMethodItem) return;

    // Get values from modal
    const confidence = parseInt(document.querySelector('#confidenceSlider')?.value || '100', 10);
    const nameRegex = document.querySelector('#nameRegex')?.checked || false;
    const nameWholeWord = document.querySelector('#nameWholeWord')?.checked || false;
    const nameCaseSensitive = document.querySelector('#nameCaseSensitive')?.checked || false;
    const valueRegex = document.querySelector('#valueRegex')?.checked || false;
    const valueWholeWord = document.querySelector('#valueWholeWord')?.checked || false;
    const valueCaseSensitive = document.querySelector('#valueCaseSensitive')?.checked || false;
    const checkScripts = document.querySelector('#checkScripts')?.checked || false; // Default: false (entire page)
    const checkClasses = document.querySelector('#checkClasses')?.checked || false; // Default: false (entire page)
    const checkValues = document.querySelector('#checkValues')?.checked || false; // Default: false (entire page)

    // Save to data attributes
    this.currentMethodItem.dataset.confidence = confidence;
    this.currentMethodItem.dataset.nameRegex = nameRegex;
    this.currentMethodItem.dataset.nameWholeword = nameWholeWord;
    this.currentMethodItem.dataset.nameCase = nameCaseSensitive;
    this.currentMethodItem.dataset.valueRegex = valueRegex;
    this.currentMethodItem.dataset.valueWholeword = valueWholeWord;
    this.currentMethodItem.dataset.valueCase = valueCaseSensitive;
    this.currentMethodItem.dataset.checkScripts = checkScripts;
    this.currentMethodItem.dataset.checkClasses = checkClasses;
    this.currentMethodItem.dataset.checkValues = checkValues;

    // Add visual indicator if settings are configured
    const settingsBtn = this.currentMethodItem.querySelector('.method-action-btn.settings');
    if (settingsBtn) {
      // Get method type to check if content search scope settings apply
      const methodType = this.currentMethodItem.dataset.methodType;

      // Don't consider confidence alone as a custom setting for the visual indicator
      const hasCustomSettings = nameRegex || nameWholeWord || nameCaseSensitive ||
        valueRegex || valueWholeWord || valueCaseSensitive ||
        (methodType === 'content' && (checkScripts === true || checkClasses === true || checkValues === true))

      if (hasCustomSettings) {
        settingsBtn.classList.add('has-custom-settings');
      } else {
        settingsBtn.classList.remove('has-custom-settings');
      }
      // Always show confidence in tooltip
      settingsBtn.title = `Settings (Confidence: ${confidence}%)`;
    }

    // Update input indicators
    this.updateMethodIndicators(this.currentMethodItem);

    // Close modal
    this.closeMethodSettingsModal();
  }


  /**
   * Open edit modal for a detector rule
   * @param {object} detector - Detector data
   * @param {string} category - Detector category
   * @param {string} detectorName - Detector name
   */
  openEditModal(detector, category, detectorName, isNew = false) {
    const modal = document.querySelector('#editRuleModal');
    const title = document.querySelector('#editRuleModalTitle');

    if (!modal || !title) return;

    // Ensure detector has detection property before storing
    const detectorWithDetection = {
      ...detector,
      detection: detector.detection || {
        urls: [],
        headers: [],
        cookies: [],
        content: [],
        dom: []
      }
    };

    // Store current detector data BEFORE populating modal
    // Explicitly set isNew based on the parameter, not previous state
    this.currentEditDetector = {
      detector: detectorWithDetection,
      category,
      detectorName,
      isNew: isNew
    };

    // Set dynamic title based on whether it's a new detector
    const action = this.currentEditDetector.isNew ? 'Add' : 'Edit';
    title.textContent = `${action} ${detectorWithDetection.displayName || detectorName} Detection Rule`;

    // Populate modal with detector data (now currentEditDetector is available)
    this.populateModalData(detectorWithDetection);

    // Show modal
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
  }

  /**
   * Close edit modal
   */
  closeEditModal() {
    const modal = document.querySelector('#editRuleModal');
    if (modal) {
      modal.style.display = 'none';
      document.body.style.overflow = ''; // Restore scrolling
      this.currentEditDetector = null;
    }
  }

  /**
   * Populate modal with detector data
   * @param {object} detector - Detector data
   */
  populateModalData(detector) {
    // Populate detector information fields
    const nameInput = document.querySelector('#detectorNameInput');
    const categorySelect = document.querySelector('#detectorCategorySelect');
    const iconImg = document.querySelector('#currentDetectorIcon');

    if (nameInput) {
      nameInput.value = detector.name || detector.displayName || '';
    }

    if (categorySelect) {
      // Use the category from currentEditDetector or detector object
      const category = this.currentEditDetector?.category || detector.category || 'antibot';
      console.log('Setting category:', category); // Debug log
      categorySelect.value = category;
    }

    if (iconImg) {
      // Check for custom icon first
      if (detector.customIcon) {
        iconImg.src = detector.customIcon;
      } else if (detector.icon) {
        // Handle different icon types
        if (detector.icon.startsWith('http') || detector.icon.startsWith('/')) {
          iconImg.src = detector.icon;
        } else if (detector.icon.includes('.png') || detector.icon.includes('.jpg') || detector.icon.includes('.svg')) {
          iconImg.src = chrome.runtime.getURL(`detectors/icons/${detector.icon}`);
        } else {
          // It's an emoji or text, create a data URL
          const canvas = document.createElement('canvas');
          canvas.width = 32;
          canvas.height = 32;
          const ctx = canvas.getContext('2d');
          ctx.font = '20px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(detector.icon, 16, 16);
          iconImg.src = canvas.toDataURL();
        }
      }
    }

    // Set badge color using ColorManager
    if (this.colorManager) {
      const colorToSet = detector.color || '#3b82f6'; // Default to blue if no color
      console.log('Loading detector color:', detector.name, 'Color:', colorToSet);
      this.colorManager.setColor(colorToSet);

      // If it's a custom color, make sure it's stored on the rainbow picker
      const presetColors = this.colorManager.getPresetColors();
      if (!presetColors.includes(colorToSet)) {
        const rainbowPicker = document.querySelector('#rainbowPicker');
        if (rainbowPicker) {
          rainbowPicker.dataset.customColor = colorToSet;
        }
      }
    }

    // Populate detection methods
    this.populateDetectionMethods(detector);
  }

  /**
   * Populate detection methods in modal
   * @param {object} detector - Detector data
   */
  populateDetectionMethods(detector) {
    const container = document.querySelector('#detectionMethodsContainer');
    if (!container) return;

    // Ensure detector has a detection property
    if (!detector.detection) {
      detector.detection = {
        urls: [],
        headers: [],
        cookies: [],
        content: [],
        dom: []
      };
    }

    let methodsHtml = '';

    // Define all possible method types (matching detector data structure)
    const allMethodTypes = ['urls', 'headers', 'cookies', 'content', 'dom'];
    // Support legacy 'scripts' type (maps to 'content')
    const legacyTypes = { 'scripts': 'content' };

    // Iterate through all method types to ensure all sections are shown
    allMethodTypes.forEach(methodType => {
      // Get methods from detector data (support legacy 'scripts' key)
      let methodsData = detector.detection?.[methodType];
      if (!methodsData && methodType === 'content') {
        // Check for legacy 'scripts' key
        methodsData = detector.detection?.['scripts'];
      }
      // Show section even if empty
      const displayName = methodType === 'content' ? 'CONTENT' :
                         methodType === 'dom' ? 'DOM' :
                        methodType === 'urls' ? 'URL' :
                        methodType.toUpperCase();

      // Get color from CategoryManager
      const tagColor = this.detectorManager.categoryManager.getTagColor(methodType);
      const backgroundColor = (tagColor && tagColor !== '#666666') ? tagColor : '#666666';

      methodsHtml += `
        <div class="method-section">
          <div class="method-header">
            <div class="method-title" style="background: ${backgroundColor}; color: white; padding: 6px 12px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; display: inline-block;">${displayName}</div>
          </div>
          <div class="method-items">
      `;

      // Only add existing methods if there are any
      if (Array.isArray(methodsData) && methodsData.length > 0) {
        methodsData.forEach((method, index) => {
            // Get the appropriate values based on method type
            let name = '';
            let value = '';

            // Different method types have different structures
            if (methodType === 'headers' || methodType === 'cookies') {
              name = method.name || '';
              value = method.value || '';
            } else if (methodType === 'urls' || methodType === 'content') {
              name = method.pattern || method.content || '';
              value = method.description || '';
            } else if (methodType === 'dom') {
              name = method.selector || '';
              value = method.description || '';
            }

            const confidence = method.confidence || 100;
            const nameRegex = method.nameRegex || method.regex || false;
            const nameWholeWord = method.nameWholeWord || method.wholeWord || false;
            const nameCaseSensitive = method.nameCaseSensitive || method.caseSensitive || false;
            const valueRegex = method.valueRegex || false;
            const valueWholeWord = method.valueWholeWord || false;
            const valueCaseSensitive = method.valueCaseSensitive || false;
            const checkScripts = method.checkScripts || false;
            const checkClasses = method.checkClasses || false;
            const checkValues = method.checkValues || false;

            // Skip completely empty method items
            if (!name && !value) {
              return;
            }

            const singleInputTypes = ['urls', 'url', 'content', 'dom'];
            const isSingleInput = singleInputTypes.includes(methodType);

            let inputPlaceholder = 'Name';
            if (methodType === 'dom') inputPlaceholder = 'CSS Selector (e.g., .class, #id, [attr])';
            else if (methodType === 'content') inputPlaceholder = 'Text/Word to search';
            else if (methodType === 'urls' || methodType === 'url') inputPlaceholder = 'URL Pattern';

            // Check if any non-default settings are enabled
            // Don't consider imported confidence values as custom settings, only user-modified pattern options
            const hasCustomSettings = nameRegex || nameWholeWord || nameCaseSensitive ||
                                      valueRegex || valueWholeWord || valueCaseSensitive ||
                                      (methodType === 'content' && (checkScripts === true || checkClasses === true || checkValues === true));

            methodsHtml += `
              <div class="method-item"
                data-confidence="${confidence}"
                data-name-regex="${nameRegex}"
                data-name-wholeword="${nameWholeWord}"
                data-name-case="${nameCaseSensitive}"
                data-value-regex="${valueRegex}"
                data-value-wholeword="${valueWholeWord}"
                data-value-case="${valueCaseSensitive}"
                data-check-scripts="${checkScripts}"
                data-check-classes="${checkClasses}"
                data-check-values="${checkValues}">
                <div class="method-item-row">
                  <div class="method-item-inputs">
                    <div class="input-with-indicators">
                      <input type="text" class="method-input method-name" placeholder="${inputPlaceholder}" value="${name}" data-method-key="${methodType}" data-item-index="${index}">
                      <div class="input-indicators" data-for="name-${methodType}-${index}"></div>
                    </div>
                    ${methodType === 'dom' ? `<button class="dom-helper-btn" title="DOM Selector Examples" data-input-index="${index}">?</button>` : ''}
                    ${!isSingleInput ? `
                    <div class="input-with-indicators">
                      <input type="text" class="method-input method-value" placeholder="Value (optional)" value="${value}" data-method-key="${methodType}" data-item-index="${index}">
                      <div class="input-indicators" data-for="value-${methodType}-${index}"></div>
                    </div>
                    ` : ''}
                  </div>
                  <button class="method-action-btn settings ${hasCustomSettings ? 'has-custom-settings' : ''}" title="Settings">
                    <svg width="12" height="12" viewBox="0 0 24 24">
                      <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" fill="currentColor"/>
                    </svg>
                  </button>
                  <button class="method-action-btn delete" title="Delete">
                    <svg width="12" height="12" viewBox="0 0 24 24">
                      <path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z" fill="currentColor"/>
                    </svg>
                  </button>
                </div>
              </div>
            `;
        });
      }

      methodsHtml += `
          </div>
          <button class="add-method-btn" data-method-type="${methodType}">
            <svg width="12" height="12" viewBox="0 0 24 24">
              <path d="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z" fill="currentColor"/>
            </svg>
            Add Method
          </button>
        </div>
      `;
    });

    // Add button to add new method section
    container.innerHTML = methodsHtml;

    // Update indicators for all method items that have settings
    const methodItems = container.querySelectorAll('.method-item');
    methodItems.forEach(item => {
      const hasSettings =
        item.dataset.nameRegex === 'true' ||
        item.dataset.nameWholeword === 'true' ||
        item.dataset.nameCase === 'true' ||
        item.dataset.valueRegex === 'true' ||
        item.dataset.valueWholeword === 'true' ||
        item.dataset.valueCase === 'true';

      if (hasSettings) {
        this.updateMethodIndicators(item);
      }

      // Add input event listeners to update badges dynamically as user types
      const nameInput = item.querySelector('.method-input.method-name');
      const valueInput = item.querySelector('.method-input.method-value');

      if (nameInput) {
        nameInput.addEventListener('input', () => {
          this.updateMethodIndicators(item);
        });
      }

      if (valueInput) {
        valueInput.addEventListener('input', () => {
          this.updateMethodIndicators(item);
        });
      }
    });
  }

  /**
   * Add a new method item to a section
   * @param {HTMLElement} button - The button that was clicked
   */
  addNewMethodItem(button) {
    const methodSection = button.closest('.method-section');
    const methodItems = methodSection.querySelector('.method-items');
    const methodKey = methodSection.querySelector('.method-title').textContent.toLowerCase();
    const itemIndex = `new-${Date.now()}`;

    const singleInputTypes = ['urls', 'url', 'content', 'dom'];
    const isSingleInput = singleInputTypes.includes(methodKey);
    const isDom = methodKey === 'dom';

    let inputPlaceholder = 'Name';
    if (methodKey === 'dom') inputPlaceholder = 'CSS Selector (e.g., .class, #id, [attr])';
    else if (methodKey === 'content') inputPlaceholder = 'Text/Word to search';
    else if (methodKey === 'urls' || methodKey === 'url') inputPlaceholder = 'URL Pattern';

    const newMethodHtml = `
      <div class="method-item"
        data-confidence="100"
        data-name-regex="false"
        data-name-wholeword="false"
        data-name-case="false"
        data-value-regex="false"
        data-value-wholeword="false"
        data-value-case="false">
        <div class="method-item-row">
          <div class="method-item-inputs">
            <div class="input-with-indicators">
              <input type="text" class="method-input method-name" placeholder="${inputPlaceholder}" value="" data-method-key="${methodKey}" data-item-index="${itemIndex}">
              <div class="input-indicators" data-for="name-${methodKey}-${itemIndex}"></div>
            </div>
            ${isDom ? `<button class="dom-helper-btn" title="DOM Selector Examples" data-input-index="${itemIndex}">?</button>` : ''}
            ${!isSingleInput ? `
            <div class="input-with-indicators">
              <input type="text" class="method-input method-value" placeholder="Value (optional)" value="" data-method-key="${methodKey}" data-item-index="${itemIndex}">
              <div class="input-indicators" data-for="value-${methodKey}-${itemIndex}"></div>
            </div>
            ` : ''}
          </div>
          <button class="method-action-btn settings" title="Settings">
            <svg width="12" height="12" viewBox="0 0 24 24">
              <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" fill="currentColor"/>
            </svg>
          </button>
          <button class="method-action-btn delete" title="Delete">
            <svg width="12" height="12" viewBox="0 0 24 24">
              <path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z" fill="currentColor"/>
            </svg>
          </button>
        </div>
      </div>
    `;

    methodItems.insertAdjacentHTML('beforeend', newMethodHtml);
  }

  /**
   * Add a new method section
   */
  addNewMethodSection() {
    const container = document.querySelector('#detectionMethodsContainer');
    const addSectionBtn = container.querySelector('.add-section-btn');

    // Prompt for method type name
    const methodType = prompt('Enter detection method type (e.g., HEADERS, CONTENT, URLs):');
    if (!methodType) return;

    const methodKey = methodType.toLowerCase();
    const singleInputTypes = ['urls', 'url', 'content', 'dom'];
    const isSingleInput = singleInputTypes.includes(methodKey);
    const isDom = methodKey === 'dom';

    let inputPlaceholder = 'Name';
    if (methodKey === 'dom') inputPlaceholder = 'CSS Selector (e.g., .class, #id, [attr])';
    else if (methodKey === 'content') inputPlaceholder = 'Text/Word to search';
    else if (methodKey === 'urls' || methodKey === 'url') inputPlaceholder = 'URL Pattern';

    const newSectionHtml = `
      <div class="method-section">
        <div class="method-header">
          <div class="method-title">${methodType.toUpperCase()}</div>
        </div>
        <div class="method-items">
          <div class="method-item"
            data-confidence="100"
            data-name-regex="false"
            data-name-wholeword="false"
            data-name-case="false"
            data-value-regex="false"
            data-value-wholeword="false"
            data-value-case="false">
            <div class="method-item-row">
              <div class="method-item-inputs">
                <div class="input-with-indicators">
                  <input type="text" class="method-input method-name" placeholder="${inputPlaceholder}" value="" data-method-key="${methodKey}" data-item-index="new">
                  <div class="input-indicators" data-for="name-${methodKey}-new"></div>
                </div>
                ${isDom ? `<button class="dom-helper-btn" title="DOM Selector Examples" data-input-index="new">?</button>` : ''}
                ${!isSingleInput ? `
                <div class="input-with-indicators">
                  <input type="text" class="method-input method-value" placeholder="Value (optional)" value="" data-method-key="${methodKey}" data-item-index="new">
                  <div class="input-indicators" data-for="value-${methodKey}-new"></div>
                </div>
                ` : ''}
              </div>
              <button class="method-action-btn settings" title="Settings">
                <svg width="12" height="12" viewBox="0 0 24 24">
                  <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" fill="currentColor"/>
                </svg>
              </button>
              <button class="method-action-btn delete" title="Delete">
                <svg width="12" height="12" viewBox="0 0 24 24">
                  <path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z" fill="currentColor"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
        <button class="add-method-btn" data-method-type="${methodType.toLowerCase()}">
          <svg width="12" height="12" viewBox="0 0 24 24">
            <path d="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z" fill="currentColor"/>
          </svg>
          Add Method
        </button>
      </div>
    `;

    addSectionBtn.insertAdjacentHTML('beforebegin', newSectionHtml);
  }

  /**
   * Update detector badge color
   * @param {string} detectorName - The detector name
   * @param {string} color - The new color
   */
  updateDetectorBadgeColor(detectorName, color) {
    if (!this.categoryManager || !detectorName || !color) return;

    // Get all categories
    const categories = this.categoryManager.getCategories();

    // Find and update the detector's color in categories
    Object.values(categories).forEach(category => {
      if (category.detectors && category.detectors[detectorName]) {
        category.detectors[detectorName].color = color;
      }
    });

    // Save updated categories to storage
    this.categoryManager.saveToStorage();
  }

  /**
   * Save rule changes
   */
  saveRule() {
    if (!this.currentEditDetector) return;

    // Get detector information from fields
    const nameInput = document.querySelector('#detectorNameInput');
    const categorySelect = document.querySelector('#detectorCategorySelect');

    if (nameInput) {
      this.currentEditDetector.detector.name = nameInput.value;
      this.currentEditDetector.detector.displayName = nameInput.value;
    }

    if (categorySelect) {
      this.currentEditDetector.detector.category = categorySelect.value;
      // Update the category in the parent structure
      this.currentEditDetector.category = categorySelect.value;
    }

    // Get the selected color from ColorManager and save it
    if (this.colorManager) {
      const selectedColor = this.colorManager.getColor();
      this.currentEditDetector.detector.color = selectedColor;
      console.log('Saving detector with color:', selectedColor);
    }

    // Save custom icon if one was selected
    if (this.currentEditDetector.customIcon) {
      this.currentEditDetector.detector.customIcon = this.currentEditDetector.customIcon;
    }

    // Collect detection methods from the modal
    const methodsContainer = document.querySelector('#detectionMethodsContainer');
    if (methodsContainer) {
      const detectionMethods = {};

      // Get all method sections
      const methodSections = methodsContainer.querySelectorAll('.method-section');
      methodSections.forEach(section => {
        const methodTitle = section.querySelector('.method-title')?.textContent.toLowerCase();
        if (!methodTitle) return;

        // Map display titles to detector data keys
        let methodType = methodTitle;
        if (methodTitle === 'url') {
          methodType = 'urls';
        }

        const methods = [];
        const methodItems = section.querySelectorAll('.method-item');

        methodItems.forEach(item => {
          const nameInput = item.querySelector('.method-name');
          const valueInput = item.querySelector('.method-value');

          // Only include items that have at least name OR value (skip completely empty ones)
          const hasName = nameInput && nameInput.value.trim();
          const hasValue = valueInput && valueInput.value.trim();

          if (hasName || hasValue) {
            // Create method data based on the type
            let methodData = {
              confidence: parseInt(item.dataset.confidence || '100'),
            };

            // Structure data based on method type
            if (methodType === 'headers' || methodType === 'cookies') {
              methodData.name = nameInput.value;
              if (valueInput?.value) {
                methodData.value = valueInput.value;
              }
              if (hasValue && !hasName) {
                // Description only
                methodData.description = valueInput.value;
              } else if (hasValue) {
                methodData.description = valueInput.value;
              }
            } else if (methodType === 'urls' || methodType === 'content') {
              if (methodType === 'urls') {
                methodData.pattern = nameInput.value;
              } else {
                methodData.content = nameInput.value;
              }
              if (valueInput?.value) {
                methodData.description = valueInput.value;
              }
            } else if (methodType === 'dom') {
              methodData.selector = nameInput.value;
              if (valueInput?.value) {
                methodData.description = valueInput.value;
              }
            }

            // Add optional settings if they're not default
            if (item.dataset.nameRegex === 'true') {
              methodData.nameRegex = true;
            }
            if (item.dataset.nameWholeword === 'true') {
              methodData.nameWholeWord = true;
            }
            if (item.dataset.nameCase === 'true') {
              methodData.nameCaseSensitive = true;
            }
            if (item.dataset.valueRegex === 'true') {
              methodData.valueRegex = true;
            }
            if (item.dataset.valueWholeword === 'true') {
              methodData.valueWholeWord = true;
            }
            if (item.dataset.valueCase === 'true') {
              methodData.valueCaseSensitive = true;
            }
            // Content scope settings (only save if enabled - restricts search)
            if (item.dataset.checkScripts === 'true') {
              methodData.checkScripts = true;
            }
            if (item.dataset.checkClasses === 'true') {
              methodData.checkClasses = true;
            }
            if (item.dataset.checkValues === 'true') {
              methodData.checkValues = true;
            }

            methods.push(methodData);
          }
        });

        if (methods.length > 0) {
          detectionMethods[methodType] = methods;
        }
      });

      // Update the detector's detection methods
      if (Object.keys(detectionMethods).length > 0) {
        this.currentEditDetector.detector.detection = detectionMethods;
        console.log('Updated detection methods:', detectionMethods);
      }
    }

    console.log('Saving rule for:', this.currentEditDetector.detector.displayName);

    // Generate timestamp for lastUpdated
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const timestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

    // Update lastUpdated timestamp
    this.currentEditDetector.detector.lastUpdated = timestamp;

    // Handle new detector
    if (this.currentEditDetector.isNew) {
      const detectorName = this.currentEditDetector.detector.name || 'custom';
      const slugName = detectorName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const detectorId = slugName || `custom-${Date.now()}`;

      this.currentEditDetector.detector.id = detectorId;

      this.detectorManager.addDetector(
        this.currentEditDetector.category,
        detectorId,
        this.currentEditDetector.detector
      ).then(success => {
        if (success) {
          console.log('New detector added successfully');
          // Reload detectors in background script
          chrome.runtime.sendMessage({ type: 'RELOAD_DETECTORS' }, (response) => {
            console.log('Detectors reloaded in background:', response);
          });
          this.displayRules();
        }
      });

      this.closeEditModal();
      return;
    }

    // Update existing detector in DetectorManager
    if (this.detectorManager) {
      const categoryDetectors = this.detectorManager.detectors[this.currentEditDetector.category];
      if (categoryDetectors && categoryDetectors[this.currentEditDetector.detectorName]) {
        const updatedDetector = {
          ...this.currentEditDetector.detector,
          color: this.currentEditDetector.detector.color,
          customIcon: this.currentEditDetector.detector.customIcon,
          lastUpdated: timestamp
        };
        categoryDetectors[this.currentEditDetector.detectorName] = updatedDetector;

        console.log('Updating detector in storage with color:', updatedDetector.color);
        console.log('Updated lastUpdated timestamp to:', updatedDetector.lastUpdated);

        // Save to storage
        this.detectorManager.saveDetectorsToStorage().then(() => {
          console.log('Detector saved to storage successfully');
          // Reload detectors in background script
          chrome.runtime.sendMessage({ type: 'RELOAD_DETECTORS' }, (response) => {
            console.log('Detectors reloaded in background:', response);
          });
        }).catch(error => {
          console.error('Failed to save detector:', error);
        });
      }
    }

    // Update the category's color if it changed
    if (this.categoryManager && this.colorManager) {
      const color = this.colorManager.getColor();
      this.updateDetectorBadgeColor(this.currentEditDetector.detectorName, color);
    }

    // Close modal
    this.closeEditModal();

    // Refresh the rules list to show updated data
    this.displayRules();
  }



  /**
   * Display rules (main entry point)
   */
  async displayRules() {
    console.log('displayRules called');

    // Ensure HTML is loaded
    if (!this.initialized) {
      await this.initialize();
    }

    const rulesList = document.querySelector('#rulesList');
    const detectorsEmpty = document.querySelector('#detectorsEmpty');

    if (!rulesList) {
      console.error('Rules list element not found - HTML may not be loaded yet');
      return;
    }

    console.log('Rules list found:', rulesList);

    const detectors = this.detectorManager.getAllDetectors();

    if (!detectors || Object.keys(detectors).length === 0) {
      // Show empty state
      if (detectorsEmpty) {
        detectorsEmpty.style.display = 'block';
      }
      if (rulesList) {
        rulesList.innerHTML = '';
      }
      return;
    }

    // Hide empty state
    if (detectorsEmpty) {
      detectorsEmpty.style.display = 'none';
    }

    // Flatten detectors from all categories into a single array
    this.allDetectors = [];
    for (const [category, categoryDetectors] of Object.entries(detectors)) {
      if (!categoryDetectors || Object.keys(categoryDetectors).length === 0) continue;

      for (const [detectorName, detector] of Object.entries(categoryDetectors)) {
        // Ensure detector has detection property
        const detectorWithDefaults = {
          ...detector,
          displayName: detector.name || detectorName,
          detection: detector.detection || {
            urls: [],
            headers: [],
            cookies: [],
            content: [],
            dom: []
          }
        };

        this.allDetectors.push({
          category,
          detectorName,
          detector: detectorWithDefaults
        });
      }
    }

    // Sort detectors:
    // 1. Enabled detectors first, disabled last
    // 2. Within each group, sort by lastUpdated (newest first)
    this.allDetectors.sort((a, b) => {
      // First, sort by enabled status (enabled first)
      const aEnabled = a.detector.enabled !== false;
      const bEnabled = b.detector.enabled !== false;
      if (aEnabled !== bEnabled) {
        return aEnabled ? -1 : 1;
      }

      // Then sort by lastUpdated (newest first)
      const aDate = a.detector.lastUpdated || '1900-01-01';
      const bDate = b.detector.lastUpdated || '1900-01-01';
      return bDate.localeCompare(aDate);
    });

    this.filteredDetectors = [...this.allDetectors];

    // Setup pagination with all detectors
    if (this.paginationManager) {
      this.paginationManager.setItems(this.filteredDetectors);
    }
  }

  /**
   * Render detectors for current page
   * @param {Array} detectors - Detectors to render for current page
   */
  renderDetectorsPage(detectors) {
    const rulesList = document.querySelector('#rulesList');
    if (!rulesList) return;

    let rulesHtml = '';

    detectors.forEach(({ category, detectorName, detector }) => {
      const detectorIcon = this.getDetectorIcon(detector);
      const categoryInfo = this.categoryManager.getCategoryInfo(category);
      const categoryColor = categoryInfo?.colour || '#3b82f6';

      // Get detection methods from detector data
      const detectionMethods = this.getDetectionMethods(detector);

      // Format last updated with date and time
      let lastUpdated = detector.lastUpdated || 'Unknown';
      if (lastUpdated !== 'Unknown') {
        // If it's already in the format we want (YYYY-MM-DD HH:MM:SS), use it
        // Otherwise, try to parse and format it
        if (!lastUpdated.includes(':')) {
          // Old format (YYYY-MM-DD), add current time
          const now = new Date();
          lastUpdated = `${lastUpdated} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        }
      }

      // Get category method badges with dynamic colors
      const categoryMethod = this.getCategoryMethod(category);

      // Create category badge with dynamic color from storage
      const categoryBadge = `<span class="method-tag" style="background: ${categoryColor}; color: white;">${categoryMethod}</span>`;

      // Create the detector badge with custom color if available
      let detectorBadge = '';
      if (detector.color) {
        console.log(`Rendering detector ${detector.displayName} with custom color: ${detector.color}`);
        detectorBadge = `<span class="method-tag" style="background: ${detector.color}; color: white;">${detector.displayName}</span>`;
      } else {
        console.log(`Rendering detector ${detector.displayName} with default color (no custom color set)`);
        detectorBadge = `<span class="method-tag secondary">${detector.displayName}</span>`;
      }

      const topBadges = `${categoryBadge}${detectorBadge}`;

      // Add disabled class if detector is disabled
      const isDisabled = detector.enabled === false;
      rulesHtml += `
        <div class="detector-card ${isDisabled ? 'detector-disabled' : ''}" data-detector-id="${detectorName}" data-category="${category}">
          <div class="detector-header">
            <div class="detector-icon">${detectorIcon}</div>
            <div class="detector-info">
              <div class="detector-name-row">
                <div class="detector-name">${detector.displayName}</div>
                <div class="detector-actions" onclick="event.stopPropagation();">
                  <button class="edit-btn" title="Edit Detector" data-detector-id="${detectorName}" data-category="${category}">
                    <svg width="14" height="14" viewBox="0 0 24 24">
                      <path d="M3,17.25V21h3.75L17.81,9.94l-3.75-3.75L3,17.25zM20.71,7.04c0.39-0.39,0.39-1.02,0-1.41l-2.34-2.34c-0.39-0.39-1.02-0.39-1.41,0l-1.83,1.83l3.75,3.75L20.71,7.04z" fill="currentColor"/>
                    </svg>
                  </button>
                  <button class="delete-btn" title="Delete Detector">
                    <svg width="14" height="14" viewBox="0 0 24 24">
                      <path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z" fill="currentColor"/>
                    </svg>
                  </button>
                </div>
              </div>
              <div class="detection-methods">
                ${topBadges}
              </div>
            </div>
          </div>
          <div class="detector-scripts">
            <div class="detection-methods">
              ${detectionMethods}
            </div>
            <div class="scripts-info">
              <span>Last Updated: ${lastUpdated}</span>
              <label class="toggle-switch-small" onclick="event.stopPropagation();">
                <input type="checkbox" class="detector-toggle"
                       data-detector="${detectorName}"
                       data-category="${category}"
                       ${detector.enabled !== false ? 'checked' : ''}>
                <span class="toggle-slider-small"></span>
              </label>
            </div>
          </div>
        </div>
      `;
    });

    rulesList.innerHTML = rulesHtml;

    // Add click event listeners to detector cards and edit buttons
    this.setupDetectorCardListeners(detectors);
  }

  /**
   * Setup event listeners for detector cards
   * @param {Array} detectors - Array of detectors for current page
   */
  setupDetectorCardListeners(detectors) {
    // Add click listeners to detector cards
    const detectorCards = document.querySelectorAll('.detector-card');
    detectorCards.forEach((card, index) => {
      if (detectors[index]) {
        const { category, detectorName, detector } = detectors[index];

        // Click on card to edit
        card.addEventListener('click', (e) => {
          // Don't open modal if clicking on action buttons, method badges, or toggle switch
          if (!e.target.closest('.detector-actions') && !e.target.closest('.method-tag') && !e.target.closest('.toggle-switch-small')) {
            // Pass the detector ensuring it has detection property
            const detectorToEdit = {
              ...detector,
              detection: detector.detection || {
                urls: [],
                headers: [],
                cookies: [],
                content: [],
                dom: []
              }
            };
            this.openEditModal(detectorToEdit, category, detectorName, false);
          }
        });

        // Add hover effect
        card.style.cursor = 'pointer';
      }
    });

    // Add click listeners to edit buttons
    const editButtons = document.querySelectorAll('.edit-btn');
    editButtons.forEach((btn, index) => {
      if (detectors[index]) {
        const { category, detectorName, detector } = detectors[index];
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          // Pass the detector ensuring it has detection property
          const detectorToEdit = {
            ...detector,
            detection: detector.detection || {
              urls: [],
              headers: [],
              cookies: [],
              content: [],
              dom: []
            }
          };
          this.openEditModal(detectorToEdit, category, detectorName, false);
        });
      }
    });

    // Add click listeners to delete buttons
    const deleteButtons = document.querySelectorAll('.delete-btn');
    deleteButtons.forEach((btn, index) => {
      if (detectors[index]) {
        const { category, detectorName, detector } = detectors[index];
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await this.handleDeleteDetector(category, detectorName, detector.displayName || detectorName);
        });
      }
    });
  }

  /**
   * Get detection methods from detector data
   * @param {object} detector - Detector object
   * @returns {string} HTML for detection method tags
   */
  getDetectionMethods(detector) {
    let methodsHtml = '';

    // Get detection methods from the detection object keys
    let detectionMethods = null;
    if (detector.detection && typeof detector.detection === 'object') {
      detectionMethods = Object.keys(detector.detection).filter(key =>
        detector.detection[key] &&
        (Array.isArray(detector.detection[key]) ? detector.detection[key].length > 0 : true)
      );
    }

    // Add detection methods from detector data
    if (detectionMethods && Array.isArray(detectionMethods)) {
      detectionMethods.forEach((method) => {
        const methodStr = typeof method === 'string' ? method : method.name || method.type || 'Unknown';
        const methodName = methodStr.toUpperCase();

        // Get dynamic color from CategoryManager tags
        const tagColor = this.categoryManager.getTagColor(methodName);

        if (tagColor && tagColor !== '#666666') {
          // Use dynamic color with transparent background
          const r = parseInt(tagColor.slice(1, 3), 16);
          const g = parseInt(tagColor.slice(3, 5), 16);
          const b = parseInt(tagColor.slice(5, 7), 16);
          methodsHtml += `<span class="method-tag" style="background: rgba(${r}, ${g}, ${b}, 0.15); color: ${tagColor}; border: 1px solid rgba(${r}, ${g}, ${b}, 0.3);">${methodName}</span>`;
        } else {
          // Fallback to CSS class
          const badgeClass = this.getMethodBadgeClass(methodStr);
          methodsHtml += `<span class="method-tag ${badgeClass}">${methodName}</span>`;
        }
      });
    } else {
      // Fallback: create detection methods based on category and add detector name
      const categoryMethod = this.getCategoryMethod(detector.category);
      const categoryClass = this.getCategoryClass(detector.category);

      if (categoryMethod) {
        methodsHtml += `<span class="method-tag ${categoryClass}">${categoryMethod}</span>`;
      }

      // Add detector name as secondary method if different from category
      if (detector.displayName && detector.displayName !== categoryMethod) {
        methodsHtml += `<span class="method-tag secondary">${detector.displayName}</span>`;
      }
    }

    return methodsHtml;
  }

  /**
   * Get category-based detection method
   * @param {string} category - Category name
   * @returns {string} Detection method name
   */
  getCategoryMethod(category) {
    return this.categoryManager.getCategoryDisplayName(category) || 'Detection';
  }

  /**
   * Get category-based CSS class for method tags
   * @param {string} category - Category name
   * @returns {string} CSS class name
   */
  getCategoryClass(category) {
    return this.categoryManager.getCategoryBadgeClass(category);
  }

  /**
   * Get method-specific badge class for detection method types
   * @param {string} method - Method name (cookies, headers, urls, scripts, etc.)
   * @returns {string} CSS class name
   */
  getMethodBadgeClass(method) {
    switch (method?.toLowerCase()) {
      case 'cookies':
        return 'primary'; // Orange
      case 'headers':
        return 'secondary'; // Purple
      case 'urls':
      case 'url':
        return 'fingerprint'; // Purple
      case 'content':
      case 'scripts': // Legacy support
      case 'script':
        return 'waf'; // Red
      default:
        return 'primary';
    }
  }

  /**
   * Get detector icon from detector data or fallback to category icon
   * @param {object} detector - Detector object
   * @returns {string} Icon string (emoji or URL)
   */
  getDetectorIcon(detector) {
    // Check for custom uploaded icon first
    if (detector.customIcon) {
      return `<img src="${detector.customIcon}" alt="Icon" class="detector-icon-img">`;
    }

    // Try to get real icon from detector data
    if (detector.icon) {
      // If it's a URL, return as image
      if (detector.icon.startsWith('http') || detector.icon.startsWith('/')) {
        return `<img src="${detector.icon}" alt="Icon" class="detector-icon-img">`;
      }
      // If it's a filename, construct the path to the detectors/icons folder
      if (detector.icon.includes('.png') || detector.icon.includes('.jpg') || detector.icon.includes('.svg')) {
        return `<img src="detectors/icons/${detector.icon}" alt="${detector.displayName || detector.name} Icon" class="detector-icon-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                <span class="detector-icon-fallback" style="display: none;">${this.getCategoryIcon(detector.category || 'unknown')}</span>`;
      }
      // Otherwise return as emoji or text
      return detector.icon;
    }

    // Fallback to category-based icons
    return this.getCategoryIcon(detector.category || 'unknown');
  }

  /**
   * Get category icon (fallback)
   * @param {string} category - Category name
   * @returns {string} Icon emoji
   */
  getCategoryIcon(category) {
    return this.categoryManager.getCategoryIcon(category);
  }

  /**
   * Handle import of detector rules
   * @param {Event} event - File input change event
   */
  async handleImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Ask user if they want to merge or replace
      // Use NotificationHelper for safe access
      const merge = await NotificationHelper.confirm({
            title: 'Import Detectors',
            message: 'Do you want to merge with existing detectors?',
            confirmText: 'Merge',
            cancelText: 'Replace All',
            type: 'info'
          });

      const success = await this.detectorManager.importDetectors(data, merge);
      if (success) {
        NotificationHelper.success('Detectors imported successfully');
        this.displayRules();
      } else {
        NotificationHelper.error('Failed to import detectors. Check the file format.');
      }
    } catch (error) {
      NotificationHelper.error('Error reading file: ' + error.message);
    }

    // Reset file input
    event.target.value = '';
  }

  /**
   * Handle export of detector rules
   */
  handleExport() {
    const data = this.detectorManager.exportDetectors();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });

    // Create download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const timestamp = new Date().toISOString().split('T')[0];
    a.href = url;
    a.download = `scrapfly-detectors-${timestamp}.json`;
    a.click();

    URL.revokeObjectURL(url);
  }

  /**
   * Update detector enabled state
   * @param {string} category - Category name
   * @param {string} detectorName - Detector name
   * @param {boolean} enabled - Whether detector is enabled
   */
  async updateDetectorEnabledState(category, detectorName, enabled) {
    try {
      // Get the detector
      const detector = this.detectorManager.getDetector(category, detectorName);
      if (detector) {
        // Update enabled state
        detector.enabled = enabled;

        // Save to storage
        await this.detectorManager.saveDetectorsToStorage();

        console.log(`Detector ${detectorName} ${enabled ? 'enabled' : 'disabled'}`);

        // Update the visual appearance immediately
        const detectorCard = document.querySelector(`[data-detector-id="${detectorName}"][data-category="${category}"]`);
        if (detectorCard) {
          if (enabled) {
            detectorCard.classList.remove('detector-disabled');
          } else {
            detectorCard.classList.add('detector-disabled');
          }
        }
      }
    } catch (error) {
      console.error('Failed to update detector enabled state:', error);
    }
  }

  /**
   * Handle clearing all detectors
   */
  async handleClear() {
    const confirmed = await NotificationHelper.confirm({
          title: 'Clear All Detectors',
          message: 'This will remove ALL detectors. Are you sure?',
          confirmText: 'Clear All',
          cancelText: 'Cancel',
          type: 'danger'
        });

    if (!confirmed) {
      return;
    }

    const loader = NotificationHelper.loading('Clearing all detectors...');
    const success = await this.detectorManager.clearAllDetectors();
    loader.close();

    if (success) {
      NotificationHelper.success('All detectors cleared');
      this.displayRules();
    } else {
      NotificationHelper.error('Failed to clear detectors');
    }
  }

  /**
   * Handle deleting a detector
   * @param {string} category - Category name
   * @param {string} detectorName - Detector name
   * @param {string} displayName - Display name for confirmation
   */
  async handleDeleteDetector(category, detectorName, displayName) {
    const confirmed = await NotificationHelper.confirm({
      title: 'Delete Detector',
      message: `Are you sure you want to delete "${displayName}"?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger'
    });

    if (!confirmed) {
      return;
    }

    try {
      // Remove detector from detectorManager
      if (this.detectorManager.detectors[category] && this.detectorManager.detectors[category][detectorName]) {
        delete this.detectorManager.detectors[category][detectorName];

        // Save to storage
        await this.detectorManager.saveDetectorsToStorage();

        // Reload detectors in background script
        chrome.runtime.sendMessage({ type: 'RELOAD_DETECTORS' }, (response) => {
          console.log('Detectors reloaded in background after delete:', response);
        });

        NotificationHelper.success(`Deleted "${displayName}"`);

        // Refresh the display
        this.displayRules();
      } else {
        NotificationHelper.error('Detector not found');
      }
    } catch (error) {
      console.error('Failed to delete detector:', error);
      NotificationHelper.error('Failed to delete detector');
    }
  }

  /**
   * Handle adding a new detector
   */
  handleAddDetector() {
    // Get current timestamp in local time
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const timestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

    // Create a new empty detector
    const newDetector = {
      id: `custom-${Date.now()}`,
      name: 'New Detector',
      displayName: 'New Detector',
      category: 'antibot',
      icon: '🔍',
      color: '#3b82f6',
      description: 'Custom detector',
      lastUpdated: timestamp,
      detection: {
        urls: [],
        headers: [],
        cookies: [],
        content: [],
        dom: []
      }
    };

    // Open edit modal with the new detector - pass isNew as true
    this.openEditModal(newDetector, 'antibot', newDetector.id, true);
  }

  /**
   * Handle search functionality
   * @param {string} query - Search query
   */
  handleSearch(query) {
    if (!query.trim()) {
      this.filteredDetectors = [...this.allDetectors];
    } else {
      // Use SearchManager for advanced searching
      if (this.searchManager) {
        this.filteredDetectors = this.searchManager.searchRules(this.allDetectors, query);
      } else {
        // Fallback to simple search if SearchManager not available
        const searchTerm = query.toLowerCase().trim();
        this.filteredDetectors = this.allDetectors.filter(({ detector, category }) => {
          // Search in detector name, category, description, and detection methods
          const searchableText = [
            detector.displayName,
            detector.name,
            category,
            detector.description,
            detector.lastUpdated
          ].filter(Boolean).join(' ').toLowerCase();

          // Also search in detection methods
          if (detector.detection) {
            for (const [methodType, methods] of Object.entries(detector.detection)) {
              if (Array.isArray(methods)) {
                const methodText = methods.map(m => {
                  if (typeof m === 'string') return m;
                  if (typeof m === 'object') return JSON.stringify(m);
                  return '';
                }).join(' ').toLowerCase();

                if (methodText.includes(searchTerm)) {
                  return true;
                }
              }
            }
          }

          return searchableText.includes(searchTerm);
        });
      }
    }

    // Update pagination with filtered results
    if (this.paginationManager) {
      this.paginationManager.setItems(this.filteredDetectors);
    }
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Rules;
} else if (typeof window !== 'undefined') {
  window.Rules = Rules;
}