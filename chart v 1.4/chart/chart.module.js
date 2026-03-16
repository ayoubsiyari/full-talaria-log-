export class TradingChart {
    constructor(containerId, options = {}) {
        this.containerId = containerId;
        this.apiUrl = options.apiUrl || '/api';
        this.onFileLoad = options.onFileLoad || null;
        this.onError = options.onError || null;
        
        this.initializeChart();
    }
    
    initializeChart() {
        const container = document.getElementById(this.containerId);
        if (!container) {
            console.error(`Container #${this.containerId} not found`);
            return;
        }
        
        // Insert chart HTML structure
        container.innerHTML = `
            <div class="chart-wrapper" id="chartWrapper">
                <canvas id="chartCanvas-${this.containerId}"></canvas>
                <svg id="drawingSvg-${this.containerId}"></svg>
                <div class="crosshair-vertical"></div>
                <div class="crosshair-horizontal"></div>
                <div class="price-label"></div>
                <div class="time-label"></div>
                <div class="ohlc-info">
                    <span class="ohlc-item"><strong>O:</strong> <span id="open">-</span></span>
                    <span class="ohlc-item"><strong>H:</strong> <span id="high">-</span></span>
                    <span class="ohlc-item"><strong>L:</strong> <span id="low">-</span></span>
                    <span class="ohlc-item"><strong>C:</strong> <span id="close">-</span></span>
                    <span class="ohlc-item"><strong>Vol:</strong> <span id="volume">-</span></span>
                </div>
            </div>
        `;
        
        // Initialize the Chart class (your existing code)
        // You'll need to adapt your Chart class to accept container IDs
    }
    
    async loadFile(fileId) {
        try {
            const response = await fetch(`${this.apiUrl}/file/${fileId}`);
            const result = await response.json();
            
            if (result.data) {
                this.parseCSV(result.data);
                if (this.onFileLoad) this.onFileLoad(result);
            }
        } catch (error) {
            console.error('Failed to load file:', error);
            if (this.onError) this.onError(error);
        }
    }
    
    async uploadFile(file) {
        const formData = new FormData();
        formData.append('csvFile', file);
        
        try {
            const response = await fetch(`${this.apiUrl}/upload`, {
                method: 'POST',
                body: formData
            });
            
            return await response.json();
        } catch (error) {
            console.error('Upload failed:', error);
            throw error;
        }
    }
    
    async getFiles() {
        try {
            const response = await fetch(`${this.apiUrl}/files`);
            return await response.json();
        } catch (error) {
            console.error('Failed to fetch files:', error);
            throw error;
        }
    }
    
    // Add other methods as needed...
}