/**
 * Chart Notifications Module
 * Optional helpers; when __TalariaToastStack is present, toasts stack above the time axis like chart.js.
 */

(function() {
    'use strict';

    const TOAST_SURFACE = {
        background: 'var(--surface, #0a0a0b)',
        border: '1px solid var(--line, rgba(162,161,205,0.22))',
        borderRadius: '6px',
        padding: '8px 12px',
        fontSize: '12px',
        lineHeight: '1.35',
        color: 'var(--text, rgba(244,244,245,0.92))',
        boxShadow: 'none',
        zIndex: '10000',
        fontFamily: 'var(--font-ui), "Helvetica Now", "Helvetica Neue", Helvetica, Arial, sans-serif',
        fontWeight: '500'
    };

    function applyToastStyles(selection, borderLeft) {
        selection
            .attr('class', 'chart-notification chart-toast-tooltip tlr-toast-stack-msg')
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
            .style('filter', 'none')
            .style('z-index', TOAST_SURFACE.zIndex)
            .style('border', TOAST_SURFACE.border)
            .style('border-left', borderLeft || '2px solid var(--accent, #3090FF)')
            .style('max-width', '360px')
            .style('opacity', '0')
            .style('transform', 'translateY(-6px)')
            .style('transition', 'opacity 0.16s ease, transform 0.16s ease')
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
