/**
 * Simple Emoji Picker - Guaranteed to work
 */
class EmojiPickerPanel {
    constructor() {
        this.visible = false;
        this.onSelect = null;
        this.panel = null;
        this.createSimplePanel();
    }

    loadRecents() {
        try {
            const raw = window.localStorage.getItem('talaria.drawing.emojiRecents');
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parsed.slice(0, 12);
            }
            return [];
        } catch (err) {
            console.warn('EmojiPickerPanel: failed to read recents', err);
            return [];
        }
    }

    saveRecents() {
        try {
            window.localStorage.setItem('talaria.drawing.emojiRecents', JSON.stringify(this.recents.slice(0, 12)));
        } catch (err) {
            console.warn('EmojiPickerPanel: failed to save recents', err);
        }
    }

    createPanel() {
        if (this.panel) return;

        this.panel = document.createElement('div');
        this.panel.className = 'emoji-picker-panel';
        this.panel.setAttribute('role', 'dialog');
        this.panel.style.display = 'none';

        const header = document.createElement('div');
        header.className = 'emoji-picker-header';
        header.innerHTML = `
            <div class="emoji-picker-tabs" role="tablist">
                <button class="emoji-picker-tab active" data-category="emoji" role="tab" aria-selected="true">Emojis</button>
                <button class="emoji-picker-tab" data-category="stickers" role="tab" aria-selected="false">Stickers</button>
                <button class="emoji-picker-tab" data-category="icons" role="tab" aria-selected="false">Icons</button>
            </div>
        `;

        this.panel.appendChild(header);
        this.tabButtons = Array.from(header.querySelectorAll('.emoji-picker-tab'));
        this.tabButtons.forEach(btn => {
            btn.addEventListener('click', () => this.switchCategory(btn.dataset.category));
        });

        const body = document.createElement('div');
        body.className = 'emoji-picker-body';

        const recentsSection = document.createElement('div');
        recentsSection.className = 'emoji-picker-recents-section';
        recentsSection.innerHTML = `
            <div class="emoji-picker-recents-label">Recently Used</div>
            <div class="emoji-picker-recents" role="list"></div>
        `;
        this.recentsContainer = recentsSection.querySelector('.emoji-picker-recents');
        body.appendChild(recentsSection);

        const gridWrapper = document.createElement('div');
        gridWrapper.className = 'emoji-picker-grid-wrapper';
        this.gridContainer = document.createElement('div');
        this.gridContainer.className = 'emoji-picker-grid';
        gridWrapper.appendChild(this.gridContainer);
        body.appendChild(gridWrapper);

        this.panel.appendChild(body);

        document.body.appendChild(this.panel);

        this.renderRecents();
        this.renderCategory('emoji');
    }

    attachGlobalHandlers() {
        document.addEventListener('click', (event) => {
            if (!this.visible) return;
            if (!this.panel.contains(event.target) && 
                !event.target.closest('#emojiTool') && 
                !event.target.closest('#emojiToolStandalone')) {
                this.hide();
            }
        }, true);

        window.addEventListener('resize', () => {
            if (this.visible && this.anchorRect) {
                this.positionPanel(this.anchorRect);
            }
        });
    }

    switchCategory(category) {
        if (this.activeCategory === category) return;
        this.activeCategory = category;
        this.tabButtons.forEach(btn => {
            const isActive = btn.dataset.category === category;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
        this.renderCategory(category);
    }

    renderRecents() {
        if (!this.recentsContainer) return;
        this.recentsContainer.innerHTML = '';
        if (!this.recents.length) {
            const placeholder = document.createElement('div');
            placeholder.className = 'emoji-picker-recents-placeholder';
            placeholder.textContent = 'Select an emoji to add it here';
            this.recentsContainer.appendChild(placeholder);
            return;
        }

        this.recents.forEach(item => {
            const button = this.createEmojiButton(item);
            this.recentsContainer.appendChild(button);
        });
    }

    renderCategory(category) {
        if (!this.gridContainer) return;
        this.gridContainer.innerHTML = '';

        const items = EmojiPickerPanel.DATA[category] || [];
        items.forEach(item => {
            const button = this.createEmojiButton({ ...item, category });
            this.gridContainer.appendChild(button);
        });
    }

    createEmojiButton(item) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'emoji-picker-item';
        button.textContent = item.glyph;
        button.title = item.label || item.glyph;
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            this.handleSelect(item);
        });
        return button;
    }

    handleSelect(item) {
        const payload = {
            glyph: item.glyph,
            category: item.category || this.activeCategory,
            fontSize: item.fontSize,
            fontFamily: item.fontFamily,
            backgroundColor: item.backgroundColor,
            showBackground: item.showBackground,
            opacity: item.opacity
        };

        // Update recents
        this.recents = [payload, ...this.recents.filter(r => r.glyph !== payload.glyph)].slice(0, 12);
        this.saveRecents();
        this.renderRecents();

        if (typeof this.onSelect === 'function') {
            this.onSelect(payload);
        }
    }

    show(anchorEl) {
        if (!this.panel) {
            this.createPanel();
        }
        
        if (!anchorEl) {
            // If no anchor, show in center of screen
            this.visible = true;
            this.panel.style.display = 'flex';
            this.panel.style.visibility = 'visible';
            this.panel.style.opacity = '1';
            this.panel.style.left = '50%';
            this.panel.style.top = '50%';
            this.panel.style.transform = 'translate(-50%, -50%)';
            this.panel.classList.add('visible');
            return;
        }
        
        this.visible = true;
        this.panel.style.display = 'flex';
        this.panel.style.visibility = 'visible';
        this.panel.style.opacity = '1';
        this.panel.style.transform = 'none';
        
        const rect = anchorEl.getBoundingClientRect();
        const margin = 12;
        
        // Position to the right of button
        let left = rect.right + margin;
        let top = rect.top;
        
        // If would go off right edge, position to left
        if (left + 320 > window.innerWidth) {
            left = rect.left - 320 - margin;
        }
        
        // If would go off bottom, adjust up
        if (top + 420 > window.innerHeight) {
            top = window.innerHeight - 420 - margin;
        }
        
        // Ensure not off screen
        left = Math.max(margin, left);
        top = Math.max(margin, top);
        
        this.panel.style.left = `${left}px`;
        this.panel.style.top = `${top}px`;
        this.panel.classList.add('visible');
    }

    positionPanel(rect) {
        const margin = 12;
        const panelRect = this.panel.getBoundingClientRect();
        let left = rect.right + margin;
        let top = rect.top;

        if (left + panelRect.width > window.innerWidth - margin) {
            left = rect.left - panelRect.width - margin;
        }
        if (left < margin) left = margin;

        if (top + panelRect.height > window.innerHeight - margin) {
            top = window.innerHeight - panelRect.height - margin;
        }
        if (top < margin) top = margin;

        this.panel.style.left = `${Math.round(left)}px`;
        this.panel.style.top = `${Math.round(top)}px`;
    }

    hide() {
        if (!this.visible || !this.panel) return;
        this.visible = false;
        this.panel.classList.remove('visible');
        this.panel.style.display = 'none';
        this.anchorRect = null;
    }

    toggle(anchorEl) {
        if (this.visible) {
            this.hide();
        } else {
            this.show(anchorEl);
        }
    }
}

EmojiPickerPanel.DATA = {
    emoji: [
        { glyph: '😀', label: 'Grinning Face' },
        { glyph: '😁', label: 'Beaming Face' },
        { glyph: '😂', label: 'Face with Tears of Joy' },
        { glyph: '🤣', label: 'Rolling on the Floor Laughing' },
        { glyph: '🥲', label: 'Smiling with Tear' },
        { glyph: '😊', label: 'Smiling Face with Smiling Eyes' },
        { glyph: '😍', label: 'Heart Eyes' },
        { glyph: '😘', label: 'Face Blowing Kiss' },
        { glyph: '😎', label: 'Smiling Face with Sunglasses' },
        { glyph: '🤩', label: 'Star-Struck' },
        { glyph: '🤔', label: 'Thinking Face' },
        { glyph: '🤨', label: 'Raised Eyebrow' },
        { glyph: '😏', label: 'Smirking Face' },
        { glyph: '😢', label: 'Crying Face' },
        { glyph: '😭', label: 'Loudly Crying Face' },
        { glyph: '😡', label: 'Pouting Face' },
        { glyph: '🤯', label: 'Exploding Head' },
        { glyph: '🥳', label: 'Partying Face' },
        { glyph: '🥰', label: 'Smiling Face with Hearts' },
        { glyph: '😴', label: 'Sleeping Face' },
        { glyph: '🤒', label: 'Face with Thermometer' },
        { glyph: '👍', label: 'Thumbs Up' },
        { glyph: '👎', label: 'Thumbs Down' },
        { glyph: '🙏', label: 'Folded Hands' },
        { glyph: '🔥', label: 'Fire' },
        { glyph: '💡', label: 'Light Bulb' },
        { glyph: '✅', label: 'Check Mark' },
        { glyph: '❌', label: 'Cross Mark' },
        { glyph: '🚀', label: 'Rocket' },
        { glyph: '🎯', label: 'Bullseye' },
        { glyph: '🏆', label: 'Trophy' },
        { glyph: '⚡', label: 'High Voltage' }
    ],
    stickers: [
        { glyph: '🪙', label: 'Coin', fontSize: 72, showBackground: true, backgroundColor: 'rgba(27, 30, 39, 0.8)' },
        { glyph: '💎', label: 'Gem', fontSize: 72, showBackground: true, backgroundColor: 'rgba(24, 63, 128, 0.65)' },
        { glyph: '📈', label: 'Chart Up', fontSize: 68, showBackground: true, backgroundColor: 'rgba(16, 97, 71, 0.75)' },
        { glyph: '📉', label: 'Chart Down', fontSize: 68, showBackground: true, backgroundColor: 'rgba(118, 36, 36, 0.75)' },
        { glyph: '🏦', label: 'Bank', fontSize: 70, showBackground: true, backgroundColor: 'rgba(32, 36, 48, 0.85)' },
        { glyph: '🧲', label: 'Magnet', fontSize: 70, showBackground: true, backgroundColor: 'rgba(203, 56, 76, 0.75)' },
        { glyph: '🎁', label: 'Gift', fontSize: 72, showBackground: true, backgroundColor: 'rgba(154, 52, 110, 0.75)' },
        { glyph: '🎉', label: 'Party', fontSize: 72, showBackground: true, backgroundColor: 'rgba(234, 179, 8, 0.45)' },
        { glyph: '🧠', label: 'Brain', fontSize: 70, showBackground: true, backgroundColor: 'rgba(17, 24, 39, 0.85)' },
        { glyph: '🛡️', label: 'Shield', fontSize: 70, showBackground: true, backgroundColor: 'rgba(30, 58, 138, 0.75)' },
        { glyph: '💰', label: 'Money Bag', fontSize: 72, showBackground: true, backgroundColor: 'rgba(22, 101, 52, 0.75)' },
        { glyph: '💬', label: 'Chat Bubble', fontSize: 68, showBackground: true, backgroundColor: 'rgba(59, 7, 100, 0.75)' }
    ],
    icons: [
        { glyph: '●', label: 'Solid Dot', fontSize: 40, showBackground: false },
        { glyph: '⬤', label: 'Large Dot', fontSize: 48, showBackground: false },
        { glyph: '▲', label: 'Triangle Up', fontSize: 44, showBackground: false },
        { glyph: '▼', label: 'Triangle Down', fontSize: 44, showBackground: false },
        { glyph: '◆', label: 'Diamond', fontSize: 44, showBackground: false },
        { glyph: '■', label: 'Square', fontSize: 44, showBackground: false },
        { glyph: '✦', label: 'Sparkle', fontSize: 44, showBackground: false },
        { glyph: '✳', label: 'Eight-point Star', fontSize: 44, showBackground: false },
        { glyph: '☑', label: 'Check Box', fontSize: 44, showBackground: false },
        { glyph: '☒', label: 'X Box', fontSize: 44, showBackground: false },
        { glyph: '⛔', label: 'No Entry', fontSize: 44, showBackground: false },
        { glyph: '⚠', label: 'Warning', fontSize: 44, showBackground: false },
        { glyph: '☁', label: 'Cloud', fontSize: 44, showBackground: false },
        { glyph: '★', label: 'Star', fontSize: 44, showBackground: false },
        { glyph: '✝', label: 'Cross', fontSize: 44, showBackground: false },
        { glyph: '✚', label: 'Plus', fontSize: 44, showBackground: false },
        { glyph: '✖', label: 'Multiply', fontSize: 44, showBackground: false },
        { glyph: '➤', label: 'Arrow', fontSize: 44, showBackground: false },
        { glyph: '➜', label: 'Arrow Right', fontSize: 44, showBackground: false },
        { glyph: '⇧', label: 'Arrow Up', fontSize: 44, showBackground: false },
        { glyph: '⇩', label: 'Arrow Down', fontSize: 44, showBackground: false }
    ]
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = EmojiPickerPanel;
}
