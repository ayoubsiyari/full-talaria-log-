// Store loaded files
let availableFiles = [];

console.log('✅ Prop firm script loading...');

// Define modal functions globally FIRST (before DOMContentLoaded)
window.openCreatePresetModal = function() {
    console.log('🎯 Opening preset modal...');
    const modal = document.getElementById('createPresetModal');
    if (!modal) {
        console.error('❌ Modal element not found!');
        return;
    }
    modal.style.display = 'flex';
    console.log('✅ Modal opened');
    
    // Setup modal functionality
    setupModalHandlers();
}

window.closeCreatePresetModal = function() {
    console.log('🔒 Closing preset modal...');
    const modal = document.getElementById('createPresetModal');
    if (modal) {
        modal.style.display = 'none';
    }
    // Reset form
    const presetName = document.getElementById('presetName');
    if (presetName) presetName.value = '';
    
    const breakevenToggle = document.getElementById('presetBreakevenToggle');
    if (breakevenToggle) breakevenToggle.checked = false;
    
    const trailingToggle = document.getElementById('presetTrailingToggle');
    if (trailingToggle) trailingToggle.checked = false;
    
    const multipleTPToggle = document.getElementById('presetMultipleTPToggle');
    if (multipleTPToggle) multipleTPToggle.checked = false;
    
    const breakevenSettings = document.getElementById('presetBreakevenSettings');
    if (breakevenSettings) breakevenSettings.style.display = 'none';
    
    const trailingSettings = document.getElementById('presetTrailingSettings');
    if (trailingSettings) trailingSettings.style.display = 'none';
    
    const multipleTPSettings = document.getElementById('presetMultipleTPSettings');
    if (multipleTPSettings) multipleTPSettings.style.display = 'none';
    
    console.log('✅ Modal closed and reset');
}

window.saveNewPreset = function() {
    console.log('💾 Saving new preset...');
    const name = document.getElementById('presetName').value.trim();
    if (!name) {
        alert('⚠️ Please enter a preset name');
        return;
    }
    
    const preset = {
        name: name,
        breakeven: {
            enabled: document.getElementById('presetBreakevenToggle').checked,
            mode: window.currentModalBeMode || 'rr',
            rrValue: parseFloat(document.getElementById('presetBreakevenRR').value || 1),
            amountValue: parseFloat(document.getElementById('presetBreakevenAmount').value || 50),
            percentValue: parseFloat(document.getElementById('presetBreakevenPercent').value || 1),
            pipOffset: 0
        },
        trailing: {
            enabled: document.getElementById('presetTrailingToggle').checked,
            activateMode: window.currentModalTrailMode || 'trail-rr',
            rrValue: parseFloat(document.getElementById('presetTrailingRR').value || 1.5),
            pipsValue: parseFloat(document.getElementById('presetTrailingPips').value || 10),
            dollarValue: parseFloat(document.getElementById('presetTrailingDollar').value || 50),
            percentValue: parseFloat(document.getElementById('presetTrailingPercent').value || 1),
            stepSize: parseFloat(document.getElementById('presetTrailingStep').value || 4)
        },
        multipleTP: {
            enabled: document.getElementById('presetMultipleTPToggle').checked,
            numberOfTargets: parseInt(document.getElementById('presetNumTPTargets').value || 3),
            targets: []
        }
    };
    
    let saved = JSON.parse(userStorage.getItem('protectionSettings') || '[]');
    
    // Check if name already exists
    const existingIndex = saved.findIndex(s => s.name === preset.name);
    if (existingIndex >= 0) {
        if (!confirm(`Preset "${preset.name}" already exists. Overwrite?`)) return;
        saved[existingIndex] = preset;
    } else {
        saved.push(preset);
    }
    
    userStorage.setItem('protectionSettings', JSON.stringify(saved));
    console.log('✅ Protection preset saved:', preset);
    
    // Reload presets dropdown
    loadProtectionPresets();
    
    // Select the newly created preset
    document.getElementById('protectionPresetSelect').value = preset.name;
    showPresetDetails(preset.name);
    
    // Show success message
    alert(`✅ Protection preset "${preset.name}" saved successfully!`);
    
    // Close modal
    window.closeCreatePresetModal();
}

// Setup modal handlers
function setupModalHandlers() {
    // Reset modal state
    let modalBeMode = 'rr';
    let modalTrailMode = 'trail-rr';
    
    // Toggle handlers
    const breakevenToggle = document.getElementById('presetBreakevenToggle');
    if (breakevenToggle) {
        breakevenToggle.onchange = (e) => {
            const settings = document.getElementById('presetBreakevenSettings');
            if (settings) settings.style.display = e.target.checked ? 'block' : 'none';
        };
    }
    
    const trailingToggle = document.getElementById('presetTrailingToggle');
    if (trailingToggle) {
        trailingToggle.onchange = (e) => {
            const settings = document.getElementById('presetTrailingSettings');
            if (settings) settings.style.display = e.target.checked ? 'block' : 'none';
        };
    }
    
    const multipleTPToggle = document.getElementById('presetMultipleTPToggle');
    if (multipleTPToggle) {
        multipleTPToggle.onchange = (e) => {
            const settings = document.getElementById('presetMultipleTPSettings');
            if (settings) settings.style.display = e.target.checked ? 'block' : 'none';
        };
    }
    
    // Breakeven mode buttons
    document.querySelectorAll('.preset-mode-btn').forEach(btn => {
        btn.onclick = () => {
            const mode = btn.getAttribute('data-mode');
            modalBeMode = mode;
            window.currentModalBeMode = mode;
            
            document.querySelectorAll('.preset-mode-btn').forEach(b => {
                if (b.getAttribute('data-mode') === mode) {
                    b.style.background = '#7c3aed';
                    b.style.color = '#fff';
                    b.style.border = 'none';
                } else {
                    b.style.background = 'transparent';
                    b.style.color = '#787b86';
                    b.style.border = '1px solid #2a2e39';
                }
            });
            
            // Hide all inputs first
            document.getElementById('presetBreakevenRRInput').style.display = 'none';
            document.getElementById('presetBreakevenAmountInput').style.display = 'none';
            document.getElementById('presetBreakevenPercentInput').style.display = 'none';
            
            // Show the selected input
            if (mode === 'rr') {
                document.getElementById('presetBreakevenRRInput').style.display = 'flex';
            } else if (mode === 'amount') {
                document.getElementById('presetBreakevenAmountInput').style.display = 'flex';
            } else if (mode === 'percent') {
                document.getElementById('presetBreakevenPercentInput').style.display = 'flex';
            }
        };
    });
    
    // Trailing mode buttons
    document.querySelectorAll('.preset-trail-btn').forEach(btn => {
        btn.onclick = () => {
            const mode = btn.getAttribute('data-mode');
            modalTrailMode = mode;
            window.currentModalTrailMode = mode;
            
            document.querySelectorAll('.preset-trail-btn').forEach(b => {
                if (b.getAttribute('data-mode') === mode) {
                    b.style.background = '#7c3aed';
                    b.style.color = '#fff';
                    b.style.border = 'none';
                } else {
                    b.style.background = 'transparent';
                    b.style.color = '#787b86';
                    b.style.border = '1px solid #2a2e39';
                }
            });
            
            // Hide all inputs first
            document.getElementById('presetTrailingRRInput').style.display = 'none';
            document.getElementById('presetTrailingPipsInput').style.display = 'none';
            document.getElementById('presetTrailingDollarInput').style.display = 'none';
            document.getElementById('presetTrailingPercentInput').style.display = 'none';
            
            // Show the selected input
            if (mode === 'trail-rr') {
                document.getElementById('presetTrailingRRInput').style.display = 'flex';
            } else if (mode === 'trail-pips') {
                document.getElementById('presetTrailingPipsInput').style.display = 'flex';
            } else if (mode === 'trail-dollar') {
                document.getElementById('presetTrailingDollarInput').style.display = 'flex';
            } else if (mode === 'trail-percent') {
                document.getElementById('presetTrailingPercentInput').style.display = 'flex';
            }
        };
    });
    
    // Store modes in window for access in saveNewPreset
    window.currentModalBeMode = modalBeMode;
    window.currentModalTrailMode = modalTrailMode;
}

console.log('✅ Modal functions defined globally');

// Initialize page
document.addEventListener('DOMContentLoaded', function() {
    console.log('📋 DOM loaded, initializing...');
    loadAvailableFiles();
    setupPresetButtons();
    setupFormHandlers();
    initSimulationPresetGrid();
    loadProtectionPresets();
    console.log('✅ Initialization complete');
});

// Load available CSV files from server
async function loadAvailableFiles() {
    // Check if we're using new multi-select (fileList) or old single select (symbolSelect)
    const fileList = document.getElementById('fileList');
    const select = document.getElementById('symbolSelect');
    
    // If new multi-select exists, let the inline script handle it
    if (fileList && !select) {
        console.log('📁 Using new multi-select system (fileList)');
        // Multi-select is handled by propfirm-backtest.html's inline script
        return;
    }
    
    // Fallback to old single-select for backward compatibility
    if (!select) {
        console.log('⚠️ No file select element found');
        return;
    }
    
    try {
        console.log('🔄 Fetching files from /api/files...');
        
        // Show loading state
        select.innerHTML = '<option value="">Loading...</option>';
        
        const response = await fetch('/api/files');
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('📁 API Response:', data);
        
        // Handle multiple response formats
        let files = [];
        if (Array.isArray(data)) {
            files = data;
        } else if (data.files && Array.isArray(data.files)) {
            files = data.files;
        } else if (typeof data === 'object') {
            files = Object.values(data).find(val => Array.isArray(val)) || [];
        }
        
        console.log('📁 Found', files.length, 'files');
        
        if (!files || files.length === 0) {
            select.innerHTML = '<option value="">No data files found</option>';
            return;
        }
        
        availableFiles = files;
        
        // Sort files by name
        files.sort((a, b) => {
            const nameA = (a.original_name || a.name || a.filename || '').toLowerCase();
            const nameB = (b.original_name || b.name || b.filename || '').toLowerCase();
            return nameA.localeCompare(nameB);
        });
        
        // Populate dropdown
        select.innerHTML = '<option value="">-- Select a symbol --</option>';
        files.forEach(file => {
            const fileName = file.original_name || file.name || file.filename || `File ${file.id}`;
            const symbolName = extractSymbolName(fileName);
            const option = document.createElement('option');
            option.value = file.id;
            option.textContent = `${symbolName} (${fileName})`;
            option.dataset.filename = fileName;
            option.dataset.symbolname = symbolName;
            select.appendChild(option);
        });
        
        // Remove any existing event listeners by cloning
        const newSelect = select.cloneNode(true);
        select.parentNode.replaceChild(newSelect, select);
        
        // Add change event to load date range
        newSelect.addEventListener('change', function() {
            const fileId = this.value;
            console.log('📁 Symbol selected:', fileId);
            if (fileId) {
                loadDateRangeFromFile(fileId);
                // Enable date inputs
                document.getElementById('startDate').disabled = false;
                document.getElementById('endDate').disabled = false;
            }
        });
        
        console.log(`✅ Successfully loaded ${files.length} symbols`);
        
    } catch (error) {
        console.error('❌ Error loading files:', error);
        if (select) select.innerHTML = '<option value="">Error loading files</option>';
    }
}

// Categorize files by symbol type
function categorizeFiles(files) {
    const categories = {
        'All Symbols': []
    };
    
    files.forEach(file => {
        const fileName = file.original_name || file.name || file.filename || `File ${file.id}`;
        const symbolName = extractSymbolName(fileName);
        
        categories['All Symbols'].push({
            id: file.id,
            fileName: fileName,
            symbolName: symbolName,
            fileData: file
        });
    });
    
    return categories;
}

// Extract symbol name from filename
function extractSymbolName(fileName) {
    // Remove file extension
    let name = fileName.replace(/\.csv$/i, '');
    
    // Try to extract symbol from common patterns
    // Pattern 1: "EURUSD.csv" or "EURUSD1.csv"
    const match1 = name.match(/([A-Z]{6,})/);
    if (match1) return match1[1];
    
    // Pattern 2: "20251028_194229_GBPUSD.csv"
    const match2 = name.match(/_([A-Z]{6,})/);
    if (match2) return match2[1];
    
    // Pattern 3: Just use the filename
    return name.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Render symbols in categories
function renderSymbols(categorized) {
    const container = document.getElementById('symbolsContainer');
    container.innerHTML = '';
    
    Object.keys(categorized).forEach(categoryName => {
        const symbols = categorized[categoryName];
        
        const categoryDiv = document.createElement('div');
        categoryDiv.className = 'symbol-category';
        
        const header = document.createElement('div');
        header.className = 'category-header';
        header.onclick = function() { toggleCategory(this); };
        header.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
            <span class="category-title">${categoryName}</span>
        `;
        
        const list = document.createElement('div');
        list.className = 'symbol-list';
        
        symbols.forEach(symbol => {
            const item = document.createElement('label');
            item.className = 'symbol-item';
            item.innerHTML = `
                <input type="checkbox" class="symbol-checkbox" name="symbol" value="${symbol.id}" data-name="${symbol.symbolName}" data-filename="${symbol.fileName}">
                <div>
                    <span class="symbol-name">${symbol.symbolName}</span>
                    <span class="symbol-description">${symbol.fileName}</span>
                </div>
            `;
            list.appendChild(item);
        });
        
        categoryDiv.appendChild(header);
        categoryDiv.appendChild(list);
        container.appendChild(categoryDiv);
    });
}

// Toggle category collapse
function toggleCategory(header) {
    header.classList.toggle('collapsed');
    const list = header.nextElementSibling;
    list.classList.toggle('collapsed');
}

// Setup preset buttons for balance and profit
function setupPresetButtons() {
    // Balance presets
    const balancePresets = document.getElementById('balancePresets');
    const balanceValues = [10000, 50000, 100000, 500000, 1000000];
    balanceValues.forEach(value => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pill';
        btn.dataset.val = String(value);
        btn.textContent = value >= 1000000 ? (value/1000000) + 'M' : (value/1000) + 'K';
        btn.onclick = function() {
            document.getElementById('balance').value = value;
            document.querySelectorAll('#balancePresets .pill').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            updateLossLimits();
        };
        balancePresets.appendChild(btn);
    });
    const firstBal = balancePresets.querySelector('.pill');
    if (firstBal) firstBal.classList.add('active');
    
    // Profit target presets
    const profitPresets = document.getElementById('profitPresets');
    const profitValues = [10, 15, 25];
    profitValues.forEach(value => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pill';
        btn.dataset.pt = String(value);
        btn.textContent = value + '%';
        btn.onclick = function() {
            document.getElementById('profitTarget').value = value;
            document.querySelectorAll('#profitPresets .pill').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            updateLossLimits();
        };
        profitPresets.appendChild(btn);
    });
    const firstPt = profitPresets.querySelector('.pill');
    if (firstPt) firstPt.classList.add('active');
}

function initSimulationPresetGrid() {
    var grid = document.getElementById('simulationPresetGrid');
    var list = typeof window.PROPFIRM_SIMULATION_PRESETS !== 'undefined' ? window.PROPFIRM_SIMULATION_PRESETS : null;
    if (!grid || !list || !list.length) {
        return;
    }

    grid.innerHTML = '';
    list.forEach(function (preset) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'preset-card';
        btn.setAttribute('data-preset-id', preset.id);
        btn.setAttribute('role', 'listitem');
        var icon = preset.icon ? String(preset.icon) : '📌';
        btn.innerHTML =
            '<div class="preset-icon" aria-hidden="true">' + icon + '</div>' +
            '<div class="preset-name">' + String(preset.title || preset.id) + '</div>' +
            '<div class="preset-desc">' + String(preset.description || '') + '</div>';
        btn.addEventListener('click', function () {
            applySimulationPreset(preset.id);
        });
        grid.appendChild(btn);
    });

    applySimulationPreset('custom');
}

function applySimulationPreset(presetId) {
    var idEl = document.getElementById('simulationPresetId');
    var labelEl = document.getElementById('simulationPresetLabel');
    var preset = typeof window.getPropfirmPresetById === 'function'
        ? window.getPropfirmPresetById(presetId)
        : null;

    if (!preset) {
        preset = { id: 'custom', title: 'Custom configuration', rules: null };
    }

    if (idEl) idEl.value = preset.id;
    if (labelEl) labelEl.value = preset.title || preset.id;

    document.querySelectorAll('.preset-card').forEach(function (el) {
        el.classList.toggle('active', el.getAttribute('data-preset-id') === preset.id);
    });

    var nameEl = document.getElementById('active-preset-name');
    if (nameEl) {
        nameEl.textContent = preset.title || preset.id || 'Custom';
    }

    if (!preset.rules) {
        if (typeof updateLossLimits === 'function') {
            updateLossLimits();
        }
        return;
    }

    var r = preset.rules;
    var balanceEl = document.getElementById('balance');
    var profitEl = document.getElementById('profitTarget');
    var dailyPct = document.getElementById('maxDailyLossPercent');
    var totalPct = document.getElementById('maxTotalLossPercent');
    var minDaysEl = document.getElementById('minTradingDays');
    var disableMinEl = document.getElementById('disableMinDays');
    var levSlider = document.getElementById('leverageSlider');
    var levVal = document.getElementById('leverageValue');

    if (balanceEl && typeof r.balance === 'number') {
        balanceEl.value = String(r.balance);
    }
    if (profitEl && typeof r.profitTarget === 'number') {
        profitEl.value = String(r.profitTarget);
    }
    if (dailyPct && typeof r.maxDailyLossPercent === 'number') {
        dailyPct.value = String(r.maxDailyLossPercent);
    }
    if (totalPct && typeof r.maxTotalLossPercent === 'number') {
        totalPct.value = String(r.maxTotalLossPercent);
    }
    if (minDaysEl && typeof r.minTradingDays === 'number') {
        minDaysEl.value = String(r.minTradingDays);
    }
    if (disableMinEl && typeof r.disableMinDays === 'boolean') {
        disableMinEl.checked = r.disableMinDays;
        if (minDaysEl) minDaysEl.disabled = r.disableMinDays;
    }
    if (levSlider && levVal && typeof r.leverage === 'number') {
        var lv = Math.max(1, Math.min(125, Math.round(r.leverage)));
        levSlider.value = String(lv);
        levVal.value = String(lv);
    }

    if (balanceEl && balanceEl.value) {
        document.querySelectorAll('#balancePresets .pill').forEach(function (p) {
            p.classList.toggle('active', p.dataset.val === String(balanceEl.value));
        });
    }
    if (profitEl && profitEl.value) {
        document.querySelectorAll('#profitPresets .pill').forEach(function (p) {
            p.classList.toggle('active', p.dataset.pt === String(profitEl.value));
        });
    }

    if (typeof updateLossLimits === 'function') {
        updateLossLimits();
    }
}

// Setup form handlers
function setupFormHandlers() {
    // Balance input updates loss limits
    document.getElementById('balance').addEventListener('input', updateLossLimits);
    document.getElementById('profitTarget').addEventListener('input', updateLossLimits);
    
    // Loss percentage inputs update dollar amounts
    document.getElementById('maxDailyLossPercent').addEventListener('input', function() {
        const balance = parseFloat(document.getElementById('balance').value) || 0;
        const percent = parseFloat(this.value) || 0;
        document.getElementById('maxDailyLossDollar').value = Math.round(balance * percent / 100);
        updateLossLimits();
    });
    
    document.getElementById('maxTotalLossPercent').addEventListener('input', function() {
        const balance = parseFloat(document.getElementById('balance').value) || 0;
        const percent = parseFloat(this.value) || 0;
        document.getElementById('maxTotalLossDollar').value = Math.round(balance * percent / 100);
        updateLossLimits();
    });
    
    // Loss dollar inputs update percentages
    document.getElementById('maxDailyLossDollar').addEventListener('input', function() {
        const balance = parseFloat(document.getElementById('balance').value) || 1;
        const dollar = parseFloat(this.value) || 0;
        document.getElementById('maxDailyLossPercent').value = ((dollar / balance) * 100).toFixed(1);
    });
    
    document.getElementById('maxTotalLossDollar').addEventListener('input', function() {
        const balance = parseFloat(document.getElementById('balance').value) || 1;
        const dollar = parseFloat(this.value) || 0;
        document.getElementById('maxTotalLossPercent').value = ((dollar / balance) * 100).toFixed(1);
    });
    
    // Disable min days checkbox
    document.getElementById('disableMinDays').addEventListener('change', function() {
        document.getElementById('minTradingDays').disabled = this.checked;
    });
    
    // Leverage slider sync
    const leverageSlider = document.getElementById('leverageSlider');
    const leverageValue = document.getElementById('leverageValue');
    
    leverageSlider.addEventListener('input', function() {
        leverageValue.value = this.value;
    });
    
    leverageValue.addEventListener('input', function() {
        let value = parseInt(this.value) || 1;
        if (value < 1) value = 1;
        if (value > 125) value = 125;
        this.value = value;
        leverageSlider.value = value;
    });
    
    // Form submission
    document.getElementById('propfirmForm').addEventListener('submit', handleFormSubmit);

    updateLossLimits();
}

// Update loss limits when balance changes
function updateLossLimits() {
    const balance = parseFloat(document.getElementById('balance').value) || 0;
    const dailyPercent = parseFloat(document.getElementById('maxDailyLossPercent').value) || 5;
    const totalPercent = parseFloat(document.getElementById('maxTotalLossPercent').value) || 10;
    const profitPct = parseFloat(document.getElementById('profitTarget').value) || 0;

    document.getElementById('maxDailyLossDollar').value = Math.round(balance * dailyPercent / 100);
    document.getElementById('maxTotalLossDollar').value = Math.round(balance * totalPercent / 100);

    const ptUsd = document.getElementById('profitTargetUsd');
    if (ptUsd) {
        ptUsd.value = Math.round(balance * profitPct / 100);
    }

    const rsT = document.getElementById('rs-target');
    const rsTu = document.getElementById('rs-target-usd');
    const rsL = document.getElementById('rs-loss');
    const rsLu = document.getElementById('rs-loss-usd');
    if (rsT) rsT.textContent = profitPct + '%';
    if (rsTu) {
        rsTu.textContent =
            '$' +
            Math.round(balance * profitPct / 100).toLocaleString() +
            ' on $' +
            balance.toLocaleString() +
            ' account';
    }
    if (rsL) rsL.textContent = totalPercent + '%';
    if (rsLu) {
        rsLu.textContent = '$' + Math.round(balance * totalPercent / 100).toLocaleString() + ' drawdown limit';
    }
}

// Setup symbol checkbox handlers
function setupSymbolCheckboxes() {
    const checkboxes = document.querySelectorAll('.symbol-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', updateDateInputs);
    });
}

// Enable/disable date inputs based on symbol selection
async function updateDateInputs() {
    const selectedSymbols = document.querySelectorAll('.symbol-checkbox:checked');
    const startDate = document.getElementById('startDate');
    const endDate = document.getElementById('endDate');
    if (!startDate || !endDate) return;

    if (selectedSymbols.length > 0) {
        startDate.removeAttribute('disabled');
        endDate.removeAttribute('disabled');
        const firstFileId = selectedSymbols[0].value;
        await loadDateRangeFromFile(firstFileId);
    } else {
        startDate.value = '';
        endDate.value = '';
        startDate.removeAttribute('min');
        startDate.removeAttribute('max');
        endDate.removeAttribute('min');
        endDate.removeAttribute('max');
    }
}

// Load date range from selected file (same logic as backtesting.html)
async function loadDateRangeFromFile(fileId) {
    if (!fileId) return;
    
    try {
        console.log(`📅 Loading date range from file ${fileId}...`);
        
        // Fetch first row
        const response = await fetch(`/api/file/${fileId}?offset=0&limit=1`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const responseData = await response.json();
        if (!responseData.data) return;
        
        // Parse CSV
        const lines = responseData.data.trim().split('\n');
        if (lines.length < 2) return;
        
        const header = lines[0].split(',');
        const firstRowValues = lines[1].split(',');
        const firstRow = {};
        header.forEach((key, index) => {
            firstRow[key] = firstRowValues[index];
        });
        
        // Extract timestamp from first row
        let firstTimestamp = extractTimestamp(firstRow);
        if (!firstTimestamp) return;
        if (typeof firstTimestamp === 'string' && /^\d+$/.test(String(firstTimestamp).trim())) {
            firstTimestamp = parseInt(firstTimestamp, 10);
        }

        const firstDate = new Date(firstTimestamp);
        if (isNaN(firstDate.getTime())) return;
        
        // Fetch last row
        const totalRows = responseData.total || 30000;
        const lastOffset = Math.max(0, totalRows - 1);
        
        const response2 = await fetch(`/api/file/${fileId}?offset=${lastOffset}&limit=1`);
        const lastResponseData = await response2.json();
        
        let lastDate = firstDate;
        if (lastResponseData.data) {
            const lastLines = lastResponseData.data.trim().split('\n');
            if (lastLines.length >= 2) {
                const lastRowValues = lastLines[lastLines.length - 1].split(',');
                const lastRow = {};
                header.forEach((key, index) => {
                    lastRow[key] = lastRowValues[index];
                });
                
                let lastTimestamp = extractTimestamp(lastRow);
                if (lastTimestamp) {
                    if (typeof lastTimestamp === 'string' && /^\d+$/.test(String(lastTimestamp).trim())) {
                        lastTimestamp = parseInt(lastTimestamp, 10);
                    }
                    lastDate = new Date(lastTimestamp);
                }
            }
        }
        
        const startDateInput = document.getElementById('startDate');
        const endDateInput = document.getElementById('endDate');
        if (!startDateInput || !endDateInput) return;

        const minStr = firstDate.toISOString().slice(0, 16);
        const maxStr = lastDate.toISOString().slice(0, 16);
        startDateInput.min = minStr;
        startDateInput.max = maxStr;
        endDateInput.min = minStr;
        endDateInput.max = maxStr;
        startDateInput.value = minStr;
        endDateInput.value = maxStr;
        startDateInput.removeAttribute('disabled');
        endDateInput.removeAttribute('disabled');

        const hintEl = document.getElementById('testingPeriodHint');
        if (hintEl) {
            hintEl.textContent =
                'Available data in file: ' +
                firstDate.toLocaleString() +
                ' — ' +
                lastDate.toLocaleString() +
                '. You can narrow the window; stay within the range above.';
        }

        console.log(`✅ Date range: ${firstDate.toLocaleString()} to ${lastDate.toLocaleString()}`);
        
    } catch (error) {
        console.error('❌ Error loading date range:', error);
    }
}

// Extract timestamp from CSV row
function extractTimestamp(row) {
    // Strategy 1: Standard timestamp fields
    if (row.t) return row.t;
    if (row.time) return row.time;
    if (row.timestamp) return row.timestamp;
    
    // Strategy 2: MetaTrader format
    if (row['<DTYYYYMMDD>'] && row['<TIME>']) {
        const dateStr = String(row['<DTYYYYMMDD>']);
        const timeStr = String(row['<TIME>']).padStart(6, '0');
        const year = dateStr.substring(0, 4);
        const month = dateStr.substring(4, 6);
        const day = dateStr.substring(6, 8);
        const hour = timeStr.substring(0, 2);
        const minute = timeStr.substring(2, 4);
        const second = timeStr.substring(4, 6);
        return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`).getTime();
    }
    
    // Strategy 3: Search for date/time fields
    const keys = Object.keys(row);
    for (let key of keys) {
        if (key.toLowerCase().includes('date') || key.toLowerCase().includes('time')) {
            const value = row[key];
            const parsedDate = new Date(value);
            if (!isNaN(parsedDate.getTime())) {
                return parsedDate.getTime();
            }
        }
    }
    
    return null;
}

// Load Protection Presets
function loadProtectionPresets() {
    const select = document.getElementById('protectionPresetSelect');
    if (!select) return;

    const presets = JSON.parse(userStorage.getItem('protectionSettings') || '[]');
    
    // Clear existing options except first one
    select.innerHTML = '<option value="">-- None (Configure in chart) --</option>';
    
    // Add presets
    presets.forEach(preset => {
        const option = document.createElement('option');
        option.value = preset.name;
        option.textContent = preset.name;
        select.appendChild(option);
    });

    console.log(`✅ Loaded ${presets.length} protection presets`);
    
    // Add change handler
    select.addEventListener('change', function(e) {
        showPresetDetails(e.target.value);
    });
}

// Show preset details
function showPresetDetails(presetName) {
    const detailsDiv = document.getElementById('presetDetails');
    const contentDiv = document.getElementById('presetDetailsContent');
    
    if (!presetName) {
        detailsDiv.style.display = 'none';
        return;
    }

    const presets = JSON.parse(userStorage.getItem('protectionSettings') || '[]');
    const preset = presets.find(p => p.name === presetName);
    
    if (!preset) {
        detailsDiv.style.display = 'none';
        return;
    }

    let details = [];
    
    // Breakeven details
    if (preset.breakeven && preset.breakeven.enabled) {
        const beMode = preset.breakeven.mode === 'rr' ? 
            `at ${preset.breakeven.rrValue}:1 R:R` : 
            `at $${preset.breakeven.amountValue}`;
        details.push(`🛡️ <strong>Breakeven:</strong> ${beMode}`);
    }
    
    // Trailing SL details
    if (preset.trailing && preset.trailing.enabled) {
        const trailMode = preset.trailing.activateMode === 'trail-rr' ? 
            `${preset.trailing.rrValue}:1 R:R` : 
            `${preset.trailing.pipsValue} pips`;
        details.push(`📊 <strong>Trailing SL:</strong> Activate at ${trailMode}, step ${preset.trailing.stepSize} pips`);
    }
    
    // Multiple TP details
    if (preset.multipleTP && preset.multipleTP.enabled) {
        details.push(`🎯 <strong>Multiple TP:</strong> ${preset.multipleTP.numberOfTargets} targets`);
    }
    
    if (details.length === 0) {
        details.push('No protection features enabled');
    }
    
    contentDiv.innerHTML = details.join('<br>');
    detailsDiv.style.display = 'block';
}

// Handle form submission
async function handleFormSubmit(e) {
    e.preventDefault();
    
    console.log('🚀 Form submitted');
    
    // Multi-select + instrument table (aligned with standard backtesting.html)
    let selectedSymbols = [];
    let primaryFileId, primaryFileName;
    let instrumentRows = [];

    if (typeof selectedFilesArray !== 'undefined' && selectedFilesArray.length > 0) {
        console.log('📊 Using multi-file selection:', selectedFilesArray);
        if (typeof collectInstrumentConfigs !== 'function') {
            alert('Instrument configuration is not ready. Please refresh the page.');
            return;
        }
        instrumentRows = collectInstrumentConfigs();
        if (instrumentRows.length === 0) {
            alert('Please select at least one data file');
            return;
        }
        if (instrumentRows.length > 10) {
            alert('Maximum 10 instruments per session.');
            return;
        }
        if (instrumentRows.some(row => !row.fileId)) {
            alert('Missing data file for one or more instruments.');
            return;
        }
        if (instrumentRows.some(row => !Number.isFinite(row.pip_size) || row.pip_size <= 0)) {
            alert('Invalid pip size detected. Please use a positive number (e.g. 0.0001).');
            return;
        }
        if (instrumentRows.some(row => !Number.isFinite(row.pip_value_per_lot) || row.pip_value_per_lot <= 0)) {
            alert('Invalid pip value detected. Please use a positive number.');
            return;
        }
        selectedSymbols = instrumentRows.map(row => ({
            fileId: row.fileId,
            symbolName: row.ticker,
            fileName: row.fileName
        }));
        primaryFileId = instrumentRows[0].fileId;
        primaryFileName = instrumentRows[0].fileName;
    } else {
        // Fallback to old single select
        const select = document.getElementById('symbolSelect');
        const selectedOption = select?.options[select?.selectedIndex];
        
        if (!select || !select.value) {
            alert('Please select at least one symbol');
            return;
        }
        
        const symbolName = selectedOption.dataset.symbolname || selectedOption.textContent.split('(')[0].trim();
        let fileName = selectedOption.dataset.filename || selectedOption.textContent.split('(')[1]?.replace(')', '').trim();
        
        if (!fileName) {
            const fileData = availableFiles.find(f => f.id == select.value);
            if (fileData) {
                fileName = fileData.original_name || fileData.name || fileData.filename || `${symbolName}.csv`;
            } else {
                fileName = `${symbolName}.csv`;
            }
        }
        
        selectedSymbols = [{
            fileId: select.value,
            symbolName: symbolName,
            fileName: fileName
        }];
        primaryFileId = select.value;
        primaryFileName = fileName;
        instrumentRows = [];
    }
    
    if (selectedSymbols.length === 0) {
        alert('Please select at least one symbol');
        return;
    }
    
    console.log('📊 Selected symbols:', selectedSymbols);
    console.log('📁 Primary FileName:', primaryFileName);
    
    // Get selected protection preset
    const selectedPresetName = document.getElementById('protectionPresetSelect')?.value;
    let protectionPreset = null;
    if (selectedPresetName) {
        const presets = JSON.parse(userStorage.getItem('protectionSettings') || '[]');
        protectionPreset = presets.find(p => p.name === selectedPresetName);
        console.log('🛡️ Selected protection preset:', protectionPreset);
    }
    
    // Create files array for symbol switching
    const filesForSwitching = typeof selectedFilesArray !== 'undefined' && selectedFilesArray.length > 0
        ? selectedFilesArray
        : selectedSymbols.map(s => ({ id: s.fileId, name: s.fileName }));

    const instrumentsMap = instrumentRows.length > 0
        ? instrumentRows.reduce((acc, row) => {
            acc[row.ticker] = row;
            return acc;
        }, {})
        : null;

    // Collect form data
    const formData = {
        type: 'propfirm',
        simulationPresetId: (document.getElementById('simulationPresetId') && document.getElementById('simulationPresetId').value) || 'custom',
        simulationPresetLabel: (document.getElementById('simulationPresetLabel') && document.getElementById('simulationPresetLabel').value) || 'Custom configuration',
        projectName: document.getElementById('projectName').value,
        balance: parseFloat(document.getElementById('balance').value),
        symbols: selectedSymbols,
        ...(instrumentsMap ? { instruments: instrumentsMap } : {}),
        files: filesForSwitching, // For symbol switching on chart
        activeFileIndex: 0,
        fileId: primaryFileId, // Primary file for loading
        fileName: primaryFileName,
        startDate: document.getElementById('startDate').value,
        endDate: document.getElementById('endDate').value,
        minTradingDays: document.getElementById('disableMinDays').checked ? 0 : parseInt(document.getElementById('minTradingDays').value),
        profitTarget: parseFloat(document.getElementById('profitTarget').value),
        maxDailyLoss: {
            percent: parseFloat(document.getElementById('maxDailyLossPercent').value),
            dollar: parseFloat(document.getElementById('maxDailyLossDollar').value)
        },
        maxTotalLoss: {
            percent: parseFloat(document.getElementById('maxTotalLossPercent').value),
            dollar: parseFloat(document.getElementById('maxTotalLossDollar').value)
        },
        timezone: document.getElementById('timezone').value,
        sessionCloseTime: document.getElementById('sessionCloseTime').value,
        daylightSavingTime: document.getElementById('daylightSavingTime').value,
        barsTimeFormat: document.getElementById('barsTimeFormat').value,
        accountCurrency: (document.getElementById('accountCurrency') && document.getElementById('accountCurrency').value) || 'USD',
        leverage: parseInt(document.getElementById('leverageValue').value),
        forwardTestingOnly: document.getElementById('forwardTestingOnly').checked,
        allowBackNavigation: !document.getElementById('forwardTestingOnly').checked, // Inverse of forwardTestingOnly
        created: new Date().toISOString(),
        
        // Protection Preset
        protectionPreset: protectionPreset
    };
    
    formData.name = formData.projectName;
    formData.symbol = selectedSymbols.length === 1 ? selectedSymbols[0].symbolName : `${selectedSymbols.length} symbols`;

    let sessionId = null;
    try {
        const res = await fetch('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                name: String(formData.projectName || '').trim() || 'Prop Firm Session',
                session_type: 'propfirm',
                config: formData
            })
        });
        if (!res.ok) {
            const body = await res.json().catch(() => null);
            throw new Error((body && body.detail) ? String(body.detail) : 'Failed to create session');
        }
        const payload = await res.json();
        sessionId = payload && payload.session && payload.session.id ? payload.session.id : null;
    } catch (err) {
        alert('Failed to create session: ' + String(err && err.message ? err.message : err));
        return;
    }

    // Store as active session locally (compatibility with existing UI)
    try {
        userStorage.setItem('backtestingSession', JSON.stringify(formData));
        if (sessionId) {
            userStorage.setItem('active_trading_session_id', String(sessionId));
        }
    } catch (e) {}
    
    console.log('✅ Prop firm challenge created:', formData);
    console.log('📊 Redirecting to challenge overview, session:', sessionId);
    
    // Check if we're in an iframe
    const isInIframe = window.self !== window.top;
    const targetUrl = '/backtest/challenge?sessionId=' + encodeURIComponent(String(sessionId));
    
    if (isInIframe) {
        console.log('📱 Running in iframe, redirecting parent window to challenge overview');
        window.top.location.href = targetUrl;
    } else {
        console.log('🚀 Redirecting to challenge overview');
        window.location.href = targetUrl;
    }
}

console.log('✅ Prop firm script loaded');
