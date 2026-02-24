/**
 * Custom Color Picker - TradingView Style (Dark Theme)
 * Grid-based color palette with opacity slider
 */

class ColorPicker {
    constructor() {
        this.picker = null;
        this.visible = false;
        this.currentCallback = null;
        this.currentButton = null;
        this.baseColor = '#2962FF';
        this.opacity = 1;
        this.swatches = [];
        
        // TradingView color palette (dark theme)
        this.colors = [
            ['#FFFFFF', '#EBEBEB', '#D6D6D6', '#BFBFBF', '#A8A8A8', '#8F8F8F', '#757575', '#5C5C5C', '#434343', '#000000'],
            ['#FF4444', '#FF9500', '#FFEB3B', '#4CAF50', '#00BCD4', '#00E5FF', '#2962FF', '#7B68EE', '#E040FB', '#FF4081'],
            ['#FFCDD2', '#FFE0B2', '#FFF9C4', '#C8E6C9', '#B2EBF2', '#B2F5FF', '#BBDEFB', '#D1C4E9', '#E1BEE7', '#F8BBD0'],
            ['#FFAB91', '#FFCC80', '#FFF59D', '#A5D6A7', '#80DEEA', '#80E5FF', '#90CAF9', '#B39DDB', '#CE93D8', '#F48FB1'],
            ['#FF8A65', '#FFB74D', '#FFF176', '#81C784', '#4DD0E1', '#4DD5FF', '#64B5F6', '#9575CD', '#BA68C8', '#F06292'],
            ['#FF5252', '#FFA726', '#FFEE58', '#66BB6A', '#26C6DA', '#26D4FF', '#42A5F5', '#7E57C2', '#AB47BC', '#EC407A'],
            ['#E53935', '#FB8C00', '#FDD835', '#43A047', '#00ACC1', '#00B8D4', '#1E88E5', '#5E35B1', '#8E24AA', '#D81B60'],
            ['#C62828', '#E65100', '#F57F17', '#2E7D32', '#00838F', '#00838F', '#1565C0', '#4527A0', '#6A1B9A', '#AD1457']
        ];
        
        this.recentColors = ['#131722', '#2962FF', '#1E3A5F', '#262B3E'];
        
        this.init();
    }

    init() {
        // Add styles for slider thumb
        this.addStyles();
        
        // Create picker element
        this.picker = document.createElement('div');
        this.picker.id = 'custom-color-picker';
        this.picker.className = 'custom-color-picker';
        this.picker.style.cssText = `
            position: fixed;
            display: none;
            background: #000000;
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 10px;
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.65);
            padding: 14px;
            z-index: 1000020;
            user-select: none;
            width: max-content;
            box-sizing: border-box;
        `;
        
        document.body.appendChild(this.picker);
        
        // Build the picker UI
        this.buildUI();
        
        // Close on outside click
        // Use capture phase so we still close even if other menus stop propagation.
        document.addEventListener('mousedown', (e) => {
            if (!this.visible) return;
            if (this.picker.contains(e.target)) return;
            if (this.currentButton && typeof this.currentButton.contains === 'function' && this.currentButton.contains(e.target)) return;
            this.hide();
        }, true);
    }
    
    addStyles() {
        if (document.getElementById('color-picker-global-styles')) return;
        const style = document.createElement('style');
        style.id = 'color-picker-global-styles';
        style.textContent = `
            .custom-color-picker input[type="range"] {
                -webkit-appearance: none;
                appearance: none;
                height: 6px;
                border-radius: 3px;
                outline: none;
                cursor: pointer;
            }
            .custom-color-picker input[type="range"]::-webkit-slider-thumb {
                -webkit-appearance: none;
                width: 16px;
                height: 16px;
                border-radius: 50%;
                background: #ffffff;
                border: 2px solid #3a3e49;
                cursor: pointer;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
            }
            .custom-color-picker input[type="range"]::-moz-range-thumb {
                width: 16px;
                height: 16px;
                border-radius: 50%;
                background: #ffffff;
                border: 2px solid #3a3e49;
                cursor: pointer;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
            }
            .custom-color-picker .color-swatch {
                width: 22px;
                height: 22px;
                border-radius: 3px;
                cursor: pointer;
                border: 1px solid rgba(42, 46, 57, 0.9);
                box-sizing: border-box;
                transition: all 0.15s ease;
            }
            .custom-color-picker .color-swatch:hover {
                transform: scale(1.1);
                border-color: #ffffff;
            }
            .custom-color-picker .color-swatch.selected {
                border-color: #ffffff;
                box-shadow: 0 0 0 1px #2a2e39;
            }
        `;
        document.head.appendChild(style);
    }

    buildUI() {
        this.picker.innerHTML = '';
        this.swatches = [];
        
        // Color grid
        const grid = document.createElement('div');
        grid.style.cssText = `
            display: grid;
            grid-template-columns: repeat(10, 22px);
            gap: 4px;
            width: max-content;
        `;
        
        this.colors.forEach(row => {
            row.forEach(color => {
                const swatch = document.createElement('div');
                swatch.className = 'color-swatch';
                swatch.dataset.color = color;
                swatch.style.background = color;
                swatch.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.baseColor = color;
                    this.updateSelectedSwatches();
                    this.updateOpacityGradient();
                    this.applyColor();
                    this.hide();
                });
                grid.appendChild(swatch);
                this.swatches.push(swatch);
            });
        });
        this.picker.appendChild(grid);
        
        const divider = document.createElement('div');
        divider.style.cssText = 'height: 1px; background: rgba(255, 255, 255, 0.10); margin: 14px 0;';
        this.picker.appendChild(divider);
        
        // Opacity section
        const opacitySection = document.createElement('div');
        opacitySection.style.cssText = 'margin-top: 12px;';
        
        const opacityLabel = document.createElement('div');
        opacityLabel.style.cssText = 'color: #8a8e99; font-size: 12px; margin-bottom: 10px;';
        opacityLabel.textContent = 'Opacity';
        opacitySection.appendChild(opacityLabel);
        
        const opacityControl = document.createElement('div');
        opacityControl.style.cssText = 'display: flex; align-items: center; gap: 12px;';
        
        this.opacitySlider = document.createElement('input');
        this.opacitySlider.type = 'range';
        this.opacitySlider.min = '0';
        this.opacitySlider.max = '100';
        this.opacitySlider.value = '100';
        this.opacitySlider.style.cssText = 'flex: 1;';
        this.opacitySlider.addEventListener('input', (e) => {
            e.stopPropagation();
            this.opacity = parseInt(this.opacitySlider.value) / 100;
            this.applyColor();
        });
        this.opacitySlider.addEventListener('click', (e) => e.stopPropagation());
        opacityControl.appendChild(this.opacitySlider);

        const opacityInputWrapper = document.createElement('div');
        opacityInputWrapper.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        this.opacityInput = document.createElement('input');
        this.opacityInput.type = 'number';
        this.opacityInput.min = '0';
        this.opacityInput.max = '100';
        this.opacityInput.step = '1';
        this.opacityInput.value = '100';
        this.opacityInput.style.cssText = `
            width: 64px;
            background: rgba(19, 23, 34, 0.9);
            border: 1px solid #3a3e49;
            border-radius: 6px;
            color: #ffffff;
            padding: 8px 10px;
            font-size: 14px;
            font-weight: 600;
            outline: none;
            text-align: center;
        `;
        this.opacityInput.addEventListener('click', (e) => e.stopPropagation());
        this.opacityInput.addEventListener('input', (e) => {
            e.stopPropagation();
            let v = parseInt(this.opacityInput.value);
            if (isNaN(v)) v = 0;
            if (v < 0) v = 0;
            if (v > 100) v = 100;
            this.opacityInput.value = String(v);
            this.opacitySlider.value = String(v);
            this.opacity = v / 100;
            this.applyColor();
        });
        this.opacityInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                this.hide();
            }
        });

        const opacityPercent = document.createElement('span');
        opacityPercent.style.cssText = 'color: #d1d4dc; font-size: 14px; font-weight: 600;';
        opacityPercent.textContent = '%';

        opacityInputWrapper.appendChild(this.opacityInput);
        opacityInputWrapper.appendChild(opacityPercent);
        opacityControl.appendChild(opacityInputWrapper);
        
        opacitySection.appendChild(opacityControl);
        this.picker.appendChild(opacitySection);
    }
    
    updateSelectedSwatches() {
        const normalized = this.baseColor.toUpperCase();
        this.swatches.forEach(swatch => {
            if (swatch.dataset.color.toUpperCase() === normalized) {
                swatch.classList.add('selected');
            } else {
                swatch.classList.remove('selected');
            }
        });
    }
    
    updateOpacityGradient() {
        const hex = this.baseColor.replace('#', '');
        const r = parseInt(hex.substr(0, 2), 16) || 0;
        const g = parseInt(hex.substr(2, 2), 16) || 0;
        const b = parseInt(hex.substr(4, 2), 16) || 0;
        this.opacitySlider.style.background = `linear-gradient(to right, rgba(${r},${g},${b},0), rgba(${r},${g},${b},1))`;
    }
    
    applyColor() {
        const hex = this.baseColor.replace('#', '');
        const r = parseInt(hex.substr(0, 2), 16) || 0;
        const g = parseInt(hex.substr(2, 2), 16) || 0;
        const b = parseInt(hex.substr(4, 2), 16) || 0;
        const finalColor = this.opacity < 1 ? `rgba(${r},${g},${b},${this.opacity})` : this.baseColor;
        const pct = Math.round(this.opacity * 100);
        if (this.opacityInput) {
            this.opacityInput.value = String(pct);
        }
        
        if (this.currentCallback) {
            this.currentCallback(finalColor);
        }
    }
    
    parseColor(color) {
        if (!color) return { hex: '#2962FF', opacity: 1 };
        
        if (color.startsWith('rgba')) {
            const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
            if (match) {
                const r = parseInt(match[1]);
                const g = parseInt(match[2]);
                const b = parseInt(match[3]);
                const opacity = match[4] ? parseFloat(match[4]) : 1;
                const hex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
                return { hex, opacity };
            }
        }
        return { hex: color, opacity: 1 };
    }

    pickThickness(w) {
        if (this.options && this.options.onThickness) {
            this.options.onThickness(w);
            this.options.thickness = w;
        }
        this._rebuildExtended();
    }

    pickLineStyle(s) {
        if (this.options && this.options.onLineStyle) {
            this.options.onLineStyle(s);
            this.options.lineStyle = s;
        }
        this._rebuildExtended();
    }

    _rebuildExtended() {
        const old = this.picker.querySelector('.cp-extended');
        if (old) old.remove();
        const opts = this.options || {};
        if (!opts.showThickness && !opts.showLineStyle) return;
        const ext = document.createElement('div');
        ext.className = 'cp-extended';
        if (opts.showThickness) {
            const section = document.createElement('div');
            section.style.cssText = 'margin-top:12px;';
            const label = document.createElement('div');
            label.style.cssText = 'color:#8a8e99;font-size:12px;margin-bottom:8px;';
            label.textContent = 'Thickness';
            section.appendChild(label);
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;gap:4px;';
            [1, 2, 3, 4].forEach(w => {
                const active = opts.thickness === w;
                const btn = document.createElement('div');
                btn.style.cssText = 'flex:1;height:32px;border-radius:6px;border:2px solid '+(active?'#2962ff':'rgba(255,255,255,0.12)')+';background:'+(active?'rgba(41,98,255,0.15)':'transparent')+';cursor:pointer;display:flex;align-items:center;justify-content:center;';
                const inner = document.createElement('div');
                inner.style.cssText = 'width:80%;height:'+w+'px;background:#d1d4dc;border-radius:1px;';
                btn.appendChild(inner);
                btn.addEventListener('click', (e) => { e.stopPropagation(); this.pickThickness(w); });
                row.appendChild(btn);
            });
            section.appendChild(row);
            ext.appendChild(section);
        }
        if (opts.showLineStyle) {
            const section = document.createElement('div');
            section.style.cssText = 'margin-top:12px;';
            const label = document.createElement('div');
            label.style.cssText = 'color:#8a8e99;font-size:12px;margin-bottom:8px;';
            label.textContent = 'Line style';
            section.appendChild(label);
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;gap:4px;';
            const dashMap = { solid: 'none', dashed: '6,3', dotted: '2,3' };
            ['solid', 'dashed', 'dotted'].forEach(s => {
                const active = opts.lineStyle === s;
                const btn = document.createElement('div');
                btn.style.cssText = 'flex:1;height:32px;border-radius:6px;border:2px solid '+(active?'#2962ff':'rgba(255,255,255,0.12)')+';background:'+(active?'rgba(41,98,255,0.15)':'transparent')+';cursor:pointer;display:flex;align-items:center;justify-content:center;';
                const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
                svg.setAttribute('width','30'); svg.setAttribute('height','10');
                const line = document.createElementNS('http://www.w3.org/2000/svg','line');
                line.setAttribute('x1','2'); line.setAttribute('y1','5');
                line.setAttribute('x2','28'); line.setAttribute('y2','5');
                line.setAttribute('stroke','#d1d4dc'); line.setAttribute('stroke-width','1.5');
                line.setAttribute('stroke-dasharray', dashMap[s]||'none');
                svg.appendChild(line);
                btn.appendChild(svg);
                btn.addEventListener('click', (e) => { e.stopPropagation(); this.pickLineStyle(s); });
                row.appendChild(btn);
            });
            section.appendChild(row);
            ext.appendChild(section);
        }
        this.picker.appendChild(ext);
    }

    show(x, y, currentColor, callback, buttonElement, options) {
        this.visible = true;
        this.currentCallback = callback;
        this.currentButton = buttonElement;
        this.options = options || {};
        this._rebuildExtended();
        
        // Parse current color
        const parsed = this.parseColor(currentColor);
        this.baseColor = parsed.hex;
        this.opacity = parsed.opacity;
        
        // Update UI
        this.opacitySlider.value = Math.round(this.opacity * 100);
        if (this.opacityInput) {
            this.opacityInput.value = String(Math.round(this.opacity * 100));
        }
        this.updateSelectedSwatches();
        this.updateOpacityGradient();
        
        // Position picker
        this.picker.style.display = 'block';
        const rect = this.picker.getBoundingClientRect();
        
        let top = y + 10;
        let left = x;
        
        // Adjust if off-screen
        if (top + rect.height > window.innerHeight) top = y - rect.height - 10;
        if (left + rect.width > window.innerWidth) left = window.innerWidth - rect.width - 10;
        if (left < 10) left = 10;
        if (top < 10) top = 10;
        
        this.picker.style.top = top + 'px';
        this.picker.style.left = left + 'px';
    }

    hide() {
        this.visible = false;
        this.picker.style.display = 'none';
        this.currentCallback = null;
        this.currentButton = null;
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ColorPicker;
}

if (typeof window !== 'undefined' && typeof window.openColorPicker !== 'function') {
    window.openColorPicker = function (currentColor, callback, buttonElement, options) {
        if (!window.__tvColorPickerInstance) {
            if (typeof ColorPicker === 'undefined') return;
            window.__tvColorPickerInstance = new ColorPicker();
        }

        const picker = window.__tvColorPickerInstance;
        if (!picker || typeof picker.show !== 'function') return;

        let x = 10;
        let y = 10;
        if (buttonElement && typeof buttonElement.getBoundingClientRect === 'function') {
            const rect = buttonElement.getBoundingClientRect();
            // Match Settings behavior: open to the right of the control, top-aligned.
            // ColorPicker.show adds +10px vertical offset, so subtract 10 to align.
            x = rect.right + 10;
            y = rect.top - 10;
        }

        picker.show(x, y, currentColor, callback, buttonElement, options);
    };
}
