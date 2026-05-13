/**
 * Simple Emoji Picker - Styled to match tool dropdowns with light/dark mode
 * TradingView-style with tab groups
 */
class SimpleEmojiPicker {
    constructor() {
        this.visible = false;
        this.onSelect = null;
        this.activeTab = 'smileys';
        this.recentEmojis = this.loadRecentEmojis();
        
        // Tab definitions with icons
        this.tabs = [
            { id: 'recent', icon: '🕐', label: 'Recently Used' },
            { id: 'smileys', icon: '😊', label: 'Smileys & People' },
            { id: 'animals', icon: '🦊', label: 'Animals & Nature' },
            { id: 'food', icon: '🍔', label: 'Food & Drink' },
            { id: 'activities', icon: '⚽', label: 'Activities' },
            { id: 'travel', icon: '🚗', label: 'Travel & Places' },
            { id: 'objects', icon: '💡', label: 'Objects' },
            { id: 'symbols', icon: '❤️', label: 'Symbols' },
            { id: 'flags', icon: '🚩', label: 'Flags' }
        ];
        
        // Extended emoji categories
        this.emojiCategories = {
            'smileys': {
                'SMILEYS & EMOTION': [
                    '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩',
                    '😘', '😗', '☺️', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔',
                    '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷',
                    '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '🥸', '😎', '🤓', '🧐',
                    '😕', '😟', '🙁', '☹️', '😮', '😯', '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭',
                    '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '😈', '👿', '💀', '☠️',
                    '💩', '🤡', '👹', '👺', '👻', '👽', '👾', '🤖'
                ],
                'PEOPLE & BODY': [
                    '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆',
                    '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️',
                    '💅', '🤳', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠', '🫀', '🫁', '🦷', '🦴', '👀',
                    '👁️', '👅', '👄', '👶', '🧒', '👦', '👧', '🧑', '👱', '👨', '🧔', '👩', '🧓', '👴', '👵', '🙍',
                    '🙎', '🙅', '🙆', '💁', '🙋', '🧏', '🙇', '🤦', '🤷', '👮', '🕵️', '💂', '🥷', '👷', '🤴', '👸',
                    '👳', '👲', '🧕', '🤵', '👰', '🤰', '🤱', '👼', '🎅', '🤶', '🦸', '🦹', '🧙', '🧚', '🧛', '🧜'
                ]
            },
            'animals': {
                'ANIMALS & NATURE': [
                    '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐻‍❄️', '🐨', '🐯', '🦁', '🐮', '🐷', '🐽', '🐸',
                    '🐵', '🙈', '🙉', '🙊', '🐒', '🐔', '🐧', '🐦', '🐤', '🐣', '🐥', '🦆', '🦅', '🦉', '🦇', '🐺',
                    '🐗', '🐴', '🦄', '🐝', '🪱', '🐛', '🦋', '🐌', '🐞', '🐜', '🪰', '🪲', '🪳', '🦟', '🦗', '🕷️',
                    '🕸️', '🦂', '🐢', '🐍', '🦎', '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬',
                    '🐳', '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🦧', '🦣', '🐘', '🦛', '🦏', '🐪', '🐫', '🦒',
                    '🦘', '🦬', '🐃', '🐂', '🐄', '🐎', '🐖', '🐏', '🐑', '🦙', '🐐', '🦌', '🐕', '🐩', '🦮', '🐕‍🦺',
                    '🐈', '🐈‍⬛', '🪶', '🐓', '🦃', '🦤', '🦚', '🦜', '🦢', '🦩', '🕊️', '🐇', '🦝', '🦨', '🦡', '🦫',
                    '🦦', '🦥', '🐁', '🐀', '🐿️', '🦔'
                ],
                'PLANTS': [
                    '🌵', '🎄', '🌲', '🌳', '🌴', '🪵', '🌱', '🌿', '☘️', '🍀', '🎍', '🪴', '🎋', '🍃', '🍂', '🍁',
                    '🍄', '🐚', '🪨', '🌾', '💐', '🌷', '🌹', '🥀', '🌺', '🌸', '🌼', '🌻', '🌞', '🌝', '🌛', '🌜',
                    '🌚', '🌕', '🌖', '🌗', '🌘', '🌑', '🌒', '🌓', '🌔', '🌙', '🌎', '🌍', '🌏', '🪐', '💫', '⭐',
                    '🌟', '✨', '⚡', '☄️', '💥', '🔥', '🌪️', '🌈', '☀️', '🌤️', '⛅', '🌥️', '☁️', '🌦️', '🌧️', '⛈️'
                ]
            },
            'food': {
                'FOOD & DRINK': [
                    '🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥',
                    '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶️', '🫑', '🌽', '🥕', '🫒', '🧄', '🧅', '🥔', '🍠',
                    '🥐', '🥯', '🍞', '🥖', '🥨', '🧀', '🥚', '🍳', '🧈', '🥞', '🧇', '🥓', '🥩', '🍗', '🍖', '🦴',
                    '🌭', '🍔', '🍟', '🍕', '🫓', '🥪', '🥙', '🧆', '🌮', '🌯', '🫔', '🥗', '🥘', '🫕', '🥫', '🍝',
                    '🍜', '🍲', '🍛', '🍣', '🍱', '🥟', '🦪', '🍤', '🍙', '🍚', '🍘', '🍥', '🥠', '🥮', '🍢', '🍡',
                    '🍧', '🍨', '🍦', '🥧', '🧁', '🍰', '🎂', '🍮', '🍭', '🍬', '🍫', '🍿', '🍩', '🍪', '🌰', '🥜',
                    '🍯', '🥛', '🍼', '🫖', '☕', '🍵', '🧃', '🥤', '🧋', '🍶', '🍺', '🍻', '🥂', '🍷', '🥃', '🍸',
                    '🍹', '🧉', '🍾', '🧊', '🥄', '🍴', '🍽️', '🥣', '🥡', '🥢', '🧂'
                ]
            },
            'activities': {
                'ACTIVITIES': [
                    '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓', '🏸', '🏒', '🏑', '🥍',
                    '🏏', '🪃', '🥅', '⛳', '🪁', '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛼', '🛷', '⛸️', '🥌',
                    '🎿', '⛷️', '🏂', '🪂', '🏋️', '🤼', '🤸', '⛹️', '🤺', '🤾', '🏌️', '🏇', '⛑️', '🧘', '🏄', '🏊',
                    '🤽', '🚣', '🧗', '🚵', '🚴', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️', '🏵️', '🎗️', '🎫', '🎟️', '🎪',
                    '🤹', '🎭', '🩰', '🎨', '🎬', '🎤', '🎧', '🎼', '🎹', '🥁', '🪘', '🎷', '🎺', '🪗', '🎸', '🪕',
                    '🎻', '🎲', '♟️', '🎯', '🎳', '🎮', '🎰', '🧩'
                ]
            },
            'travel': {
                'TRAVEL & PLACES': [
                    '🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🦯', '🦽',
                    '🦼', '🛴', '🚲', '🛵', '🏍️', '🛺', '🚨', '🚔', '🚍', '🚘', '🚖', '🚡', '🚠', '🚟', '🚃', '🚋',
                    '🚞', '🚝', '🚄', '🚅', '🚈', '🚂', '🚆', '🚇', '🚊', '🚉', '✈️', '🛫', '🛬', '🛩️', '💺', '🛰️',
                    '🚀', '🛸', '🚁', '🛶', '⛵', '🚤', '🛥️', '🛳️', '⛴️', '🚢', '⚓', '🪝', '⛽', '🚧', '🚦', '🚥',
                    '🚏', '🗺️', '🗿', '🗽', '🗼', '🏰', '🏯', '🏟️', '🎡', '🎢', '🎠', '⛲', '⛱️', '🏖️', '🏝️', '🏜️',
                    '🌋', '⛰️', '🏔️', '🗻', '🏕️', '⛺', '🛖', '🏠', '🏡', '🏘️', '🏚️', '🏗️', '🏭', '🏢', '🏬', '🏣',
                    '🏤', '🏥', '🏦', '🏨', '🏪', '🏫', '🏩', '💒', '🏛️', '⛪', '🕌', '🕍', '🛕', '🕋', '⛩️', '🛤️',
                    '🛣️', '🗾', '🎑', '🏞️', '🌅', '🌄', '🌠', '🎇', '🎆', '🌇', '🌆', '🏙️', '🌃', '🌌', '🌉', '🌁'
                ]
            },
            'objects': {
                'OBJECTS': [
                    '⌚', '📱', '📲', '💻', '⌨️', '🖥️', '🖨️', '🖱️', '🖲️', '🕹️', '🗜️', '💽', '💾', '💿', '📀', '📼',
                    '📷', '📸', '📹', '🎥', '📽️', '🎞️', '📞', '☎️', '📟', '📠', '📺', '📻', '🎙️', '🎚️', '🎛️', '🧭',
                    '⏱️', '⏲️', '⏰', '🕰️', '⌛', '⏳', '📡', '🔋', '🔌', '💡', '🔦', '🕯️', '🪔', '🧯', '🛢️', '💸',
                    '💵', '💴', '💶', '💷', '🪙', '💰', '💳', '💎', '⚖️', '🪜', '🧰', '🪛', '🔧', '🔨', '⚒️', '🛠️',
                    '⛏️', '🪚', '🔩', '⚙️', '🪤', '🧱', '⛓️', '🧲', '🔫', '💣', '🧨', '🪓', '🔪', '🗡️', '⚔️', '🛡️',
                    '🚬', '⚰️', '🪦', '⚱️', '🏺', '🔮', '📿', '🧿', '💈', '⚗️', '🔭', '🔬', '🕳️', '🩹', '🩺', '💊',
                    '💉', '🩸', '🧬', '🦠', '🧫', '🧪', '🌡️', '🧹', '🪠', '🧺', '🧻', '🚽', '🚰', '🚿', '🛁', '🛀',
                    '🧼', '🪥', '🪒', '🧽', '🪣', '🧴', '🛎️', '🔑', '🗝️', '🚪', '🪑', '🛋️', '🛏️', '🛌', '🧸', '🪆'
                ],
                'OFFICE': [
                    '✏️', '✒️', '🖋️', '🖊️', '🖌️', '🖍️', '📝', '💼', '📁', '📂', '🗂️', '📅', '📆', '🗒️', '🗓️', '📇',
                    '📈', '📉', '📊', '📋', '📌', '📍', '📎', '🖇️', '📏', '📐', '✂️', '🗃️', '🗄️', '🗑️', '🔒', '🔓',
                    '🔏', '🔐', '🔑', '🗝️', '🔨', '🪓', '⛏️', '⚒️', '🛠️', '🗡️', '⚔️', '🔫', '🪃', '🏹', '🛡️', '🪚',
                    '🔧', '🪛', '🔩', '⚙️', '🗜️', '⚖️', '🦯', '🔗', '⛓️', '🪝', '🧰', '🧲', '🪜'
                ]
            },
            'symbols': {
                'HEARTS & LOVE': [
                    '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖',
                    '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈',
                    '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓', '🆔', '⚛️'
                ],
                'ARROWS & INDICATORS': [
                    '⬆️', '↗️', '➡️', '↘️', '⬇️', '↙️', '⬅️', '↖️', '↕️', '↔️', '↩️', '↪️', '⤴️', '⤵️', '🔃', '🔄',
                    '🔙', '🔚', '🔛', '🔜', '🔝', '▲', '▼', '◀️', '▶️', '⏪', '⏩', '⏫', '⏬', '◁', '▷', '△', '▽'
                ],
                'WARNING & STATUS': [
                    '⚠️', '⚡', '❌', '⭕', '🛑', '⛔', '📛', '🚫', '💯', '💢', '♨️', '🚷', '🚯', '🚳', '🚱', '🔞',
                    '📵', '🔇', '🔕', '🚭', '✅', '☑️', '✔️', '❎', '➕', '➖', '➗', '✖️', '♾️', '💲', '💱', '™️',
                    '©️', '®️', '〰️', '➰', '➿', '〽️', '✳️', '✴️', '❇️', '‼️', '⁉️', '❓', '❔', '❕', '❗', '🔅', '🔆'
                ],
                'SHAPES & COLORS': [
                    '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '🟤', '⚫', '⚪', '🟥', '🟧', '🟨', '🟩', '🟦', '🟪', '🟫',
                    '⬛', '⬜', '◼️', '◻️', '◾', '◽', '▪️', '▫️', '🔶', '🔷', '🔸', '🔹', '🔺', '🔻', '💠', '🔘',
                    '🔳', '🔲', '🏁', '🚩', '🎌', '🏴', '🏳️', '🏳️‍🌈', '🏳️‍⚧️', '🏴‍☠️'
                ]
            },
            'flags': {
                'FLAGS': [
                    '🇺🇸', '🇬🇧', '🇨🇦', '🇦🇺', '🇩🇪', '🇫🇷', '🇮🇹', '🇪🇸', '🇯🇵', '🇰🇷', '🇨🇳', '🇮🇳', '🇧🇷', '🇲🇽', '🇷🇺', '🇿🇦',
                    '🇦🇪', '🇸🇦', '🇹🇷', '🇳🇱', '🇧🇪', '🇨🇭', '🇦🇹', '🇸🇪', '🇳🇴', '🇩🇰', '🇫🇮', '🇵🇱', '🇬🇷', '🇵🇹', '🇮🇪', '🇳🇿',
                    '🇸🇬', '🇭🇰', '🇹🇼', '🇹🇭', '🇻🇳', '🇵🇭', '🇮🇩', '🇲🇾', '🇦🇷', '🇨🇴', '🇨🇱', '🇵🇪', '🇪🇬', '🇳🇬', '🇰🇪', '🇲🇦',
                    '🏁', '🚩', '🎌', '🏴', '🏳️', '🏳️‍🌈', '🏳️‍⚧️', '🏴‍☠️', '🇺🇳'
                ]
            }
        };
        this.injectStyles();
    }
    
    loadRecentEmojis() {
        try {
            const saved = userStorage.getItem('recentEmojis');
            return saved ? JSON.parse(saved) : ['✅', '🦄', '❌', '🚀', '🧲', '👁️', '🏛️', '🙂'];
        } catch (e) {
            return ['✅', '🦄', '❌', '🚀', '🧲', '👁️', '🏛️', '🙂'];
        }
    }
    
    saveRecentEmojis() {
        try {
            userStorage.setItem('recentEmojis', JSON.stringify(this.recentEmojis.slice(0, 16)));
        } catch (e) {
            console.warn('Could not save recent emojis');
        }
    }
    
    addToRecent(emoji) {
        // Remove if already exists
        this.recentEmojis = this.recentEmojis.filter(e => e !== emoji);
        // Add to beginning
        this.recentEmojis.unshift(emoji);
        // Keep only 16
        this.recentEmojis = this.recentEmojis.slice(0, 16);
        this.saveRecentEmojis();
    }

    injectStyles() {
        if (document.getElementById('emoji-picker-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'emoji-picker-styles';
        style.textContent = `
            .emoji-picker-panel {
                position: fixed;
                background: var(--tv-panel-bg, #050028);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
                z-index: 100001;
                width: 380px;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }
            
            /* Tab bar */
            .emoji-picker-tabs {
                display: flex;
                align-items: center;
                padding: 8px 8px 0 8px;
                gap: 2px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                background: var(--tv-panel-bg, #050028);
            }
            
            .emoji-picker-tab {
                font-size: 18px;
                width: 36px;
                height: 36px;
                border: none;
                background: transparent;
                cursor:default;
                border-radius: 6px;
                transition: all 0.15s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                position: relative;
                opacity: 0.6;
            }
            
            .emoji-picker-tab:hover {
                background: rgba(255, 255, 255, 0.1);
                opacity: 1;
            }
            
            .emoji-picker-tab.active {
                opacity: 1;
            }
            
            .emoji-picker-tab.active::after {
                content: '';
                position: absolute;
                bottom: -1px;
                left: 4px;
                right: 4px;
                height: 2px;
                background: #2962ff;
                border-radius: 1px;
            }
            
            /* Content area */
            .emoji-picker-content {
                max-height: 400px;
                overflow-y: auto;
                padding: 8px 0;
            }
            
            .emoji-picker-content::-webkit-scrollbar {
                width: 6px;
            }
            
            .emoji-picker-content::-webkit-scrollbar-track {
                background: rgba(30, 33, 42, 0.5);
                border-radius: 3px;
            }
            
            .emoji-picker-content::-webkit-scrollbar-thumb {
                background: rgba(100, 110, 140, 0.5);
                border-radius: 3px;
            }
            
            .emoji-picker-content::-webkit-scrollbar-thumb:hover {
                background: rgba(100, 110, 140, 0.8);
            }
            
            .emoji-picker-category {
                padding: 0 8px;
            }
            
            .emoji-picker-label {
                display: block;
                font-size: 11px;
                font-weight: 600;
                color: #787b86;
                padding: 12px 8px 8px 8px;
                text-transform: uppercase;
                letter-spacing: 0.8px;
            }
            
            .emoji-picker-grid {
                display: grid;
                grid-template-columns: repeat(8, 1fr);
                gap: 2px;
                padding: 0 4px 8px 4px;
            }
            
            .emoji-picker-btn {
                font-size: 22px;
                width: 40px;
                height: 40px;
                border: none;
                background: transparent;
                cursor:default;
                border-radius: 6px;
                transition: all 0.12s ease;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .emoji-picker-btn:hover {
                background: rgba(41, 98, 255, 0.15);
                transform: scale(1.15);
            }
            
            .emoji-picker-btn:active {
                transform: scale(0.95);
            }
            
            /* Light Mode Styles */
            body.light-mode .emoji-picker-panel {
                background: #ffffff;
                border: 1px solid #e0e3eb;
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
            }
            
            body.light-mode .emoji-picker-tabs {
                background: rgba(0, 0, 0, 0.03);
                border-bottom-color: #e0e3eb;
            }
            
            body.light-mode .emoji-picker-tab:hover {
                background: rgba(0, 0, 0, 0.05);
            }
            
            body.light-mode .emoji-picker-label {
                color: #6b7280;
            }
            
            body.light-mode .emoji-picker-btn:hover {
                background: rgba(41, 98, 255, 0.08);
            }
            
            body.light-mode .emoji-picker-content::-webkit-scrollbar-track {
                background: rgba(0, 0, 0, 0.05);
            }
            
            body.light-mode .emoji-picker-content::-webkit-scrollbar-thumb {
                background: rgba(0, 0, 0, 0.2);
            }
            
            body.light-mode .emoji-picker-content::-webkit-scrollbar-thumb:hover {
                background: rgba(0, 0, 0, 0.3);
            }
        `;
        document.head.appendChild(style);
    }

    show(anchorElement) {
        // Remove any existing picker
        this.hide();
        
        // Create panel
        const panel = document.createElement('div');
        panel.className = 'emoji-picker-panel';
        
        // Position below anchor (like other dropdowns) or center if no anchor
        if (anchorElement) {
            const rect = anchorElement.getBoundingClientRect();
            const panelWidth = 390;
            const desiredPanelHeight = 480;
            const minPanelHeight = 180;
            const margin = 10;
            const gap = 8;

            const spaceRight = window.innerWidth - rect.right - margin - gap;
            const spaceLeft = rect.left - margin - gap;
            const canPlaceRight = spaceRight >= panelWidth;
            const canPlaceLeft = spaceLeft >= panelWidth;

            const maxHeight = Math.max(minPanelHeight, window.innerHeight - (margin * 2));
            const panelHeight = Math.min(desiredPanelHeight, maxHeight);

            let left;
            if (canPlaceRight || canPlaceLeft) {
                const preferRight = spaceRight >= spaceLeft;
                const placeRight = canPlaceRight && (preferRight || !canPlaceLeft);
                left = placeRight ? (rect.right + gap) : (rect.left - panelWidth - gap);

                let top = rect.top + (rect.height / 2) - (panelHeight / 2);
                if (top < margin) top = margin;
                if (top + panelHeight > window.innerHeight - margin) {
                    top = window.innerHeight - margin - panelHeight;
                }

                panel.style.left = left + 'px';
                panel.style.top = top + 'px';
                panel.style.height = panelHeight + 'px';
                panel.dataset.panelHeight = String(panelHeight);
            } else {
                left = rect.left + (rect.width / 2) - (panelWidth / 2);
                if (left + panelWidth > window.innerWidth - margin) {
                    left = window.innerWidth - panelWidth - margin;
                }
                if (left < margin) left = margin;

                const spaceBelow = window.innerHeight - rect.bottom - margin - gap;
                const spaceAbove = rect.top - margin - gap;
                const preferBelow = spaceBelow >= 260 || spaceBelow >= spaceAbove;
                const available = preferBelow ? spaceBelow : spaceAbove;
                const fittedHeight = Math.min(desiredPanelHeight, Math.max(minPanelHeight, available));

                let top = preferBelow ? (rect.bottom + gap) : (rect.top - fittedHeight - gap);
                if (top < margin) top = margin;
                if (top + fittedHeight > window.innerHeight - margin) {
                    top = window.innerHeight - margin - fittedHeight;
                }

                panel.style.left = left + 'px';
                panel.style.top = top + 'px';
                panel.style.height = fittedHeight + 'px';
                panel.dataset.panelHeight = String(fittedHeight);
            }
        } else {
            panel.style.left = '50%';
            panel.style.top = '50%';
            panel.style.transform = 'translate(-50%, -50%)';
        }
        
        // Create tab bar
        const tabBar = document.createElement('div');
        tabBar.className = 'emoji-picker-tabs';
        
        this.tabs.forEach(tab => {
            const tabBtn = document.createElement('button');
            tabBtn.className = 'emoji-picker-tab' + (tab.id === this.activeTab ? ' active' : '');
            tabBtn.textContent = tab.icon;
            tabBtn.title = tab.label;
            tabBtn.dataset.tabId = tab.id;
            tabBtn.onclick = () => {
                this.activeTab = tab.id;
                this.renderContent();
                // Update active tab styling
                tabBar.querySelectorAll('.emoji-picker-tab').forEach(t => t.classList.remove('active'));
                tabBtn.classList.add('active');
            };
            tabBar.appendChild(tabBtn);
        });
        
        panel.appendChild(tabBar);
        
        // Create content container
        const content = document.createElement('div');
        content.className = 'emoji-picker-content';
        content.id = 'emoji-picker-content';
        const panelHeight = parseFloat(panel.dataset.panelHeight || '0');
        if (panelHeight > 0) {
            content.style.maxHeight = Math.max(120, panelHeight - 80) + 'px';
        }
        panel.appendChild(content);
        
        // Add to body
        document.body.appendChild(panel);
        this.panel = panel;
        this.contentContainer = content;
        this.visible = true;
        
        // Render initial content
        this.renderContent();
        
        // Close on click outside
        setTimeout(() => {
            document.addEventListener('click', this.handleClickOutside, true);
        }, 100);
    }
    
    renderContent() {
        if (!this.contentContainer) return;
        
        this.contentContainer.innerHTML = '';
        
        if (this.activeTab === 'recent') {
            // Show recently used emojis
            const categoryDiv = document.createElement('div');
            categoryDiv.className = 'emoji-picker-category';
            
            const label = document.createElement('span');
            label.className = 'emoji-picker-label';
            label.textContent = 'RECENTLY USED';
            categoryDiv.appendChild(label);
            
            const grid = document.createElement('div');
            grid.className = 'emoji-picker-grid';
            
            this.recentEmojis.forEach(emoji => {
                const btn = document.createElement('button');
                btn.className = 'emoji-picker-btn';
                btn.textContent = emoji;
                btn.onclick = () => {
                    this.selectEmoji(emoji);
                    this.hide();
                };
                grid.appendChild(btn);
            });
            
            categoryDiv.appendChild(grid);
            this.contentContainer.appendChild(categoryDiv);
        } else {
            // Show category emojis
            const categories = this.emojiCategories[this.activeTab];
            if (categories) {
                Object.entries(categories).forEach(([category, emojis]) => {
                    const categoryDiv = document.createElement('div');
                    categoryDiv.className = 'emoji-picker-category';
                    
                    const label = document.createElement('span');
                    label.className = 'emoji-picker-label';
                    label.textContent = category;
                    categoryDiv.appendChild(label);
                    
                    const grid = document.createElement('div');
                    grid.className = 'emoji-picker-grid';
                    
                    emojis.forEach(emoji => {
                        const btn = document.createElement('button');
                        btn.className = 'emoji-picker-btn';
                        btn.textContent = emoji;
                        btn.onclick = () => {
                            this.selectEmoji(emoji);
                            this.hide();
                        };
                        grid.appendChild(btn);
                    });
                    
                    categoryDiv.appendChild(grid);
                    this.contentContainer.appendChild(categoryDiv);
                });
            }
        }
    }
    
    handleClickOutside = (e) => {
        if (this.panel && !this.panel.contains(e.target) && 
            !e.target.closest('#emojiTool') &&
            !e.target.closest('#emojiToolStandalone')) {
            this.hide();
        }
    }
    
    hide() {
        if (this.panel) {
            this.panel.remove();
            this.panel = null;
        }
        this.contentContainer = null;
        this.visible = false;
        document.removeEventListener('click', this.handleClickOutside, true);
    }
    
    toggle(anchorElement) {
        if (this.visible) {
            this.hide();
        } else {
            this.show(anchorElement);
        }
    }
    
    selectEmoji(emoji) {
        console.log('Emoji selected:', emoji);
        // Add to recent emojis
        this.addToRecent(emoji);
        
        if (this.onSelect) {
            this.onSelect({
                glyph: emoji,
                category: 'emoji',
                fontSize: 48
            });
        }
    }
}

// Make it globally available
window.SimpleEmojiPicker = SimpleEmojiPicker;
