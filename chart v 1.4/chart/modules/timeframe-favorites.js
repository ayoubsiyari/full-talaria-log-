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
     * Get full display name for timeframe (used in tooltips)
     */
    getTimeframeFullName(timeframe) {
        const tf = String(timeframe || '').toLowerCase().trim();
        const names = {
            '1m': '1 minute', '2m': '2 minutes', '3m': '3 minutes', '4m': '4 minutes',
            '5m': '5 minutes', '10m': '10 minutes', '15m': '15 minutes',
            '30m': '30 minutes', '45m': '45 minutes',
            '1h': '1 hour', '2h': '2 hours', '4h': '4 hours',
            '6h': '6 hours', '12h': '12 hours',
            '1d': '1 day', '1w': '1 week', '1mo': '1 month'
        };
        if (names[tf]) return names[tf];
        const match = tf.match(/^(\d+)(m|h|d|w|mo)$/);
        if (match) {
            const v = parseInt(match[1]);
            const unitMap = { m: 'minute', h: 'hour', d: 'day', w: 'week', mo: 'month' };
            const unit = unitMap[match[2]] || match[2];
            return `${v} ${unit}${v !== 1 ? 's' : ''}`;
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

        // Wire static clock button above TF list to open flyout
        const sidebarTfFlyoutBtn = document.getElementById('sidebarTfFlyoutBtn');
        if (sidebarTfFlyoutBtn) {
            sidebarTfFlyoutBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._openTfFlyout(sidebarTfFlyoutBtn);
            });
        }

        // Wire chevron button below to also open flyout
        const sidebarTfChevronBtn = document.getElementById('sidebarTfChevronBtn');
        if (sidebarTfChevronBtn) {
            sidebarTfChevronBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._openTfFlyout(sidebarTfFlyoutBtn);
            });
        }

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

        sidebarContainer.innerHTML = '';

        this.getSortedFavorites().forEach(timeframe => {
            const isActive = timeframe === this.currentTimeframe;
            const btn = document.createElement('button');
            btn.className = isActive ? 'sidebar-current-timeframe' : 'sidebar-timeframe-btn';
            btn.dataset.timeframe = timeframe;
            btn.textContent = this.getTimeframeLabel(timeframe);
            btn.dataset.tooltip = this.getTimeframeFullName(timeframe);

            // All buttons select the timeframe on click
            btn.addEventListener('click', (e) => {
                if (window.panelManager && window.panelManager.getCurrentLayout() !== '1') {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    window.panelManager.updateSelectedPanelTimeframe(timeframe);
                    return false;
                }
                this.selectTimeframe(timeframe);
            }, true);

            sidebarContainer.appendChild(btn);
        });
    }

    /**
     * Open the 3-level TF flyout panel anchored to the given button
     */
    _openTfFlyout(anchorBtn) {
        // Remove existing flyout if any
        this._closeTfFlyout();

        const TF_CATEGORIES = [
            {
                label: 'Minutes',
                values: ['1m','2m','3m','4m','5m','10m','15m','30m','45m']
            },
            {
                label: 'Hours',
                values: ['1h','2h','4h','6h','12h']
            },
            {
                label: 'Days',
                values: ['1d','1w','1mo']
            }
        ];

        // Build flyout DOM
        const flyout = document.createElement('div');
        flyout.className = 'tf-flyout open';
        flyout.id = '_tfFlyout';

        const catPanel = document.createElement('div');
        catPanel.className = 'tf-flyout-categories';

        const valPanel = document.createElement('div');
        valPanel.className = 'tf-flyout-values';
        flyout.appendChild(catPanel);
        flyout.appendChild(valPanel);

        // Helper: chevron SVG
        const chevron = () => {
            const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            s.setAttribute('viewBox', '0 0 10 10');
            s.setAttribute('fill', 'none');
            s.setAttribute('stroke-width', '1.5');
            s.setAttribute('stroke-linecap', 'round');
            s.setAttribute('stroke-linejoin', 'round');
            const p = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
            p.setAttribute('points', '3,2 7,5 3,8');
            s.appendChild(p);
            return s;
        };

        let activeCategory = null;

        const showValues = (cat, catBtn) => {
            catPanel.querySelectorAll('.tf-flyout-cat-btn').forEach(b => b.classList.remove('active'));
            catBtn.classList.add('active');
            activeCategory = cat.label;

            valPanel.innerHTML = '';
            cat.values.forEach(tf => {
                const vBtn = document.createElement('button');
                vBtn.className = 'tf-flyout-val-btn' + (tf === this.currentTimeframe ? ' selected' : '');

                // Label
                const lbl = document.createElement('span');
                lbl.className = 'tf-val-label';
                lbl.textContent = this.getTimeframeLabel(tf);

                // Star (favorite toggle)
                const star = document.createElement('span');
                star.className = 'tf-flyout-val-star' + (this.isFavorite(tf) ? ' favorited' : '');
                star.title = this.isFavorite(tf) ? 'Remove from sidebar' : 'Add to sidebar';
                const starSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                starSvg.setAttribute('viewBox', '0 0 24 24');
                const starPoly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                starPoly.setAttribute('points', '12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26');
                starSvg.appendChild(starPoly);
                star.appendChild(starSvg);

                star.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.toggleFavorite(tf);
                    const isFav = this.isFavorite(tf);
                    star.classList.toggle('favorited', isFav);
                    star.title = isFav ? 'Remove from sidebar' : 'Add to sidebar';
                    this.renderSidebarTimeframes();
                });

                vBtn.appendChild(lbl);
                vBtn.appendChild(star);

                vBtn.addEventListener('click', (e) => {
                    if (e.target === star || star.contains(e.target)) return;
                    e.stopPropagation();
                    this._closeTfFlyout();
                    if (window.panelManager && window.panelManager.getCurrentLayout() !== '1') {
                        window.panelManager.updateSelectedPanelTimeframe(tf);
                    } else {
                        this.selectTimeframe(tf);
                    }
                });
                valPanel.appendChild(vBtn);
            });
            valPanel.classList.add('open');
        };

        TF_CATEGORIES.forEach(cat => {
            const catBtn = document.createElement('button');
            catBtn.className = 'tf-flyout-cat-btn';
            catBtn.appendChild(document.createTextNode(cat.label));
            catBtn.appendChild(chevron());

            catBtn.addEventListener('mouseenter', () => showValues(cat, catBtn));
            catBtn.addEventListener('click', () => showValues(cat, catBtn));

            catPanel.appendChild(catBtn);
        });

        // Divider
        const divider = document.createElement('div');
        divider.className = 'tf-flyout-divider';
        catPanel.appendChild(divider);

        // Custom button
        const customBtn = document.createElement('button');
        customBtn.className = 'tf-flyout-cat-btn tf-flyout-cat-custom';
        const plusSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        plusSvg.setAttribute('viewBox', '0 0 24 24');
        plusSvg.setAttribute('fill', 'none');
        plusSvg.setAttribute('stroke-width', '2');
        plusSvg.setAttribute('stroke-linecap', 'round');
        const l1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        l1.setAttribute('x1', '12'); l1.setAttribute('y1', '5');
        l1.setAttribute('x2', '12'); l1.setAttribute('y2', '19');
        const l2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        l2.setAttribute('x1', '5');  l2.setAttribute('y1', '12');
        l2.setAttribute('x2', '19'); l2.setAttribute('y2', '12');
        plusSvg.appendChild(l1); plusSvg.appendChild(l2);
        customBtn.appendChild(plusSvg);
        customBtn.appendChild(document.createTextNode('Custom'));
        customBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._closeTfFlyout();
            const modal = document.getElementById('customTimeframeModal');
            if (modal) {
                modal.classList.add('open');
                const input = document.getElementById('customTimeframeValue');
                if (input) { input.focus(); input.select(); }
            }
        });
        catPanel.appendChild(customBtn);

        // Position: to the right of the sidebar (anchor button)
        document.body.appendChild(flyout);
        const rect = anchorBtn.getBoundingClientRect();
        flyout.style.top = `${rect.top}px`;
        flyout.style.left = `${rect.right + 8}px`;

        // Auto-open the category that contains current TF
        const currentCat = TF_CATEGORIES.find(c => c.values.includes(this.currentTimeframe));
        if (currentCat) {
            const idx = TF_CATEGORIES.indexOf(currentCat);
            const catBtns = catPanel.querySelectorAll('.tf-flyout-cat-btn');
            if (catBtns[idx]) showValues(currentCat, catBtns[idx]);
        }

        // Close on outside click
        this._tfFlyoutOutsideHandler = (e) => {
            if (!flyout.contains(e.target) && e.target !== anchorBtn) {
                this._closeTfFlyout();
            }
        };
        setTimeout(() => document.addEventListener('click', this._tfFlyoutOutsideHandler), 0);
    }

    _closeTfFlyout() {
        const existing = document.getElementById('_tfFlyout');
        if (existing) existing.remove();
        if (this._tfFlyoutOutsideHandler) {
            document.removeEventListener('click', this._tfFlyoutOutsideHandler);
            this._tfFlyoutOutsideHandler = null;
        }
    }
}

// Export for use in main chart
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TimeframeFavorites;
}
