/**
 * Screenshot Manager
 * Handles chart screenshot functionality with various options
 */

class ScreenshotManager {
    constructor(chart) {
        this.chart = chart;
        this._brandLogoImage = null;
        this._brandLogoLoadPromise = null;
        this._brandLogoBounds = null;
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

    flashCapture() {
        const flash = document.createElement('div');
        flash.style.cssText = `
            position: fixed;
            inset: 0;
            z-index: 100003;
            background: #ffffff;
            opacity: 0;
            pointer-events: none;
            transition: opacity 60ms ease-in;
        `;
        document.body.appendChild(flash);
        requestAnimationFrame(() => {
            flash.style.opacity = '0.82';
            setTimeout(() => {
                flash.style.transition = 'opacity 220ms ease-out';
                flash.style.opacity = '0';
                setTimeout(() => flash.remove(), 240);
            }, 70);
        });
    }

    resolveAssetUrl(relativePath) {
        try {
            return new URL(relativePath, window.location.href).href;
        } catch (error) {
            return relativePath;
        }
    }

    async getBrandLogoImage() {
        if (this._brandLogoImage && this._brandLogoImage.complete && this._brandLogoImage.naturalWidth > 0) {
            return this._brandLogoImage;
        }

        if (this._brandLogoLoadPromise) {
            return this._brandLogoLoadPromise;
        }

        const candidates = ['modules/logo-05.png', 'modules/logo-14.png', 'modules/logo-04.png', 'modules/logo-09.png'];

        this._brandLogoLoadPromise = new Promise((resolve) => {
            const tryLoad = (index) => {
                if (index >= candidates.length) {
                    this._brandLogoLoadPromise = null;
                    resolve(null);
                    return;
                }

                const image = new Image();
                image.decoding = 'async';
                image.onload = () => {
                    image.__talariaSource = candidates[index];
                    this._brandLogoImage = image;
                    this._brandLogoBounds = null;
                    this._brandLogoLoadPromise = null;
                    resolve(image);
                };
                image.onerror = () => {
                    tryLoad(index + 1);
                };
                image.src = this.resolveAssetUrl(candidates[index]);
            };

            tryLoad(0);
        });

        return this._brandLogoLoadPromise;
    }

    getVisibleLogoBounds(image) {
        if (!image) {
            return null;
        }

        if (
            this._brandLogoBounds &&
            this._brandLogoBounds.sourceWidth === image.naturalWidth &&
            this._brandLogoBounds.sourceHeight === image.naturalHeight
        ) {
            return this._brandLogoBounds;
        }

        const scratch = document.createElement('canvas');
        scratch.width = image.naturalWidth;
        scratch.height = image.naturalHeight;
        const scratchCtx = scratch.getContext('2d', { willReadFrequently: true });

        if (!scratchCtx) {
            const fallback = {
                x: 0,
                y: 0,
                width: image.naturalWidth,
                height: image.naturalHeight,
                sourceWidth: image.naturalWidth,
                sourceHeight: image.naturalHeight
            };
            this._brandLogoBounds = fallback;
            return fallback;
        }

        scratchCtx.clearRect(0, 0, scratch.width, scratch.height);
        scratchCtx.drawImage(image, 0, 0);
        const pixels = scratchCtx.getImageData(0, 0, scratch.width, scratch.height).data;

        let minX = scratch.width;
        let minY = scratch.height;
        let maxX = -1;
        let maxY = -1;
        let visiblePixelCount = 0;
        let lumaSum = 0;

        for (let y = 0; y < scratch.height; y += 1) {
            for (let x = 0; x < scratch.width; x += 1) {
                const i = (y * scratch.width + x) * 4;
                const red = pixels[i];
                const green = pixels[i + 1];
                const blue = pixels[i + 2];
                const alpha = pixels[i + 3];

                // Works for both transparent logos and opaque logos on near-black backgrounds
                const hasVisibleContent = alpha > 0 && ((red + green + blue) > 20 || alpha < 250);
                if (hasVisibleContent) {
                    if (x < minX) minX = x;
                    if (y < minY) minY = y;
                    if (x > maxX) maxX = x;
                    if (y > maxY) maxY = y;
                    visiblePixelCount += 1;
                    lumaSum += (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
                }
            }
        }

        const averageLuma = visiblePixelCount > 0 ? (lumaSum / visiblePixelCount) : 0;

        const bounds = maxX >= minX && maxY >= minY
            ? {
                x: minX,
                y: minY,
                width: maxX - minX + 1,
                height: maxY - minY + 1,
                averageLuma,
                sourceWidth: image.naturalWidth,
                sourceHeight: image.naturalHeight
            }
            : {
                x: 0,
                y: 0,
                width: image.naturalWidth,
                height: image.naturalHeight,
                averageLuma,
                sourceWidth: image.naturalWidth,
                sourceHeight: image.naturalHeight
            };

        this._brandLogoBounds = bounds;
        return bounds;
    }

    async addBrandLogo(canvas, sourceElement = null) {
        if (!canvas) return false;
        if (canvas.__talariaLogoStamped) return true;

        const ctx = canvas.getContext('2d');
        if (!ctx) return false;

        const logoImage = await this.getBrandLogoImage();
        if (!logoImage) {
            console.warn('📸 Logo stamp skipped: logo image could not be loaded');
            return false;
        }

        const bounds = this.getVisibleLogoBounds(logoImage);
        if (!bounds || !bounds.width || !bounds.height) {
            console.warn('📸 Logo stamp skipped: no visible logo bounds detected');
            return false;
        }

        const backgroundColor = this.getScreenshotBackgroundColor(sourceElement || document.getElementById('chart-container'));
        const useDarkShadow = this.isLightColor(backgroundColor);
        const canvasIsDark = !useDarkShadow;
        const logoAppearsDark = typeof bounds.averageLuma === 'number' && bounds.averageLuma < 118;
        const logoAppearsLight = typeof bounds.averageLuma === 'number' && bounds.averageLuma > 190;

        const marginX = Math.max(14, Math.round(canvas.width * 0.012));
        const marginY = Math.max(14, Math.round(canvas.height * 0.018));
        let drawHeight = Math.max(20, Math.round(canvas.height * 0.045));
        let drawWidth = Math.round((bounds.width / bounds.height) * drawHeight);

        const maxWidth = Math.max(150, Math.round(canvas.width * 0.22));
        if (drawWidth > maxWidth) {
            drawWidth = maxWidth;
            drawHeight = Math.round((bounds.height / bounds.width) * drawWidth);
        }

        const x = marginX;
        const y = canvas.height - drawHeight - marginY;

        ctx.save();
        ctx.globalAlpha = 0.98;
        if ((canvasIsDark && logoAppearsDark) || (!canvasIsDark && logoAppearsLight)) {
            ctx.filter = 'brightness(0) invert(1)';
        }
        ctx.shadowColor = useDarkShadow ? 'rgba(0, 0, 0, 0.42)' : 'rgba(3, 8, 17, 0.36)';
        ctx.shadowBlur = Math.max(4, Math.round(drawHeight * 0.16));
        ctx.shadowOffsetY = Math.max(1, Math.round(drawHeight * 0.06));
        ctx.drawImage(
            logoImage,
            bounds.x,
            bounds.y,
            bounds.width,
            bounds.height,
            x,
            y,
            drawWidth,
            drawHeight
        );
        ctx.restore();

        canvas.__talariaLogoStamped = true;
        return true;
    }

    /**
     * Show screenshot preview modal with quick actions
     */
    async showScreenshotPreview(canvas) {
        if (!canvas) return;

        // Final guarantee for preview path: stamp logo right before display/export actions
        await this.addBrandLogo(canvas);

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
        this.getBrandLogoImage();
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
    _hideUIOverlays() {
        const hidden = [];
        const selectors = [
            '#settingsPanel',
            '.settings-panel',
            '.indicator-settings-panel',
            '.context-menu',
            '.dropdown-menu.open',
            '.tooltip'
        ];
        for (const sel of selectors) {
            document.querySelectorAll(sel).forEach(el => {
                if (el.style.display !== 'none' && el.offsetParent !== null) {
                    hidden.push({ el, display: el.style.display });
                    el.style.display = 'none';
                }
            });
        }
        return hidden;
    }

    _restoreUIOverlays(hidden) {
        for (const { el, display } of hidden) {
            el.style.display = display;
        }
    }

    async takeQuickScreenshot(action = 'download') {
        // Close settings panel if open and wait for its slide-out animation (280ms)
        const settingsPanel = document.getElementById('settingsPanel');
        const settingsWasOpen = settingsPanel?.classList.contains('open');
        if (settingsWasOpen && typeof window.closePanel === 'function') {
            window.closePanel();
            await new Promise(resolve => setTimeout(resolve, 310));
        }

        this.flashCapture();

        try {
            // Get the chart container
            let targetElement = document.getElementById('chart-container');
            if (!targetElement) targetElement = document.querySelector('.chart-wrapper');
            if (!targetElement) targetElement = document.querySelector('.container');
            if (!targetElement) targetElement = document.body;

            const hidden = this._hideUIOverlays();
            const canvas = await this.captureCanvasDirect(targetElement, 2);
            this._restoreUIOverlays(hidden);
            if (!canvas) throw new Error('Canvas capture returned null');
            
            // Add watermark
            this.addWatermark(canvas);
            await this.addBrandLogo(canvas, targetElement);

            if (action === 'preview') {
                await this.showScreenshotPreview(canvas);
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
        this.flashCapture();

        try {
            // Get options
            const includeToolbar = document.getElementById('includeToolbar')?.checked ?? true;
            const includeSidebar = document.getElementById('includeSidebar')?.checked ?? false;
            const includeDrawings = document.getElementById('includeDrawings')?.checked ?? true;
            const includeWatermark = document.getElementById('includeWatermark')?.checked ?? true;
            const format = document.querySelector('input[name="imageFormat"]:checked')?.value ?? 'png';
            const quality = parseFloat(document.getElementById('imageQuality')?.value ?? 0.9);
            
            // Close the modal first
            document.getElementById('screenshotModal')?.remove();
            await new Promise(resolve => setTimeout(resolve, 50));

            // Get the chart container
            let targetElement = document.getElementById('chart-container');
            if (!targetElement) targetElement = document.querySelector('.chart-wrapper');
            if (!targetElement) targetElement = document.querySelector('.container');
            if (!targetElement) targetElement = document.body;
            
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
            
            const canvas = await this.captureCanvasDirect(targetElement, 2);
            if (!canvas) throw new Error('Canvas capture returned null');
            
            // Restore original styles
            originalStyles.forEach((originalDisplay, element) => {
                element.style.display = originalDisplay;
            });
            
            // Add watermark if enabled
            if (includeWatermark) {
                this.addWatermark(canvas);
            }
            await this.addBrandLogo(canvas, targetElement);
            
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
     * Fast canvas compositing — replaces html2canvas entirely.
     * Reads pixels directly from existing <canvas> elements and serialises
     * any <svg> overlays (drawings). No DOM cloning, no CDN download.
     * @param {Element} container  Root element to capture
     * @param {number}  scale      Output pixel ratio (default 2 for retina)
     */
    async captureCanvasDirect(container, scale = 2) {
        if (!container) return null;

        const rect = container.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;

        const out = document.createElement('canvas');
        out.width  = Math.round(rect.width  * scale);
        out.height = Math.round(rect.height * scale);
        const ctx = out.getContext('2d');
        if (!ctx) return null;

        // Background
        ctx.fillStyle = this.getScreenshotBackgroundColor(container) || '#050028';
        ctx.fillRect(0, 0, out.width, out.height);

        // Helper: map an element's bounding rect onto the output canvas
        const place = (el) => {
            const r = el.getBoundingClientRect();
            return {
                x: (r.left - rect.left) * scale,
                y: (r.top  - rect.top)  * scale,
                w: r.width  * scale,
                h: r.height * scale
            };
        };

        // 1. Draw every <canvas> in DOM order (chart + panels)
        for (const c of container.querySelectorAll('canvas')) {
            if (!c.width || !c.height) continue;
            const s = window.getComputedStyle(c);
            if (s.display === 'none' || s.visibility === 'hidden') continue;
            const { x, y, w, h } = place(c);
            if (w > 0 && h > 0) ctx.drawImage(c, x, y, w, h);
        }

        // 2. Render SVG drawing overlays on top
        for (const svg of container.querySelectorAll('svg')) {
            const s = window.getComputedStyle(svg);
            if (s.display === 'none' || s.visibility === 'hidden') continue;
            const svgRect = svg.getBoundingClientRect();
            if (!svgRect.width || !svgRect.height) continue;
            try {
                const clone = svg.cloneNode(true);
                clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
                clone.setAttribute('width',  String(svgRect.width));
                clone.setAttribute('height', String(svgRect.height));
                if (!clone.getAttribute('viewBox')) {
                    clone.setAttribute('viewBox', `0 0 ${svgRect.width} ${svgRect.height}`);
                }
                const blob = new Blob([new XMLSerializer().serializeToString(clone)],
                                      { type: 'image/svg+xml' });
                const url  = URL.createObjectURL(blob);
                await new Promise((resolve) => {
                    const img = new Image();
                    img.onload = () => {
                        const { x, y, w, h } = place(svg);
                        if (w > 0 && h > 0) ctx.drawImage(img, x, y, w, h);
                        URL.revokeObjectURL(url);
                        resolve();
                    };
                    img.onerror = () => { URL.revokeObjectURL(url); resolve(); };
                    img.src = url;
                });
            } catch (_) { /* ignore per-SVG errors */ }
        }

        return out;
    }
    
    /**
     * Capture screenshot silently (for auto-capture on trade execution)
     * Returns base64 data URL
     */
    async captureChartSnapshot() {
        try {
            let chartContainer = document.getElementById('chart-container');
            if (!chartContainer) chartContainer = document.querySelector('.chart-wrapper');
            if (!chartContainer) chartContainer = document.body;

            // scale=1 keeps file size small for journal storage
            const canvas = await this.captureCanvasDirect(chartContainer, 1);
            
            // Add subtle watermark
            this.addWatermark(canvas);
            await this.addBrandLogo(canvas, chartContainer);
            
            // Convert to base64 with compression
            let dataUrl = null;
            try {
                dataUrl = canvas.toDataURL('image/jpeg', 0.7); // 70% quality for smaller size
                } catch (err) {
                console.error('❌ toDataURL failed:', err.message);
                // Try PNG fallback
                try {
                    dataUrl = canvas.toDataURL('image/png');
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

function initScreenshotManager() {
    if (window.chart) {
        window.screenshotManager = new ScreenshotManager(window.chart);
        return true;
    }
    return false;
}

if (!initScreenshotManager()) {
    document.addEventListener('DOMContentLoaded', () => {
        if (!initScreenshotManager()) {
            window.addEventListener('load', () => {
                setTimeout(initScreenshotManager, 500);
            });
        }
    });
}
