/**
 * TimeframeFavorites - Manages timeframe favorites and dropdown
 */
class TimeframeFavorites {
    constructor(chart) {
        this.chart = chart;
        this.favorites = this.loadFavorites();
        this.currentTimeframe = chart.currentTimeframe || '1m';
        
        // Initialize UI
        this.initDropdown();
        this.initFavorites();
        this.updateUI();
        
        console.log('⭐ TimeframeFavorites initialized with', this.favorites.length, 'favorites');
        console.log('⭐ Current timeframe:', this.currentTimeframe);
    }

    /**
     * Load favorites from localStorage
     */
    loadFavorites() {
        try {
            const saved = localStorage.getItem('chart_timeframe_favorites');
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (e) {
            console.error('Failed to load timeframe favorites:', e);
        }
        // Default favorites: 1m, 5m, 15m, 1h
        return ['1m', '5m', '15m', '1h'];
    }

    /**
     * Save favorites to localStorage
     */
    saveFavorites() {
        try {
            localStorage.setItem('chart_timeframe_favorites', JSON.stringify(this.favorites));
        } catch (e) {
            console.error('Failed to save timeframe favorites:', e);
        }
    }

    /**
     * Toggle favorite status of a timeframe
     */
    toggleFavorite(timeframe) {
        const MAX_FAVORITES = 10;
        const index = this.favorites.indexOf(timeframe);
        if (index > -1) {
            // Remove from favorites
            this.favorites.splice(index, 1);
        } else {
            // Check limit before adding
            if (this.favorites.length >= MAX_FAVORITES) {
                console.warn(`Maximum ${MAX_FAVORITES} timeframes allowed`);
                return;
            }
            this.favorites.push(timeframe);
        }
        this.saveFavorites();
        this.updateUI();
    }

    /**
     * Check if timeframe is favorited
     */
    isFavorite(timeframe) {
        return this.favorites.includes(timeframe);
    }

    /**
     * Get display label for timeframe
     */
    getTimeframeLabel(timeframe) {
        const tf = String(timeframe || '').toLowerCase().trim();
        const labels = {
            '1m': '1m', '2m': '2m', '3m': '3m', '4m': '4m', '5m': '5m',
            '10m': '10m', '15m': '15m', '30m': '30m', '45m': '45m',
            '1h': '1h', '2h': '2h', '4h': '4h', '6h': '6h', '12h': '12h',
            '1d': 'D', '1w': 'W', '1mo': 'M'
        };
        
        if (labels[tf]) return labels[tf];
        
        // Handle custom timeframes like "7m", "3h", "2d", etc.
        const match = tf.match(/^(\d+)(m|h|d|w|mo)$/);
        if (match) {
            const value = match[1];
            const unit = match[2];
            const unitLabels = { m: 'm', h: 'h', d: 'D', w: 'W', mo: 'M' };
            return `${value}${unitLabels[unit] || unit}`;
        }
        
        return tf;
    }

    /**
     * Convert timeframe to minutes for sorting
     */
    timeframeToMinutes(timeframe) {
        const match = String(timeframe || '').toLowerCase().trim().match(/^(\d+)(m|h|d|w|mo)$/);
        if (!match) return 0;
        
        const value = parseInt(match[1]);
        const unit = match[2];
        
        switch (unit) {
            case 'm': return value;
            case 'h': return value * 60;
            case 'd': return value * 60 * 24;
            case 'w': return value * 60 * 24 * 7;
            case 'mo': return value * 60 * 24 * 30;
            default: return 0;
        }
    }

    /**
     * Get sorted favorites by duration
     */
    getSortedFavorites() {
        return [...this.favorites].sort((a, b) => {
            return this.timeframeToMinutes(a) - this.timeframeToMinutes(b);
        });
    }

    /**
     * Initialize dropdown functionality
     */
    initDropdown() {
        const dropdown = document.getElementById('timeframeDropdown');
        const trigger = document.getElementById('timeframeDropdownTrigger');
        const menu = document.getElementById('timeframeDropdownMenu');
        const sidebarDropdownBtn = document.getElementById('sidebarTimeframeDropdownBtn');

        if (!menu) {
            console.error('Timeframe dropdown menu not found');
            return;
        }

        // Move menu to body to avoid z-index/overflow issues
        // Ensure menu is hidden before moving to prevent visual glitch
        menu.style.display = 'none';
        menu.style.visibility = 'hidden';
        document.body.appendChild(menu);
        // Reset visibility after moving
        setTimeout(() => {
            menu.style.visibility = 'visible';
        }, 0);

        // Toggle dropdown from toolbar (if visible)
        if (dropdown) {
            dropdown.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOpen = dropdown.classList.contains('open');
                
                if (!isOpen) {
                    // Position the menu below the dropdown
                    const rect = dropdown.getBoundingClientRect();
                    menu.style.top = `${rect.bottom + 4}px`;
                    menu.style.left = `${rect.left}px`;
                    menu.style.display = 'block';
                    dropdown.classList.add('open');
                } else {
                    menu.style.display = 'none';
                    dropdown.classList.remove('open');
                }
            });
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            const clickedDropdown = dropdown && dropdown.contains(e.target);
            const clickedMenu = menu.contains(e.target);
            const clickedTimeframeContainer = e.target.closest('.sidebar-current-timeframe-container');
            
            if (!clickedDropdown && !clickedMenu && !clickedTimeframeContainer) {
                menu.style.display = 'none';
                if (dropdown) dropdown.classList.remove('open');
                // Remove open class from all timeframe arrows
                document.querySelectorAll('.sidebar-timeframe-arrow').forEach(arrow => {
                    arrow.classList.remove('open');
                });
            }
        });

        // Section collapse/expand
        const sectionHeaders = menu.querySelectorAll('.timeframe-dropdown-section-header');
        sectionHeaders.forEach(header => {
            header.addEventListener('click', (e) => {
                e.stopPropagation();
                const section = header.closest('.timeframe-dropdown-section');
                section.classList.toggle('collapsed');
            });
        });

        // Handle timeframe item clicks
        const items = menu.querySelectorAll('.timeframe-dropdown-item:not(.timeframe-custom-btn)');
        items.forEach(item => {
            const timeframe = item.dataset.timeframe;
            
            // Click on item text to select timeframe
            item.addEventListener('click', (e) => {
                if (e.target.closest('.timeframe-dropdown-item-star')) {
                    // Clicked on star, toggle favorite
                    this.toggleFavorite(timeframe);
                } else {
                    // Clicked on item, select timeframe
                    this.selectTimeframe(timeframe);
                    menu.style.display = 'none';
                    dropdown.classList.remove('open');
                }
            });

            // Star icon click
            const star = item.querySelector('.timeframe-dropdown-item-star');
            if (star) {
                star.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.toggleFavorite(timeframe);
                });
            }
        });

        // Initialize custom timeframe modal
        this.initCustomTimeframeModal(dropdown, menu);
    }

    /**
     * Initialize custom timeframe modal
     */
    initCustomTimeframeModal(dropdown, menu) {
        const customBtn = document.getElementById('customTimeframeBtn');
        const modal = document.getElementById('customTimeframeModal');
        const valueInput = document.getElementById('customTimeframeValue');
        const unitSelect = document.getElementById('customTimeframeUnit');
        const cancelBtn = document.getElementById('customTimeframeCancel');
        const applyBtn = document.getElementById('customTimeframeApply');

        if (!customBtn || !modal) {
            console.warn('Custom timeframe elements not found');
            return;
        }

        // Open modal when clicking Custom button
        customBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // Close the dropdown
            menu.style.display = 'none';
            dropdown.classList.remove('open');
            // Open the modal
            modal.classList.add('open');
            valueInput.focus();
            valueInput.select();
        });

        // Close modal on cancel
        cancelBtn.addEventListener('click', () => {
            modal.classList.remove('open');
        });

        // Close modal on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('open');
            }
        });

        // Apply custom timeframe
        applyBtn.addEventListener('click', () => {
            const value = parseInt(valueInput.value, 10);
            const unit = unitSelect.value;

            if (isNaN(value) || value < 1) {
                valueInput.focus();
                valueInput.style.borderColor = '#f23645';
                setTimeout(() => {
                    valueInput.style.borderColor = '';
                }, 1500);
                return;
            }

            // Build timeframe string (e.g., "7m", "2h", "3d")
            const timeframe = `${value}${unit}`;
            console.log('⌚ Custom timeframe:', timeframe);

            // Close modal
            modal.classList.remove('open');

            // Select the custom timeframe
            this.selectTimeframe(timeframe);
        });

        // Apply on Enter key
        valueInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                applyBtn.click();
            } else if (e.key === 'Escape') {
                modal.classList.remove('open');
            }
        });

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('open')) {
                modal.classList.remove('open');
            }
        });
    }

    /**
     * Initialize favorites toolbar
     */
    initFavorites() {
        const favoritesContainer = document.getElementById('timeframeFavorites');
        if (!favoritesContainer) {
            console.error('Favorites container not found');
            return;
        }
    }

    /**
     * Select a timeframe
     */
    selectTimeframe(timeframe) {
        this.currentTimeframe = timeframe;
        
        // Update label
        const label = document.getElementById('currentTimeframeLabel');
        if (label) {
            label.textContent = this.getTimeframeLabel(timeframe);
        }

        // Update sidebar current timeframe display
        const sidebarCurrentTimeframe = document.getElementById('sidebarCurrentTimeframe');
        if (sidebarCurrentTimeframe) {
            sidebarCurrentTimeframe.textContent = this.getTimeframeLabel(timeframe);
        }

        // Update selected state in dropdown
        const items = document.querySelectorAll('.timeframe-dropdown-item');
        items.forEach(item => {
            if (item.dataset.timeframe === timeframe) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });

        // Update favorite buttons (both toolbar and sidebar)
        const favButtons = document.querySelectorAll('.timeframe-btn[data-timeframe], .sidebar-timeframe-btn[data-timeframe]');
        favButtons.forEach(btn => {
            if (btn.dataset.timeframe === timeframe) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Re-render sidebar timeframes to exclude current from list
        this.renderSidebarTimeframes();

        // Trigger timeframe change
        this.changeTimeframe(timeframe);
    }

    /**
     * Change the chart timeframe
     */
    changeTimeframe(timeframe) {
        console.log('⌚ Changing timeframe to:', timeframe);

        // Check if we're in LINKED pane mode (Add New Pane feature) - update BOTH charts
        if (window._linkedPaneData && window._linkedPaneData.panel1) {
            console.log('🔗 Linked pane mode - syncing both charts');
            
            // Update main chart
            if (this.chart && typeof this.chart.setTimeframe === 'function') {
                this.chart.setTimeframe(timeframe);
            }
            
            // Update panel1 (linked pane)
            const panel1 = window._linkedPaneData.panel1;
            if (panel1.chartInstance && panel1.chartInstance.rawData && panel1.chartInstance.rawData.length > 0) {
                // Resample panel data to new timeframe
                panel1.chartInstance.data = panel1.chartInstance.resampleData(
                    panel1.chartInstance.rawData, 
                    timeframe
                );
                panel1.chartInstance.currentTimeframe = timeframe;
                panel1.timeframe = timeframe;
                
                // Update timeframe label
                const tfLabel = document.getElementById('chartTimeframe1');
                if (tfLabel) tfLabel.textContent = timeframe;
                
                // Sync scroll position from main chart
                if (window.chart) {
                    panel1.chartInstance.offsetX = window.chart.offsetX || 0;
                    panel1.chartInstance.candleWidth = window.chart.candleWidth || 8;
                }
                
                // Re-render
                panel1.chartInstance.render();
                console.log(`⏱️ Synced linked pane timeframe to ${timeframe}`);
            }
        } else if (window.panelManager && window.panelManager.getCurrentLayout() !== '1') {
            // Regular multi-panel mode (not linked)
            window.panelManager.updateSelectedPanelTimeframe(timeframe);
        } else {
            // Single panel mode - update main chart only
            if (this.chart && typeof this.chart.setTimeframe === 'function') {
                this.chart.setTimeframe(timeframe);
            } else {
                console.error('Chart setTimeframe method not available');
            }
        }
    }

    /**
     * Update the UI (favorites and stars)
     */
    updateUI() {
        // Update favorite buttons in toolbar
        this.renderFavoriteButtons();

        // Update star icons in dropdown
        const items = document.querySelectorAll('.timeframe-dropdown-item');
        items.forEach(item => {
            const timeframe = item.dataset.timeframe;
            const star = item.querySelector('.timeframe-dropdown-item-star');
            if (star) {
                if (this.isFavorite(timeframe)) {
                    star.classList.add('active');
                } else {
                    star.classList.remove('active');
                }
            }
        });

        // Update selected state
        this.selectTimeframe(this.currentTimeframe);
    }

    /**
     * Render favorite buttons in toolbar
     */
    renderFavoriteButtons() {
        const container = document.getElementById('timeframeFavorites');
        if (!container) return;

        container.innerHTML = '';

        this.getSortedFavorites().forEach(timeframe => {
            const btn = document.createElement('button');
            btn.className = 'timeframe-btn';
            btn.dataset.timeframe = timeframe;
            btn.textContent = this.getTimeframeLabel(timeframe);
            
            if (timeframe === this.currentTimeframe) {
                btn.classList.add('active');
            }

            btn.addEventListener('click', (e) => {
                // Check if we're in multi-panel mode
                if (window.panelManager && window.panelManager.getCurrentLayout() !== '1') {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    
                    console.log(`⌚ Timeframe ${timeframe} → Update selected panel`);
                    
                    // Update the selected panel's timeframe
                    window.panelManager.updateSelectedPanelTimeframe(timeframe);
                    
                    return false;
                }
                
                // In single panel mode, select the timeframe normally
                this.selectTimeframe(timeframe);
            }, true); // Use capture phase to intercept early

            container.appendChild(btn);
        });
        
        // Also render in sidebar
        this.renderSidebarTimeframes();
    }
    
    /**
     * Render timeframe buttons in right sidebar
     */
    renderSidebarTimeframes() {
        const sidebarContainer = document.getElementById('sidebarTimeframes');
        
        if (!sidebarContainer) return;

        // Clear and render ALL favorite timeframes (including current)
        sidebarContainer.innerHTML = '';

        this.getSortedFavorites().forEach(timeframe => {
            // For active timeframe, create container with button + arrow
            if (timeframe === this.currentTimeframe) {
                const container = document.createElement('div');
                container.className = 'sidebar-current-timeframe-container';
                
                // Create the main button
                const btn = document.createElement('button');
                btn.className = 'sidebar-current-timeframe';
                btn.dataset.timeframe = timeframe;
                btn.textContent = this.getTimeframeLabel(timeframe);
                
                // Create arrow button (absolute positioned)
                const arrowBtn = document.createElement('button');
                arrowBtn.className = 'sidebar-timeframe-arrow';
                
                const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                arrow.setAttribute('viewBox', '0 0 12 8');
                arrow.setAttribute('fill', 'none');
                arrow.setAttribute('stroke', 'currentColor');
                arrow.setAttribute('stroke-width', '1.5');
                
                const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
                polyline.setAttribute('points', '2,2 6,6 10,2');
                polyline.setAttribute('stroke-linecap', 'round');
                polyline.setAttribute('stroke-linejoin', 'round');
                
                arrow.appendChild(polyline);
                arrowBtn.appendChild(arrow);
                
                // Handle arrow click to open dropdown menu
                arrowBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const menu = document.getElementById('timeframeDropdownMenu');
                    const isOpen = arrowBtn.classList.contains('open');
                    
                    if (!isOpen) {
                        // Position the menu to the right of the button
                        const rect = btn.getBoundingClientRect();
                        menu.style.top = `${rect.top}px`;
                        menu.style.left = `${rect.right + 8}px`;
                        menu.style.display = 'block';
                        arrowBtn.classList.add('open');
                    } else {
                        menu.style.display = 'none';
                        arrowBtn.classList.remove('open');
                    }
                });
                
                btn.addEventListener('click', (e) => {
                    // Check if we're in multi-panel mode
                    if (window.panelManager && window.panelManager.getCurrentLayout() !== '1') {
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        
                        console.log(`⌚ Sidebar timeframe ${timeframe} → Update selected panel`);
                        window.panelManager.updateSelectedPanelTimeframe(timeframe);
                        return false;
                    }
                    
                    // In single panel mode, select the timeframe normally
                    this.selectTimeframe(timeframe);
                }, true);
                
                container.appendChild(btn);
                container.appendChild(arrowBtn);
                sidebarContainer.appendChild(container);
            } else {
                // For non-active timeframes, create simple button
                const btn = document.createElement('button');
                btn.className = 'sidebar-timeframe-btn';
                btn.dataset.timeframe = timeframe;
                btn.textContent = this.getTimeframeLabel(timeframe);
                
                btn.addEventListener('click', (e) => {
                    // Check if we're in multi-panel mode
                    if (window.panelManager && window.panelManager.getCurrentLayout() !== '1') {
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        
                        console.log(`⌚ Sidebar timeframe ${timeframe} → Update selected panel`);
                        window.panelManager.updateSelectedPanelTimeframe(timeframe);
                        return false;
                    }
                    
                    // In single panel mode, select the timeframe normally
                    this.selectTimeframe(timeframe);
                }, true);
                
                sidebarContainer.appendChild(btn);
            }
        });
    }
}

// Export for use in main chart
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TimeframeFavorites;
}
