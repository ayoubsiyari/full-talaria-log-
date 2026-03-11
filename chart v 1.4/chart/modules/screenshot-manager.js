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

    isLightColor(colorValue) {
        if (!colorValue || typeof colorValue !== 'string') return false;

        const color = colorValue.trim();
        let r;
        let g;
        let b;

        const rgbMatch = color.match(/^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
        if (rgbMatch) {
            r = parseInt(rgbMatch[1], 10);
            g = parseInt(rgbMatch[2], 10);
            b = parseInt(rgbMatch[3], 10);
        } else if (color.startsWith('#')) {
            let hex = color.slice(1);
            if (hex.length === 3) {
                hex = hex.split('').map((ch) => ch + ch).join('');
            }
            if (hex.length !== 6) return false;
            r = parseInt(hex.slice(0, 2), 16);
            g = parseInt(hex.slice(2, 4), 16);
            b = parseInt(hex.slice(4, 6), 16);
        } else {
            return false;
        }

        if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return false;

        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance > 0.65;
    }

    prepareScreenshotClone(clonedDoc, sourceElement = null) {
        if (!clonedDoc) return;

        const backgroundColor = this.getScreenshotBackgroundColor(sourceElement || document.getElementById('chart-container'));
        const useDarkBrand = this.isLightColor(backgroundColor);
        const toAbsoluteAssetUrl = (relativePath) => {
            try {
                return new URL(relativePath, window.location.href).href;
            } catch (error) {
                return relativePath;
            }
        };

        const symbolSrc = toAbsoluteAssetUrl(useDarkBrand ? 'modules/logo-09.png' : 'modules/logo-08.png');
        const wordmarkSrc = toAbsoluteAssetUrl(useDarkBrand ? 'modules/logo-14.png' : 'modules/logo-05.png');

        const chartBrand = clonedDoc.querySelector('.chart-brand');
        if (chartBrand) {
            chartBrand.style.display = 'block';
            chartBrand.style.visibility = 'visible';
            chartBrand.style.opacity = '1';
        }

        clonedDoc.querySelectorAll('.chart-brand .brand-stack').forEach((stack) => {
            stack.style.visibility = 'visible';
            stack.style.opacity = '1';
        });

        clonedDoc.querySelectorAll('.chart-brand .logo-top').forEach((img) => {
            img.setAttribute('src', symbolSrc);
            img.setAttribute('crossorigin', 'anonymous');
            img.style.setProperty('filter', 'none', 'important');
            img.style.opacity = '1';
            img.style.visibility = 'visible';
        });

        clonedDoc.querySelectorAll('.chart-brand .logo-bottom').forEach((img) => {
            img.setAttribute('src', wordmarkSrc);
            img.setAttribute('crossorigin', 'anonymous');
            img.style.setProperty('filter', 'none', 'important');
            img.style.opacity = '1';
            img.style.visibility = 'visible';
        });

        const darkStack = clonedDoc.querySelector('.chart-brand .logo-dark');
        const lightStack = clonedDoc.querySelector('.chart-brand .logo-light');
        if (darkStack) darkStack.style.display = useDarkBrand ? 'none' : 'block';
        if (lightStack) lightStack.style.display = useDarkBrand ? 'block' : 'none';
    }

    ensureCaptureLoaderStyles() {
        if (document.getElementById('chartScreenshotLoaderStyles')) return;

        const style = document.createElement('style');
        style.id = 'chartScreenshotLoaderStyles';
        style.textContent = `
            @keyframes chartScreenshotSpin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }

            @keyframes chartScreenshotPulse {
                0%, 100% { opacity: 0.68; }
                50% { opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }

    showCaptureLoader(message = 'Capturing screenshot...') {
        this.ensureCaptureLoaderStyles();
        this.hideCaptureLoader();

        const overlay = document.createElement('div');
        overlay.id = 'chartScreenshotCaptureLoader';
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            z-index: 100003;
            background: rgba(2, 6, 16, 0.42);
            backdrop-filter: blur(2px);
            display: flex;
            align-items: center;
            justify-content: center;
            pointer-events: all;
        `;

        const card = document.createElement('div');
        card.style.cssText = `
            display: inline-flex;
            align-items: center;
            gap: 12px;
            padding: 12px 16px;
            border-radius: 12px;
            background: rgba(10, 18, 34, 0.92);
            border: 1px solid #2a3b57;
            box-shadow: 0 14px 35px rgba(0, 0, 0, 0.35);
        `;

        const spinner = document.createElement('div');
        spinner.style.cssText = `
            width: 18px;
            height: 18px;
            border-radius: 50%;
            border: 2px solid rgba(141, 187, 255, 0.28);
            border-top-color: #53a4ff;
            animation: chartScreenshotSpin 0.85s linear infinite;
        `;

        const label = document.createElement('div');
        label.textContent = message;
        label.style.cssText = `
            color: #e5f0ff;
            font-size: 13px;
            font-weight: 600;
            letter-spacing: 0.02em;
            animation: chartScreenshotPulse 1.15s ease-in-out infinite;
        `;

        card.appendChild(spinner);
        card.appendChild(label);
        overlay.appendChild(card);
        document.body.appendChild(overlay);

        this._captureLoaderElement = overlay;
    }

    hideCaptureLoader() {
        const loader = this._captureLoaderElement || document.getElementById('chartScreenshotCaptureLoader');
        if (loader && loader.parentNode) {
            loader.parentNode.removeChild(loader);
        }
        this._captureLoaderElement = null;
    }

    drawRoundedRect(ctx, x, y, width, height, radius) {
        const r = Math.max(0, Math.min(radius, width / 2, height / 2));
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + width - r, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + r);
        ctx.lineTo(x + width, y + height - r);
        ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
        ctx.lineTo(x + r, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    addBrandLogo(canvas, sourceElement = null) {
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const backgroundColor = this.getScreenshotBackgroundColor(sourceElement || document.getElementById('chart-container'));
        const useDarkBrand = this.isLightColor(backgroundColor);

        const paddingX = Math.max(12, Math.round(canvas.width * 0.012));
        const paddingY = Math.max(12, Math.round(canvas.height * 0.012));
        const badgeHeight = Math.max(38, Math.round(canvas.height * 0.07));
        const badgeWidth = Math.max(220, Math.round(badgeHeight * 4.9));
        const x = paddingX;
        const y = paddingY;

        const panelFill = useDarkBrand ? 'rgba(255, 255, 255, 0.95)' : 'rgba(6, 13, 25, 0.92)';
        const panelStroke = useDarkBrand ? 'rgba(38, 84, 170, 0.5)' : 'rgba(122, 168, 255, 0.55)';
        const textColor = useDarkBrand ? '#173a7c' : '#f4f8ff';

        ctx.save();

        this.drawRoundedRect(ctx, x, y, badgeWidth, badgeHeight, Math.round(badgeHeight * 0.28));
        ctx.fillStyle = panelFill;
        ctx.fill();
        ctx.strokeStyle = panelStroke;
        ctx.lineWidth = 1;
        ctx.stroke();

        const iconSize = Math.round(badgeHeight * 0.62);
        const iconX = x + Math.round(badgeHeight * 0.18);
        const iconY = y + Math.round((badgeHeight - iconSize) / 2);
        const iconGradient = ctx.createLinearGradient(iconX, iconY, iconX + iconSize, iconY + iconSize);
        iconGradient.addColorStop(0, '#4ea3ff');
        iconGradient.addColorStop(1, '#2d5bff');

        this.drawRoundedRect(ctx, iconX, iconY, iconSize, iconSize, Math.max(4, Math.round(iconSize * 0.24)));
        ctx.fillStyle = iconGradient;
        ctx.fill();

        const tTopY = iconY + Math.round(iconSize * 0.26);
        const tBottomY = iconY + Math.round(iconSize * 0.76);
        const tLeftX = iconX + Math.round(iconSize * 0.26);
        const tRightX = iconX + Math.round(iconSize * 0.74);
        const tMidX = iconX + Math.round(iconSize * 0.5);

        ctx.beginPath();
        ctx.moveTo(tLeftX, tTopY);
        ctx.lineTo(tRightX, tTopY);
        ctx.moveTo(tMidX, tTopY);
        ctx.lineTo(tMidX, tBottomY);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.lineWidth = Math.max(2, Math.round(iconSize * 0.12));
        ctx.lineCap = 'round';
        ctx.stroke();

        ctx.font = `700 ${Math.max(15, Math.round(badgeHeight * 0.42))}px "Segoe UI", Arial, sans-serif`;
        ctx.fillStyle = textColor;
        ctx.textBaseline = 'middle';
        ctx.fillText('TALARIA', iconX + iconSize + Math.round(badgeHeight * 0.24), y + Math.round(badgeHeight * 0.54));

        ctx.restore();
    }

    /**
     * Show screenshot preview modal with quick actions
     */
    showScreenshotPreview(canvas) {
        if (!canvas) return;

        // Final guarantee for preview path: stamp logo right before display/export actions
        this.addBrandLogo(canvas);

        const existingPreview = document.getElementById('chartScreenshotPreviewModal');
        if (existingPreview) existingPreview.remove();

        const dataUrl = canvas.toDataURL('image/png');

        const modal = document.createElement('div');
        modal.id = 'chartScreenshotPreviewModal';
        modal.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(2, 6, 16, 0.86);
            backdrop-filter: blur(5px);
            z-index: 100002;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        `;

        const panel = document.createElement('div');
        panel.style.cssText = `
            width: min(960px, 94vw);
            max-height: 92vh;
            background: #0b1220;
            border: 1px solid #253248;
            border-radius: 14px;
            box-shadow: 0 24px 70px rgba(0, 0, 0, 0.45);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        `;

        const header = document.createElement('div');
        header.style.cssText = 'display:flex; align-items:center; justify-content:space-between; padding:14px 16px; border-bottom: 1px solid #253248;';
        header.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; color:#dbe8ff; font-size:14px; font-weight:600;">
                Screenshot preview
            </div>
        `;

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = `
            width: 28px;
            height: 28px;
            border-radius: 8px;
            border: 1px solid #2e3c55;
            background: #121d31;
            color: #a9b9d4;
            cursor: pointer;
        `;
        header.appendChild(closeBtn);

        const imageWrap = document.createElement('div');
        imageWrap.style.cssText = 'padding: 16px; overflow:auto; display:flex; justify-content:center; align-items:center; background:#070d18;';

        const image = document.createElement('img');
        image.src = dataUrl;
        image.alt = 'Chart screenshot preview';
        image.style.cssText = 'max-width:100%; max-height:62vh; border-radius:10px; border:1px solid #22324a; box-shadow: 0 10px 30px rgba(0,0,0,0.35);';
        imageWrap.appendChild(image);

        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex; justify-content:flex-end; flex-wrap:wrap; gap:10px; padding:14px 16px 16px; border-top:1px solid #253248;';

        const mkBtn = (label, style) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = label;
            btn.style.cssText = style;
            return btn;
        };

        const downloadBtn = mkBtn(
            'Download',
            'padding:10px 14px; border-radius:10px; border:1px solid #2d7cff; background:#1f6feb; color:#ffffff; font-weight:600; cursor:pointer;'
        );
        const copyBtn = mkBtn(
            'Copy',
            'padding:10px 14px; border-radius:10px; border:1px solid #2e3c55; background:#152136; color:#dbe8ff; font-weight:600; cursor:pointer;'
        );
        const linkBtn = mkBtn(
            'Copy link',
            'padding:10px 14px; border-radius:10px; border:1px solid #2e3c55; background:#152136; color:#dbe8ff; font-weight:600; cursor:pointer;'
        );

        actions.appendChild(downloadBtn);
        actions.appendChild(copyBtn);
        actions.appendChild(linkBtn);

        panel.appendChild(header);
        panel.appendChild(imageWrap);
        panel.appendChild(actions);
        modal.appendChild(panel);
        document.body.appendChild(modal);

        const closeModal = () => {
            document.removeEventListener('keydown', handleEsc);
            modal.remove();
        };

        const handleEsc = (e) => {
            if (e.key === 'Escape') closeModal();
        };

        closeBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
        document.addEventListener('keydown', handleEsc);

        downloadBtn.addEventListener('click', () => {
            this.downloadImage(canvas);
        });
        copyBtn.addEventListener('click', async () => {
            await this.copyToClipboard(canvas);
        });
        linkBtn.addEventListener('click', async () => {
            await this.copyLink(canvas);
        });
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
        
        // Primary behavior: take screenshot and show on-screen preview with actions
        screenshotBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            dropdown.classList.remove('open');
            await this.takeQuickScreenshot('preview');
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
        const loadingMessage = action === 'preview'
            ? 'Preparing screenshot preview...'
            : 'Capturing screenshot...';
        this.showCaptureLoader(loadingMessage);

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
                height: targetElement.offsetHeight,
                onclone: (clonedDoc) => {
                    this.prepareScreenshotClone(clonedDoc, targetElement);
                }
            });
            
            // Add watermark
            this.addWatermark(canvas);
            this.addBrandLogo(canvas, targetElement);

            if (action === 'preview') {
                this.showScreenshotPreview(canvas);
                return;
            }
            
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
        } finally {
            this.hideCaptureLoader();
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
        this.showCaptureLoader('Capturing screenshot...');

        try {
            // Get options
            const includeToolbar = document.getElementById('includeToolbar')?.checked ?? true;
            const includeSidebar = document.getElementById('includeSidebar')?.checked ?? false;
            const includeDrawings = document.getElementById('includeDrawings')?.checked ?? true;
            const includeWatermark = document.getElementById('includeWatermark')?.checked ?? true;
            const format = document.querySelector('input[name="imageFormat"]:checked')?.value ?? 'png';
            const quality = parseFloat(document.getElementById('imageQuality')?.value ?? 0.9);
            
            console.log('📸 Taking screenshot...', { action, format, includeToolbar, includeSidebar });
            
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
                    this.prepareScreenshotClone(clonedDoc, targetElement);
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
            this.addBrandLogo(canvas, targetElement);
            
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
        } finally {
            this.hideCaptureLoader();
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
                imageTimeout: 0,
                onclone: (clonedDoc) => {
                    this.prepareScreenshotClone(clonedDoc, chartContainer);
                }
            });
            
            console.log('   Canvas created:', canvas.width, 'x', canvas.height);
            
            // Add subtle watermark
            this.addWatermark(canvas);
            this.addBrandLogo(canvas, chartContainer);
            
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
