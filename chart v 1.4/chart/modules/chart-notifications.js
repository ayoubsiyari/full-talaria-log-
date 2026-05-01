/**
 * Chart Notifications Module
 * Handles toast notifications and alerts
 * 
 * This is a COMPLETE, WORKING example module showing the pattern
 * Extract from chart.js lines that contain showNotification() method
 */

(function() {
    'use strict';
    
    /**
     * Initialize notifications system
     * Called from Chart.init()
     */
    Chart.prototype.initNotifications = function() {
        console.log('  ↳ Notifications module initialized');
        // No setup needed - notifications are created on-demand
    };
    
    /**
     * Show a toast notification
     * @param {string} message - Message to display
     * @param {number} duration - Duration in ms (default: 3000)
     */
    Chart.prototype.showNotification = function(message, duration = 3000) {
        // Create notification element
        const notification = d3.select('body').append('div')
            .attr('class', 'chart-notification')
            .style('position', 'fixed')
            .style('top', '20px')
            .style('right', '20px')
            .style('background', 'rgba(19, 23, 34, 0.95)')
            .style('color', '#d1d5db')
            .style('padding', '12px 20px')
            .style('border-radius', '6px')
            .style('font-size', '14px')
            .style('box-shadow', '0 4px 12px rgba(0,0,0,0.4)')
            .style('z-index', '10000')
            .style('border', '1px solid #2a2e39')
            .style('opacity', '0')
            .style('transform', 'translateY(-10px)')
            .style('transition', 'all 0.3s ease')
            .text(message);
        
        // Animate in
        setTimeout(() => {
            notification
                .style('opacity', '1')
                .style('transform', 'translateY(0)');
        }, 10);
        
        // Remove after duration
        setTimeout(() => {
            notification
                .style('opacity', '0')
                .style('transform', 'translateY(-10px)');
            setTimeout(() => notification.remove(), 300);
        }, duration);
    };
    
    /**
     * Show error notification (red)
     * @param {string} message - Error message
     */
    Chart.prototype.showError = function(message) {
        const notification = d3.select('body').append('div')
            .attr('class', 'chart-notification chart-notification-error')
            .style('position', 'fixed')
            .style('top', '20px')
            .style('right', '20px')
            .style('background', 'rgba(242, 54, 69, 0.95)') // Red background
            .style('color', '#ffffff')
            .style('padding', '12px 20px')
            .style('border-radius', '6px')
            .style('font-size', '14px')
            .style('box-shadow', '0 4px 12px rgba(0,0,0,0.4)')
            .style('z-index', '10000')
            .style('border', '1px solid #d32f2f')
            .style('opacity', '0')
            .style('transform', 'translateY(-10px)')
            .style('transition', 'all 0.3s ease')
            .text('❌ ' + message);
        
        setTimeout(() => {
            notification
                .style('opacity', '1')
                .style('transform', 'translateY(0)');
        }, 10);
        
        setTimeout(() => {
            notification
                .style('opacity', '0')
                .style('transform', 'translateY(-10px)');
            setTimeout(() => notification.remove(), 300);
        }, 4000); // Errors stay longer
    };
    
    /**
     * Show success notification (green)
     * @param {string} message - Success message
     */
    Chart.prototype.showSuccess = function(message) {
        const notification = d3.select('body').append('div')
            .attr('class', 'chart-notification chart-notification-success')
            .style('position', 'fixed')
            .style('top', '20px')
            .style('right', '20px')
            .style('background', 'rgba(8, 153, 129, 0.95)') // Green background
            .style('color', '#ffffff')
            .style('padding', '12px 20px')
            .style('border-radius', '6px')
            .style('font-size', '14px')
            .style('box-shadow', '0 4px 12px rgba(0,0,0,0.4)')
            .style('z-index', '10000')
            .style('border', '1px solid #00796b')
            .style('opacity', '0')
            .style('transform', 'translateY(-10px)')
            .style('transition', 'all 0.3s ease')
            .text('✓ ' + message);
        
        setTimeout(() => {
            notification
                .style('opacity', '1')
                .style('transform', 'translateY(0)');
        }, 10);
        
        setTimeout(() => {
            notification
                .style('opacity', '0')
                .style('transform', 'translateY(-10px)');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    };
    
    console.log('📄 chart-notifications.js loaded');
    
})();
