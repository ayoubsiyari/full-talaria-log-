/**
 * Generic prop-style simulation presets (parameters only — not affiliated with any third-party firm).
 * Used by propfirm-backtest.html to pre-fill challenge rules.
 */
(function (global) {
    var PROPFIRM_SIMULATION_PRESETS = [
        {
            id: 'eval_standard',
            icon: '🏆',
            title: 'Evaluation — Standard',
            description: '10% profit target, 5% max daily loss, 10% max total loss. Common evaluation-style mix.',
            rules: {
                balance: 100000,
                profitTarget: 10,
                maxDailyLossPercent: 5,
                maxTotalLossPercent: 10,
                minTradingDays: 4,
                disableMinDays: false,
                leverage: 100
            }
        },
        {
            id: 'eval_strict',
            icon: '⚡',
            title: 'Evaluation — Strict',
            description: 'Tighter drawdowns: 8% target, 4% daily, 8% total. Minimum five trading days.',
            rules: {
                balance: 100000,
                profitTarget: 8,
                maxDailyLossPercent: 4,
                maxTotalLossPercent: 8,
                minTradingDays: 5,
                disableMinDays: false,
                leverage: 100
            }
        },
        {
            id: 'tight_daily_guard',
            icon: '🎯',
            title: 'Tight daily guard',
            description: 'Same 10% target with a stricter daily loss cap and wider trailing room.',
            rules: {
                balance: 100000,
                profitTarget: 10,
                maxDailyLossPercent: 3,
                maxTotalLossPercent: 12,
                minTradingDays: 3,
                disableMinDays: false,
                leverage: 50
            }
        },
        {
            id: 'starter_10k',
            icon: '💼',
            title: 'Starter account (10K)',
            description: 'Smaller balance template with standard percentage rules.',
            rules: {
                balance: 10000,
                profitTarget: 10,
                maxDailyLossPercent: 5,
                maxTotalLossPercent: 10,
                minTradingDays: 4,
                disableMinDays: false,
                leverage: 100
            }
        },
        {
            id: 'scaled_50k',
            icon: '📈',
            title: 'Mid-size (50K)',
            description: '50K balance with proportional limits for practice at a larger notional.',
            rules: {
                balance: 50000,
                profitTarget: 10,
                maxDailyLossPercent: 5,
                maxTotalLossPercent: 10,
                minTradingDays: 4,
                disableMinDays: false,
                leverage: 100
            }
        },
        {
            id: 'custom',
            icon: '⚙️',
            title: 'Custom configuration',
            description: 'Do not change fields automatically. Adjust every value below to match your plan.',
            rules: null
        }
    ];

    function getPropfirmPresetById(id) {
        var i;
        for (i = 0; i < PROPFIRM_SIMULATION_PRESETS.length; i += 1) {
            if (PROPFIRM_SIMULATION_PRESETS[i].id === id) {
                return PROPFIRM_SIMULATION_PRESETS[i];
            }
        }
        return null;
    }

    global.PROPFIRM_SIMULATION_PRESETS = PROPFIRM_SIMULATION_PRESETS;
    global.getPropfirmPresetById = getPropfirmPresetById;
})(typeof window !== 'undefined' ? window : globalThis);
