/**
 * Milestone 7–8 scaffolding (What-If, bar-by-bar trade replay, management presets).
 * Heavy UI stays in the main app; this module defines stable hooks for future work.
 */
(function (global) {
    const api = {
        /**
         * What-if replay over stored R arrays (milestone §7): adjust TP levels in R, walk highs/lows.
         * @returns {{ blendedSimR: number|null, legs: Array<{ tag: string, rr: number }> }}
         */
        whatIfReplayMultiTP(opts) {
            const bars = opts?.bar_high_r;
            if (!Array.isArray(bars) || !bars.length) {
                return { blendedSimR: null, legs: [], note: 'no bar arrays' };
            }
            return {
                blendedSimR: null,
                legs: [],
                note: 'Implement UI + engine binding in a future milestone; bar arrays are on archived trades.'
            };
        },

        /**
         * What-if trailing using bar_high_r / bar_low_r (milestone §7).
         */
        whatIfReplayTrailing(opts) {
            return { simulatedExitR: null, note: 'stub — connect trail_distance_r and bar arrays from closed trade.' };
        },

        /**
         * Bar-by-bar replay driver (milestone §8): feed one bar index, receive snapshot for display.
         */
        tradeReplayStep(state, barIndex) {
            return {
                barIndex,
                beTriggered: state?.beTriggered ?? false,
                trailSl: state?.trailSl ?? null,
                note: 'stub — pass archived bar_close_r and management flags from journal.'
            };
        },

        /**
         * Named management presets (milestone §8).
         */
        listManagementPresets() {
            return [];
        },

        saveManagementPreset(name, profile) {
            return { ok: false, reason: 'persistence not wired; use OrderManager.applyProtectionSettings patterns.' };
        }
    };

    global.TalariaMilestoneAdvanced = api;
})(typeof window !== 'undefined' ? window : globalThis);
