/**
 * Chart Notifications Module
 * Optional helpers; when __TalariaToastStack is present, toasts stack above the time axis like chart.js.
 */

(function() {
    'use strict';

    const TOAST_SURFACE = {
        background: 'rgba(42, 46, 57, 0.95)',
        border: '1px solid #363a45',
        borderRadius: '4px',
        padding: '7px 11px',
        fontSize: '11px',
        lineHeight: '14px',
        color: '#ffffff',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35)',
        zIndex: '10000',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        fontWeight: '600'
    };

    function applyToastStyles(selection, borderLeft) {
        selection
            .attr('class', 'chart-notification chart-toast-tooltip')
            .style('position', 'fixed')
            .style('top', '20px')
            .style('right', '20px')
            .style('background', TOAST_SURFACE.background)
            .style('color', TOAST_SURFACE.color)
            .style('padding', TOAST_SURFACE.padding)
            .style('border-radius', TOAST_SURFACE.borderRadius)
            .style('font-size', TOAST_SURFACE.fontSize)
            .style('line-height', TOAST_SURFACE.lineHeight)
            .style('font-weight', TOAST_SURFACE.fontWeight)
            .style('font-family', TOAST_SURFACE.fontFamily)
            .style('box-shadow', TOAST_SURFACE.boxShadow)
            .style('z-index', TOAST_SURFACE.zIndex)
            .style('border', TOAST_SURFACE.border)
            .style('border-left', borderLeft || '3px solid #3b82f6')
            .style('max-width', '340px')
            .style('opacity', '0')
            .style('transform', 'translateY(-10px)')
            .style('transition', 'all 0.3s ease')
            .style('box-sizing', 'border-box');
    }

    Chart.prototype.initNotifications = function() {
        console.log('  ↳ Notifications module initialized');
    };

    Chart.prototype.showNotification = function(message, duration = 3000) {
        if (typeof window !== 'undefined' && window.__TalariaToastStack) {
            window.__TalariaToastStack.show(String(message != null ? message : ''), {
                type: 'info',
                duration: duration,
            });
            return;
        }
        const notification = d3.select('body').append('div');
        applyToastStyles(notification, '3px solid #3b82f6');
        notification.text(message);

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
        }, duration);
    };

    Chart.prototype.showError = function(message) {
        if (typeof window !== 'undefined' && window.__TalariaToastStack) {
            window.__TalariaToastStack.show('❌ ' + String(message != null ? message : ''), {
                type: 'error',
                duration: 4000,
            });
            return;
        }
        const notification = d3.select('body').append('div');
        applyToastStyles(notification, '3px solid #ef4444');
        notification.text('❌ ' + message);

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
        }, 4000);
    };

    Chart.prototype.showSuccess = function(message) {
        if (typeof window !== 'undefined' && window.__TalariaToastStack) {
            window.__TalariaToastStack.show('✓ ' + String(message != null ? message : ''), {
                type: 'success',
                duration: 3000,
            });
            return;
        }
        const notification = d3.select('body').append('div');
        applyToastStyles(notification, '3px solid #22c55e');
        notification.text('✓ ' + message);

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
