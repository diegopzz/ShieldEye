class PaginationManager {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.currentPage = 1;
    this.itemsPerPage = options.itemsPerPage || 10;
    this.maxPageButtons = options.maxPageButtons || 5;
    this.items = [];
    this.filteredItems = [];
    this.onPageChange = options.onPageChange || (() => {});
    this.renderItem = options.renderItem || ((item) => item.toString());
  }

  /**
   * Set the items to paginate
   * @param {Array} items - Array of items to paginate
   */
  setItems(items) {
    this.items = items;
    this.filteredItems = items;
    this.currentPage = 1;
    this.render();
  }

  /**
   * Filter items and update pagination
   * @param {Function} filterFn - Filter function
   */
  filter(filterFn) {
    this.filteredItems = this.items.filter(filterFn);
    this.currentPage = 1;
    this.render();
  }

  /**
   * Get total number of pages
   * @returns {number} Total pages
   */
  getTotalPages() {
    return Math.ceil(this.filteredItems.length / this.itemsPerPage);
  }

  /**
   * Get items for current page
   * @returns {Array} Items for current page
   */
  getCurrentPageItems() {
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    return this.filteredItems.slice(startIndex, endIndex);
  }

  /**
   * Go to specific page
   * @param {number} page - Page number to go to
   */
  goToPage(page) {
    const totalPages = this.getTotalPages();
    if (page >= 1 && page <= totalPages) {
      this.currentPage = page;
      this.render();
      this.onPageChange(page, this.getCurrentPageItems());
    }
  }

  /**
   * Go to next page
   */
  nextPage() {
    this.goToPage(this.currentPage + 1);
  }

  /**
   * Go to previous page
   */
  prevPage() {
    this.goToPage(this.currentPage - 1);
  }

  /**
   * Render the pagination UI
   */
  render() {
    const container = document.querySelector(`#${this.containerId}`);
    if (!container) {
      console.error(`Pagination container #${this.containerId} not found`);
      return;
    }

    const totalPages = this.getTotalPages();
    const startItem = (this.currentPage - 1) * this.itemsPerPage + 1;
    const endItem = Math.min(this.currentPage * this.itemsPerPage, this.filteredItems.length);

    // Update page info
    const pageInput = container.querySelector('.page-input');
    const totalPagesSpan = container.querySelector('.total-pages');
    const paginationInfo = container.querySelector('.pagination-info');

    if (pageInput) {
      pageInput.value = this.currentPage;
    }
    if (totalPagesSpan) {
      totalPagesSpan.textContent = totalPages;
    }

    // Update the "Showing X-Y of Z" text
    if (paginationInfo) {
      const totalItems = this.filteredItems.length;
      if (totalItems === 0) {
        paginationInfo.textContent = 'No items to display';
      } else {
        paginationInfo.textContent = `Showing ${startItem}-${endItem} of ${totalItems} - Page ${this.currentPage}`;
      }
    }

    // Update pagination controls
    this.renderPaginationControls(container, totalPages);

    // Add event listener for page input
    if (pageInput && !pageInput.hasAttribute('data-listener')) {
      pageInput.setAttribute('data-listener', 'true');
      pageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          const page = parseInt(e.target.value);
          if (page >= 1 && page <= totalPages) {
            this.goToPage(page);
          }
        }
      });
    }

    // Show/hide pagination based on whether there are items
    if (this.filteredItems.length === 0) {
      container.style.display = 'none';
    } else {
      container.style.display = 'flex';
    }

    // Trigger page change callback
    this.onPageChange(this.currentPage, this.getCurrentPageItems());
  }

  /**
   * Render pagination controls (prev, numbers, next)
   * @param {HTMLElement} container - Pagination container
   * @param {number} totalPages - Total number of pages
   */
  renderPaginationControls(container, totalPages) {
    // Update previous button
    const prevBtn = container.querySelector('.pagination-btn-prev, .pagination-prev');
    if (prevBtn) {
      prevBtn.disabled = this.currentPage <= 1;
      prevBtn.onclick = () => this.prevPage();
    }

    // Update next button
    const nextBtn = container.querySelector('.pagination-btn-next, .pagination-next');
    if (nextBtn) {
      nextBtn.disabled = this.currentPage >= totalPages;
      nextBtn.onclick = () => this.nextPage();
    }

    // Don't render page numbers anymore - we're using the page input instead
  }

  /**
   * Generate page number buttons HTML
   * @param {number} totalPages - Total number of pages
   * @returns {string} HTML string for page numbers
   */
  generatePageNumbers(totalPages) {
    // Don't show page numbers if only 1 page
    if (totalPages <= 1) {
      return '';
    }

    let html = '';
    const maxButtons = Math.min(this.maxPageButtons, totalPages);

    // For very few pages, just show all
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) {
        const isActive = i === this.currentPage;
        html += `<button class="page-number ${isActive ? 'active' : ''}" data-page="${i}">${i}</button>`;
      }
    } else {
      // Calculate start and end page numbers to display
      let startPage = Math.max(1, this.currentPage - Math.floor(maxButtons / 2));
      let endPage = Math.min(totalPages, startPage + maxButtons - 1);

      // Adjust if we're near the end
      if (endPage - startPage + 1 < maxButtons) {
        startPage = Math.max(1, endPage - maxButtons + 1);
      }

      // Always show first page
      html += `<button class="page-number ${this.currentPage === 1 ? 'active' : ''}" data-page="1">1</button>`;

      // Add ellipsis if there's a gap
      if (startPage > 2) {
        html += `<span class="page-ellipsis">...</span>`;
      }

      // Add middle pages (but don't duplicate first or last)
      for (let i = Math.max(2, startPage); i <= Math.min(endPage, totalPages - 1); i++) {
        const isActive = i === this.currentPage;
        html += `<button class="page-number ${isActive ? 'active' : ''}" data-page="${i}">${i}</button>`;
      }

      // Add ellipsis if there's a gap before last page
      if (endPage < totalPages - 1) {
        html += `<span class="page-ellipsis">...</span>`;
      }

      // Always show last page
      if (totalPages > 1) {
        html += `<button class="page-number ${this.currentPage === totalPages ? 'active' : ''}" data-page="${totalPages}">${totalPages}</button>`;
      }
    }

    // Add event listeners to page numbers
    setTimeout(() => {
      document.querySelectorAll(`#${this.containerId} .page-number`).forEach(btn => {
        btn.addEventListener('click', (e) => {
          const page = parseInt(e.target.dataset.page);
          this.goToPage(page);
        });
      });
    }, 0);

    return html;
  }

  /**
   * Create pagination HTML structure
   * @param {string} prefix - Prefix for element IDs (e.g., 'rules', 'history')
   * @returns {string} HTML string for pagination
   */
  static createPaginationHTML(prefix) {
    return `
      <div id="${prefix}Pagination" class="pagination" style="display: none;">
        <div class="pagination-controls">
          <button class="pagination-btn pagination-btn-prev" disabled>
            <svg width="12" height="12" viewBox="0 0 24 24">
              <path d="M15.41 7.41L14 6L8 12L14 18L15.41 16.59L10.83 12Z" fill="currentColor"/>
            </svg>
            <span>Prev</span>
          </button>
          <div class="page-info">
            <span>Page</span>
            <input type="text" class="page-input" value="1" />
            <span>of</span>
            <span class="total-pages">1</span>
          </div>
          <button class="pagination-btn pagination-btn-next" disabled>
            <span>Next</span>
            <svg width="12" height="12" viewBox="0 0 24 24">
              <path d="M10 6L8.59 7.41L13.17 12L8.59 16.59L10 18L16 12Z" fill="currentColor"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Get pagination CSS styles
   * @returns {string} CSS styles for pagination
   */
  static getPaginationCSS() {
    return `
      .pagination {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 10px 12px;
        background: var(--bg-secondary);
        border-top: 1px solid var(--border);
        margin-top: auto;
      }

      .pagination-controls {
        display: flex;
        align-items: center;
        gap: 20px;
      }

      .pagination-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        background: transparent;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s;
        color: var(--text-secondary);
        font-size: 13px;
        font-weight: 500;
      }

      .pagination-btn:hover:not(:disabled) {
        background: var(--bg-tertiary);
        color: var(--text-primary);
      }

      .pagination-btn:disabled {
        opacity: 0.3;
        cursor: not-allowed;
      }

      .pagination-btn svg {
        width: 12px;
        height: 12px;
      }

      .page-info {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: var(--text-secondary);
      }

      .page-input {
        width: 36px;
        padding: 4px 6px;
        background: var(--bg-tertiary);
        border: 1px solid var(--border);
        border-radius: 4px;
        color: var(--text-primary);
        font-size: 13px;
        text-align: center;
      }

      .page-input:focus {
        outline: none;
        border-color: var(--accent);
        background: var(--bg-primary);
      }

      .total-pages {
        font-weight: 600;
        color: var(--text-primary);
      }

      .page-ellipsis {
        padding: 0 4px;
        color: var(--text-muted);
        font-size: 12px;
      }
    `;
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PaginationManager;
} else if (typeof window !== 'undefined') {
  window.PaginationManager = PaginationManager;
}