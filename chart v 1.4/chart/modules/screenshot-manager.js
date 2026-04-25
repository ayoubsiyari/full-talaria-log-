/**
 * Screenshot Manager
 * Handles chart screenshot functionality with various options
 */

class ScreenshotManager {
    constructor(chart) {
        this.chart = chart;
        this.init();
    }

    async copyText(text) {
        try {
            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function' && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch (err) {
            // Ignore and fall back
        }
        try {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.setAttribute('readonly', '');
            textarea.style.position = 'fixed';
            textarea.style.top = '0';
            textarea.style.left = '0';
            textarea.style.width = '2em';
            textarea.style.height = '2em';
            textarea.style.padding = '0';
            textarea.style.border = 'none';
            textarea.style.outline = 'none';
            textarea.style.boxShadow = 'none';
            textarea.style.background = 'transparent';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(textarea);
            return !!ok;
        } catch (err) {
            return false;
        }
    }
    
    init() {
        console.log('📸 Screenshot Manager initialized');
        
        this.initDropdown();
        this.initKeyboardShortcuts();
    }
    
    /**
     * Initialize dropdown menu
     */
    initDropdown() {
        const screenshotBtn = document.getElementById('screenshotBtn');
        const dropdown = document.getElementById('screenshotDropdownMenu');
        const container = document.getElementById('screenshotDropdownContainer');
        
        if (!screenshotBtn || !dropdown) {
            console.warn('Screenshot dropdown elements not found');
            return;
        }
        
        // Toggle dropdown on button click
        screenshotBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('open');
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!container.contains(e.target)) {
                dropdown.classList.remove('open');
            }
        });
        
        // Handle dropdown item clicks
        document.getElementById('screenshotDownload')?.addEventListener('click', () => {
            dropdown.classList.remove('open');
            this.takeQuickScreenshot('download');
        });
        
        document.getElementById('screenshotCopy')?.addEventListener('click', () => {
            dropdown.classList.remove('open');
            this.takeQuickScreenshot('copy');
        });
        
        document.getElementById('screenshotCopyLink')?.addEventListener('click', () => {
            dropdown.classList.remove('open');
            this.takeQuickScreenshot('link');
        });
        
        document.getElementById('screenshotOpenTab')?.addEventListener('click', () => {
            dropdown.classList.remove('open');
            this.takeQuickScreenshot('tab');
        });
    }
    
    /**
     * Initialize keyboard shortcuts
     */
    initKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // ⌥⌘S - Download image
            if (e.altKey && e.metaKey && e.key.toLowerCase() === 's') {
                e.preventDefault();
                this.takeQuickScreenshot('download');
            }
            // ⇧⌘S - Copy image
            else if (e.shiftKey && e.metaKey && e.key.toLowerCase() === 's') {
                e.preventDefault();
                this.takeQuickScreenshot('copy');
            }
            // ⌥S - Copy link
            else if (e.altKey && !e.metaKey && !e.shiftKey && e.key.toLowerCase() === 's') {
                e.preventDefault();
                this.takeQuickScreenshot('link');
            }
        });
    }
    
    /**
     * Take a quick screenshot with default settings
     */
    async takeQuickScreenshot(action = 'download') {
        try {
            console.log('📸 Quick screenshot:', action);
            
            // Get the chart container
            let targetElement = document.getElementById('chart-container');
            if (!targetElement) targetElement = document.querySelector('.chart-wrapper');
            if (!targetElement) targetElement = document.querySelector('.container');
            if (!targetElement) targetElement = document.body;
            
            // Load html2canvas if not already loaded
            if (typeof html2canvas === 'undefined') {
                await this.loadHtml2Canvas();
            }
            
            // Take screenshot
            const canvas = await html2canvas(targetElement, {
                backgroundColor: this.getScreenshotBackgroundColor(targetElement),
                useCORS: true,
                allowTaint: true,
                foreignObjectRendering: false,
                scale: 2,
                width: targetElement.offsetWidth,
                height: targetElement.offsetHeight
            });
            
            // Add watermark
            this.addWatermark(canvas);
            
            // Handle action
            if (action === 'download') {
                this.downloadImage(canvas);
            } else if (action === 'copy') {
                await this.copyToClipboard(canvas);
            } else if (action === 'link') {
                await this.copyLink(canvas);
            } else if (action === 'tab') {
                this.openInNewTab(canvas);
            }
            
        } catch (error) {
            console.error('Screenshot error:', error);
            this.showNotification('Failed to capture screenshot', 'error');
        }
    }
    
    /**
     * Download image
     */
    downloadImage(canvas) {
        canvas.toBlob((blob) => {
            if (!blob) {
                this.showNotification('Failed to create image', 'error');
                return;
            }
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            a.href = url;
            a.download = `Talaria-Chart-${timestamp}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

        }, 'image/png');
    }
    
    /**
     * Copy image to clipboard
     */
    async copyToClipboard(canvas) {
        try {
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            if (!blob) throw new Error('Failed to create blob');
            
            const clipboardItem = new ClipboardItem({ 'image/png': blob });
            await navigator.clipboard.write([clipboardItem]);
            this.showNotification('Screenshot copied to clipboard!', 'success');
        } catch (err) {
            console.error('Clipboard error:', err);
            this.showNotification('Failed to copy to clipboard', 'error');
        }
    }
    
    /**
     * Copy image as data URL link
     */
    async copyLink(canvas) {
        try {
            const dataUrl = canvas.toDataURL('image/png');
            const ok = await this.copyText(dataUrl);
            if (ok) {
                this.showNotification('Image link copied!', 'success');
                return;
            }
            window.prompt('Copy this screenshot link:', dataUrl);
            this.showNotification('Copy link opened (clipboard not available)', 'warning');
        } catch (err) {
            console.error('Copy link error:', err);
            this.showNotification('Failed to copy link', 'error');
        }
    }
    
    /**
     * Open screenshot in new tab
     */
    openInNewTab(canvas) {
        const dataUrl = canvas.toDataURL('image/png');
        const newTab = window.open();
        if (newTab) {
            newTab.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Talaria Chart Screenshot</title>
                    <style>
                        body { margin: 0; background: #131722; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
                        img { max-width: 100%; max-height: 100vh; box-shadow: 0 8px 32px rgba(0,0,0,0.4); }
                    </style>
                </head>
                <body>
                    <img src="${dataUrl}" alt="Talaria Chart Screenshot">
                </body>
                </html>
            `);
            newTab.document.close();
            this.showNotification('Screenshot opened in new tab!', 'success');
        } else {
            this.showNotification('Pop-up blocked. Please allow pop-ups.', 'warning');
        }
    }
    
    /**
     * Show screenshot options modal
     */
    showScreenshotOptions() {
        // Remove existing modal if any
        const existingModal = document.getElementById('screenshotModal');
        if (existingModal) existingModal.remove();
        
        const modal = document.createElement('div');
        modal.id = 'screenshotModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.85);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 100000;
            backdrop-filter: blur(4px);
        `;
        
        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: #1a1d28;
            border-radius: 12px;
            padding: 24px;
            max-width: 450px;
            width: 90%;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
            border: 1px solid #2a2e39;
        `;
        
        modalContent.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3 style="color: #fff; margin: 0; font-size: 18px; display: flex; align-items: center; gap: 8px;">
                    📸 Take Screenshot
                </h3>
                <button id="closeScreenshotModal" style="
                    background: rgba(255, 255, 255, 1);
                    border: 1px solid rgba(255,255,255,0.1);
                    color: #787b86;
                    font-size: 20px;
                    cursor: default;
                    padding: 4px 8px;
                    border-radius: 6px;
                    transition: all 0.2s;
                " onmouseover="this.style.background='rgba(255,255,255,0.1)'; this.style.color='#fff';" 
                   onmouseout="this.style.background='rgba(255,255,255,0.05)'; this.style.color='#787b86';">×</button>
            </div>
            
            <!-- Screenshot Options -->
            <div style="margin-bottom: 24px;">
                <div style="color: #787b86; font-size: 12px; margin-bottom: 12px; font-weight: 600;">Screenshot Options</div>
                
                <!-- Include Elements -->
                <div style="background: rgba(255,255,255,0.03); border-radius: 8px; padding: 16px; margin-bottom: 16px;">
                    <div style="color: #9ca3af; font-size: 11px; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Include in Screenshot</div>
                    
                    <label style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px; cursor: default;">
                        <input type="checkbox" id="includeToolbar" checked style="width: 16px; height: 16px; cursor: default;">
                        <span style="color: #d1d4dc; font-size: 13px;">Toolbar</span>
                    </label>
                    
                    <label style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px; cursor: default;">
                        <input type="checkbox" id="includeSidebar" style="width: 16px; height: 16px; cursor: default;">
                        <span style="color: #d1d4dc; font-size: 13px;">Sidebars</span>
                    </label>
                    
                    <label style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px; cursor: default;">
                        <input type="checkbox" id="includeDrawings" checked style="width: 16px; height: 16px; cursor: default;">
                        <span style="color: #d1d4dc; font-size: 13px;">Drawings & Indicators</span>
                    </label>
                    
                    <label style="display: flex; align-items: center; gap: 10px; cursor: default;">
                        <input type="checkbox" id="includeWatermark" checked style="width: 16px; height: 16px; cursor: default;">
                        <span style="color: #d1d4dc; font-size: 13px;">Watermark (Talaria Chart)</span>
                    </label>
                </div>
                
                <!-- Image Format -->
                <div style="background: rgba(255,255,255,0.03); border-radius: 8px; padding: 16px; margin-bottom: 16px;">
                    <div style="color: #9ca3af; font-size: 11px; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Image Format</div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <label style="display: flex; align-items: center; gap: 8px; cursor: default;">
                            <input type="radio" name="imageFormat" value="png" checked style="cursor: default;">
                            <span style="color: #d1d4dc; font-size: 13px;">PNG</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 8px; cursor: default;">
                            <input type="radio" name="imageFormat" value="jpg" style="cursor: default;">
                            <span style="color: #d1d4dc; font-size: 13px;">JPG</span>
                        </label>
                    </div>
                </div>
                
                <!-- Quality (for JPG) -->
                <div id="qualitySection" style="background: rgba(255,255,255,0.03); border-radius: 8px; padding: 16px; display: none;">
                    <div style="color: #9ca3af; font-size: 11px; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Image Quality</div>
                    <input type="range" id="imageQuality" min="0.5" max="1.0" step="0.1" value="0.9" style="width: 100%; cursor: pointer;">
                    <div style="display: flex; justify-content: space-between; margin-top: 6px;">
                        <span style="color: #787b86; font-size: 11px;">Lower</span>
                        <span id="qualityValue" style="color: #a78bfa; font-size: 11px; font-weight: 600;">90%</span>
                        <span style="color: #787b86; font-size: 11px;">Higher</span>
                    </div>
                </div>
            </div>
            
            <!-- Action Buttons -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <button id="copyToClipboard" style="
                    padding: 12px;
                    background: rgba(59,130,246,0.15);
                    color: #60a5fa;
                    border: 1px solid rgba(59,130,246,0.3);
                    border-radius: 8px;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                " onmouseover="this.style.background='rgba(59,130,246,0.25)';" 
                   onmouseout="this.style.background='rgba(59,130,246,0.15)';">
                    📋 Copy
                </button>
                <button id="downloadScreenshot" style="
                    padding: 12px;
                    background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%);
                    color: #fff;
                    border: none;
                    border-radius: 8px;
                    font-size: 13px;
                    font-weight: 700;
                    cursor: pointer;
                    box-shadow: 0 4px 12px rgba(124,58,237,0.3);
                    transition: all 0.2s;
                " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 16px rgba(124,58,237,0.4)';" 
                   onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(124,58,237,0.3)';">
                    💾 Download
                </button>
            </div>
        `;
        
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
        
        // Event listeners
        document.getElementById('closeScreenshotModal').onclick = () => modal.remove();
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
        
        // Format change listener
        const formatRadios = document.querySelectorAll('input[name="imageFormat"]');
        const qualitySection = document.getElementById('qualitySection');
        formatRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                qualitySection.style.display = e.target.value === 'jpg' ? 'block' : 'none';
            });
        });
        
        // Quality slider
        const qualitySlider = document.getElementById('imageQuality');
        const qualityValue = document.getElementById('qualityValue');
        qualitySlider.addEventListener('input', (e) => {
            qualityValue.textContent = Math.round(e.target.value * 100) + '%';
        });
        
        // Download button
        document.getElementById('downloadScreenshot').onclick = () => this.takeScreenshot('download');
        
        // Copy button
        document.getElementById('copyToClipboard').onclick = () => this.takeScreenshot('copy');
    }
    
    /**
     * Take screenshot
     */
    async takeScreenshot(action = 'download') {
        try {
            // Get options
            const includeToolbar = document.getElementById('includeToolbar')?.checked ?? true;
            const includeSidebar = document.getElementById('includeSidebar')?.checked ?? false;
            const includeDrawings = document.getElementById('includeDrawings')?.checked ?? true;
            const includeWatermark = document.getElementById('includeWatermark')?.checked ?? true;
            const format = document.querySelector('input[name="imageFormat"]:checked')?.value ?? 'png';
            const quality = parseFloat(document.getElementById('imageQuality')?.value ?? 0.9);
            
            console.log('📸 Taking screenshot...', { action, format, includeToolbar, includeSidebar });
            
            this.showNotification('Capturing screenshot...', 'info');
            
            // Close the modal first
            document.getElementById('screenshotModal')?.remove();
            
            // Wait a moment for modal to close
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // Get the chart container - try multiple selectors
            let targetElement = document.getElementById('chart-container');
            if (!targetElement) {
                targetElement = document.querySelector('.chart-wrapper');
            }
            if (!targetElement) {
                targetElement = document.querySelector('.container');
            }
            if (!targetElement) {
                targetElement = document.body;
            }
            
            console.log('📸 Target element:', targetElement.id || targetElement.className || 'body');
            
            // Load html2canvas if not already loaded
            if (typeof html2canvas === 'undefined') {
                console.log('📦 Loading html2canvas...');
                await this.loadHtml2Canvas();
                console.log('✅ html2canvas loaded');
            }
            
            // Temporarily hide/show elements based on options
            const toolbar = document.querySelector('.toolbar');
            const leftSidebar = document.querySelector('.left-sidebar-panel');
            const rightSidebar = document.querySelector('.right-sidebar-panel');
            const iconBar = document.querySelector('.icon-bar');
            
            const originalStyles = new Map();
            
            if (!includeToolbar && toolbar) {
                originalStyles.set(toolbar, toolbar.style.display);
                toolbar.style.display = 'none';
            }
            if (!includeSidebar) {
                if (leftSidebar) {
                    originalStyles.set(leftSidebar, leftSidebar.style.display);
                    leftSidebar.style.display = 'none';
                }
                if (rightSidebar) {
                    originalStyles.set(rightSidebar, rightSidebar.style.display);
                    rightSidebar.style.display = 'none';
                }
                if (iconBar) {
                    originalStyles.set(iconBar, iconBar.style.display);
                    iconBar.style.display = 'none';
                }
            }
            
            console.log('📸 Capturing with html2canvas...');
            
            // Take screenshot with html2canvas
            const canvas = await html2canvas(targetElement, {
                backgroundColor: this.getScreenshotBackgroundColor(targetElement),
                logging: true,
                useCORS: true,
                allowTaint: true,
                foreignObjectRendering: false,
                scale: 2, // Higher resolution
                width: targetElement.offsetWidth,
                height: targetElement.offsetHeight,
                windowWidth: targetElement.scrollWidth,
                windowHeight: targetElement.scrollHeight,
                onclone: (clonedDoc) => {
                    console.log('📸 Document cloned for capture');
                }
            });
            
            console.log('✅ Screenshot captured! Canvas size:', canvas.width, 'x', canvas.height);
            
            // Restore original styles
            originalStyles.forEach((originalDisplay, element) => {
                element.style.display = originalDisplay;
            });
            
            // Add watermark if enabled
            if (includeWatermark) {
                this.addWatermark(canvas);
            }
            
            // Convert to desired format
            const imageType = format === 'jpg' ? 'image/jpeg' : 'image/png';
            const imageQuality = format === 'jpg' ? quality : undefined;
            
            if (action === 'download') {
                // Download
                canvas.toBlob((blob) => {
                    if (!blob) {
                        this.showNotification('Failed to create image', 'error');
                        return;
                    }
                    
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
                    a.href = url;
                    a.download = `Talaria-Chart-${timestamp}.${format}`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    
                    this.showNotification('Screenshot saved!', 'success');
                }, imageType, imageQuality);
                
            } else if (action === 'copy') {
                // Copy to clipboard
                canvas.toBlob(async (blob) => {
                    if (!blob) {
                        this.showNotification('Failed to create image', 'error');
                        return;
                    }
                    
                    try {
                        const clipboardItem = new ClipboardItem({ 'image/png': blob });
                        await navigator.clipboard.write([clipboardItem]);
                        this.showNotification('Screenshot copied to clipboard!', 'success');
                    } catch (err) {
                        console.error('Failed to copy:', err);
                        // Fallback: try to download instead
                        this.showNotification('Clipboard not supported, downloading instead...', 'warning');
                        setTimeout(() => {
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `Talaria-Chart-${Date.now()}.png`;
                            a.click();
                            URL.revokeObjectURL(url);
                        }, 500);
                    }
                }, 'image/png'); // Clipboard only supports PNG
            }
            
        } catch (error) {
            console.error('❌ Screenshot error:', error);
            this.showNotification('Screenshot failed: ' + error.message, 'error');
        }
    }
    
    /**
     * Add watermark to canvas
     */
    addWatermark(canvas) {
        const ctx = canvas.getContext('2d');
        const watermarkText = 'Talaria Chart Pro';
        const fontSize = Math.max(14, canvas.width * 0.015);
        
        ctx.font = `${fontSize}px Roboto, sans-serif`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        
        const padding = 20;
        ctx.fillText(watermarkText, canvas.width - padding, canvas.height - padding);
    }
    
    /**
     * Load html2canvas library dynamically
     */
    loadHtml2Canvas() {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }
    
    /**
     * Capture screenshot silently (for auto-capture on trade execution)
     * Returns base64 data URL
     */
    async captureChartSnapshot() {
        try {
            console.log('📸 Auto-capturing chart snapshot...');
            
            // Load html2canvas if needed
            if (typeof html2canvas === 'undefined') {
                await this.loadHtml2Canvas();
            }
            
            // Get chart container - prefer chart-wrapper for better compatibility
            let chartContainer = document.querySelector('.chart-wrapper');
            if (!chartContainer) {
                chartContainer = document.getElementById('chartWrapper');
            }
            if (!chartContainer) {
                chartContainer = document.getElementById('chart-container');
            }
            if (!chartContainer) {
                chartContainer = document.body;
            }
            
            console.log('   Capturing element:', chartContainer.id || chartContainer.className || 'body');
            console.log('   Element dimensions:', chartContainer.offsetWidth, 'x', chartContainer.offsetHeight);
            
            // Capture with minimal options for speed
            const canvas = await html2canvas(chartContainer, {
                backgroundColor: this.getScreenshotBackgroundColor(chartContainer),
                logging: false,
                useCORS: true,
                allowTaint: false, // Changed to false to avoid tainted canvas
                scale: 1, // Reduced scale to avoid memory issues
                width: chartContainer.offsetWidth,
                height: chartContainer.offsetHeight,
                foreignObjectRendering: false, // Disable for better compatibility
                imageTimeout: 0
            });
            
            console.log('   Canvas created:', canvas.width, 'x', canvas.height);
            
            // Add subtle watermark
            this.addWatermark(canvas);
            
            // Convert to base64 with compression
            let dataUrl = null;
            try {
                dataUrl = canvas.toDataURL('image/jpeg', 0.7); // 70% quality for smaller size
                console.log('   toDataURL successful');
            } catch (err) {
                console.error('❌ toDataURL failed:', err.message);
                // Try PNG fallback
                try {
                    dataUrl = canvas.toDataURL('image/png');
                    console.log('   PNG fallback successful');
                } catch (err2) {
                    console.error('❌ PNG fallback also failed:', err2.message);
                    return null;
                }
            }
            
            // Verify it's a valid data URL
            if (!dataUrl || !dataUrl.startsWith('data:image')) {
                console.error('❌ Invalid data URL generated');
                console.error('   dataUrl:', dataUrl ? dataUrl.substring(0, 50) : 'null');
                return null;
            }
            
            console.log('✅ Chart snapshot captured:', (dataUrl.length / 1024).toFixed(2) + ' KB');
            console.log('   Data URL preview:', dataUrl.substring(0, 100) + '...');
            
            return dataUrl;
            
        } catch (error) {
            console.error('❌ Failed to capture snapshot:', error);
            return null;
        }
    }
    
    getScreenshotBackgroundColor(element) {
        if (this.chart?.chartSettings?.backgroundColor) {
            return this.chart.chartSettings.backgroundColor;
        }
        if (!element) {
            return '#ffffff';
        }
        const computedStyle = window.getComputedStyle(element);
        const backgroundColor = computedStyle?.backgroundColor;
        if (backgroundColor && backgroundColor !== 'rgba(0, 0, 0, 0)' && backgroundColor !== 'transparent') {
            return backgroundColor;
        }
        return '#ffffff';
    }
    
    /**
     * Show notification at top-right
     */
    showNotification(message, type = 'info') {
        // Remove existing screenshot notification if any
        const existing = document.querySelector('.screenshot-notification');
        if (existing) existing.remove();
        
        const notification = document.createElement('div');
        notification.className = 'screenshot-notification';
        notification.style.cssText = `
            position: fixed;
            top: 16px;
            right: 16px;
            transform: translateX(20px);
            background: rgba(55, 65, 81, 0.95);
            color: #e5e7eb;
            padding: 12px 20px;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 500;
            box-shadow: 0 4px 12px rgba(0,0,0,0.25);
            z-index: 100001;
            opacity: 0;
            transition: opacity 0.3s ease, transform 0.3s ease;
            white-space: nowrap;
            border: 1px solid rgba(255,255,255,0.1);
        `;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        // Animate in
        requestAnimationFrame(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateX(0)';
        });
        
        // Animate out and remove
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(20px)';
            setTimeout(() => notification.remove(), 300);
        }, 2500);
    }
}

// Initialize immediately when script loads
console.log('📸 Screenshot Manager script loaded');

// Try multiple initialization strategies
function initScreenshotManager() {
    console.log('📸 Attempting Screenshot Manager initialization...');
    console.log('   window.chart:', window.chart);
    console.log('   window.orderManager:', window.orderManager);
    
    if (window.chart) {
        window.screenshotManager = new ScreenshotManager(window.chart);
        console.log('✅ Screenshot Manager initialized successfully!');
        return true;
    }
    return false;
}

// Strategy 1: Try immediate
if (!initScreenshotManager()) {
    console.log('⏳ Chart not ready, trying DOMContentLoaded...');
    
    // Strategy 2: On DOMContentLoaded
    document.addEventListener('DOMContentLoaded', () => {
        if (!initScreenshotManager()) {
            console.log('⏳ Chart still not ready, trying window load...');
            
            // Strategy 3: On window load
            window.addEventListener('load', () => {
                setTimeout(() => {
                    if (!initScreenshotManager()) {
                        console.error('❌ Screenshot Manager: Failed to initialize - chart not found!');
                    }
                }, 500);
            });
        }
    });
}
