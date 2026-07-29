/**
 * Support-inbox WebSocket ping cleanup (V9 / V16).
 *
 * Default ON when unset. Kill-switch:
 *   window.__TALARIA_DISABLE_SUPPORT_WS_PING_CLEANUP_V1 = true
 *
 * Not an idle-CPU claim — clears a permanent post-close ping leak / log spam.
 */

export const SUPPORT_WS_PING_CLEANUP_SWITCH = '__TALARIA_DISABLE_SUPPORT_WS_PING_CLEANUP_V1';

/** FLAG-01: ABSENT ⇒ fix ON. Truthiness disable; read per call (FLAG-02). */
export function supportWsPingCleanupV1Enabled(root = typeof window !== 'undefined' ? window : undefined) {
  try {
    return !(root && root[SUPPORT_WS_PING_CLEANUP_SWITCH]);
  } catch (_e) {
    return true;
  }
}

/**
 * One ping tick. When cleanup is enabled and the socket is not OPEN, clearPing
 * is invoked and send is skipped.
 * @returns {'sent'|'cleared'|'legacy-sent'|'legacy-failed'|'skipped'}
 */
export function supportWsPingTick(ws, clearPing, root = typeof window !== 'undefined' ? window : undefined) {
  const OPEN = typeof WebSocket !== 'undefined' ? WebSocket.OPEN : 1;
  if (!supportWsPingCleanupV1Enabled(root)) {
    try {
      ws.send(JSON.stringify({ type: 'ping' }));
      return 'legacy-sent';
    } catch (_e) {
      return 'legacy-failed';
    }
  }
  if (!ws || ws.readyState !== OPEN) {
    try { clearPing(); } catch (_e) { /* ignore */ }
    return 'cleared';
  }
  try {
    ws.send(JSON.stringify({ type: 'ping' }));
    return 'sent';
  } catch (_e) {
    return 'skipped';
  }
}
