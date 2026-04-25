import React, { useEffect, useRef, useState } from 'react';
import './TradingChart.css'; // Import your existing styles

const TradingChart = ({ 
    apiUrl = 'http://localhost:8000/api',
    height = '600px',
    onFileLoad,
    onError 
}) => {
    const chartContainerRef = useRef(null);
    const chartInstanceRef = useRef(null);
    const [files, setFiles] = useState([]);
    const [selectedFile, setSelectedFile] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // Load chart script dynamically
        const script = document.createElement('script');
        script.src = '/chart.js'; // Adjust path as needed
        script.async = true;
        document.body.appendChild(script);

        script.onload = () => {
            // Initialize chart
            if (window.Chart && chartContainerRef.current) {
                chartInstanceRef.current = new window.Chart(apiUrl);
                loadFiles();
            }
        };

        return () => {
            document.body.removeChild(script);
        };
    }, [apiUrl]);

    const loadFiles = async () => {
        try {
            const response = await fetch(`${apiUrl}/files`);
            const data = await response.json();
            setFiles(data.files || []);
        } catch (error) {
            console.error('Failed to load files:', error);
            if (onError) onError(error);
        }
    };

    const handleFileSelect = async (e) => {
        const fileId = e.target.value;
        setSelectedFile(fileId);
        
        if (fileId && chartInstanceRef.current) {
            setLoading(true);
            try {
                await chartInstanceRef.current.loadFileFromServer(fileId);
                if (onFileLoad) onFileLoad(fileId);
            } catch (error) {
                if (onError) onError(error);
            } finally {
                setLoading(false);
            }
        }
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setLoading(true);
        const formData = new FormData();
        formData.append('csvFile', file);

        try {
            const response = await fetch(`${apiUrl}/upload`, {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (result.success) {
                await loadFiles();
                setSelectedFile(result.file.id.toString());
                if (chartInstanceRef.current) {
                    await chartInstanceRef.current.loadFileFromServer(result.file.id);
                }
            }
        } catch (error) {
            console.error('Upload failed:', error);
            if (onError) onError(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="trading-chart-container" style={{ height }}>
            {/* Toolbar */}
            <div className="chart-toolbar">
                <div className="toolbar-left">
                    <h3>📈 Trading Chart</h3>
                    <select 
                        value={selectedFile} 
                        onChange={handleFileSelect}
                        disabled={loading}
                        className="file-selector"
                    >
                        <option value="">-- Select Chart --</option>
                        {files.map(file => (
                            <option key={file.id} value={file.id}>
                                {file.original_name} ({file.row_count} candles)
                            </option>
                        ))}
                    </select>
                </div>
                
                <div className="toolbar-right">
                    <label className="upload-btn">
                        📂 Upload CSV
                        <input 
                            type="file" 
                            accept=".csv"
                            onChange={handleFileUpload}
                            disabled={loading}
                            style={{ display: 'none' }}
                        />
                    </label>
                </div>
            </div>

            {/* Chart Container */}
            <div 
                ref={chartContainerRef} 
                id="chartCanvas" 
                className="chart-canvas-wrapper"
            />

            {loading && (
                <div className="loading-overlay">
                    <div className="spinner">Loading...</div>
                </div>
            )}
        </div>
    );
};

export default TradingChart;