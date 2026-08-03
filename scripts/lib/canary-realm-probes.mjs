/**
 * The three page-side probes the ORDER-01B read-back canary runs inside the
 * browser, lifted out of `page.evaluate` closures so they can be executed
 * without a browser.
 *
 * Why they are out here at all: the b126 canary shipped an artifact whose
 * `observedPlaying: 3` was a parked realm, and the fix for it — a runway gate, a
 * product-path-first start, and a sliced window — was logic that had never once
 * executed when it was committed. On a box where a Chrome-launching run waits its
 * turn behind a ninety-minute measurement, "we will find out when it runs" costs
 * an hour per typo. `canary-realm-probes.selftest.mjs` drives all three against a
 * fake four-realm world, including a realm parked at `fromEnd: 0` and a realm
 * whose instance `play()` is inert, so the paths that only appear on a defective
 * page are exercised on every commit.
 *
 * CONSTRAINT, and it is the reason for the duplication below: puppeteer ships
 * these to the page by `toString()`, so each one must be self-contained. A shared
 * realm-walk helper hoisted to module scope would be `undefined` inside the page
 * — which fails at the point of use, in a browser, in the run that was waiting.
 * The repetition is load-bearing, not laziness.
 */

/**
 * Every realm's bar count and whether it still has a fetch in flight.
 * @returns {{realm: string, hasReplay: boolean, rawBars: number|null, panLoading: boolean}[]}
 */
export function probeRealmCensus() {
  const realms = [{ w: window, name: 'top' }];
  for (const f of [...document.querySelectorAll('iframe')].slice(0, 4)) {
    try { realms.push({ w: f.contentWindow, name: f.id || 'panel' }); } catch (_e) { /* cross-origin */ }
  }
  return realms.map((r) => {
    try {
      const ch = r.w.chart;
      const rs = ch && ch.replaySystem;
      return {
        realm: r.name,
        hasReplay: !!rs,
        rawBars: rs && Array.isArray(rs.fullRawData)
          ? rs.fullRawData.length
          : (Array.isArray(ch && ch.data) ? ch.data.length : null),
        panLoading: !!(ch && ch._panLoading),
      };
    } catch (e) {
      return { realm: r.name, hasReplay: false, rawBars: null, panLoading: false, why: String(e && e.message) };
    }
  });
}

/**
 * Where each realm was left standing after arming. A realm parked on its last
 * loaded bar has nowhere to step to, and its zero says nothing about the meter.
 */
export function probeArmedPositions() {
  const realms = [{ w: window, name: 'top' }];
  for (const f of [...document.querySelectorAll('iframe')].slice(0, 4)) {
    try { realms.push({ w: f.contentWindow, name: f.id || 'panel' }); } catch (_e) { /* cross-origin */ }
  }
  return realms.map((r) => {
    try {
      const rs = r.w.chart && r.w.chart.replaySystem;
      if (!rs) return { realm: r.name, reason: 'no replaySystem' };
      const raw = Array.isArray(rs.fullRawData) ? rs.fullRawData.length : null;
      return {
        realm: r.name,
        currentIndex: rs.currentIndex ?? null,
        rawBars: raw,
        fromEnd: raw !== null && rs.currentIndex != null ? raw - 1 - rs.currentIndex : null,
        playing: !!rs.isPlaying,
        /**
         * The rollback floor, and the field that decides whether a parked realm
         * can be rescued at all. `seekTo` clamps to `Math.max(sessionStartIndex,…)`
         * (replay-system.js:8962), and in the backtest path a session whose start
         * time is later than every loaded bar begins on the LAST bar with the
         * floor set to it (:4297, :4301). Such a realm can neither advance nor be
         * rewound, and from outside it looks exactly like one that refuses to play.
         */
        sessionStartIndex: rs.sessionStartIndex ?? null,
        floorPinnedToEnd: raw !== null && rs.sessionStartIndex != null && rs.sessionStartIndex >= raw - 1,
      };
    } catch (e) { return { realm: r.name, reason: String(e && e.message) }; }
  });
}

/**
 * Put the backtest session start inside the loaded data, in every realm.
 *
 * `enterReplayMode` places the playhead at the first bar at or after the session
 * start (replay-system.js:4282). When no loaded bar is that late it falls back to
 * `startIdx = rd.length - 1` — silently, with no state recorded — so the playhead
 * lands on the last loaded bar and a forward step has nowhere to go. That is the
 * `index = len - 1` signature in the b126 re-run's play log, reproduced on every
 * realm and on every reload, and it is why a seek does not survive: the next
 * `enterReplayMode` re-pins to the tail.
 *
 * So the session start is derived from the data each realm actually holds rather
 * than from a date chosen before the data was known. `fractionIn` of the way
 * through leaves the rest as runway.
 */
export function seedSessionStartFromLoadedData({ fractionIn }) {
  const realms = [{ w: window, name: 'top' }];
  for (const f of [...document.querySelectorAll('iframe')].slice(0, 4)) {
    try { realms.push({ w: f.contentWindow, name: f.id || 'panel' }); } catch (_e) { /* cross-origin */ }
  }
  return realms.map((r) => {
    try {
      const ch = r.w.chart;
      const rs = ch && ch.replaySystem;
      const bars = (rs && Array.isArray(rs.fullRawData) && rs.fullRawData.length)
        ? rs.fullRawData
        : (Array.isArray(ch && ch.rawData) ? ch.rawData : null);
      if (!ch || !bars || !bars.length) return { realm: r.name, state: 'NO_DATA' };
      const at = Math.min(Math.max(0, Math.floor(bars.length * fractionIn)), bars.length - 1);
      const t = bars[at] && Number(bars[at].t);
      if (!Number.isFinite(t)) return { realm: r.name, state: 'NO_TIMESTAMP', index: at };
      const startDate = new Date(t).toISOString();
      // Both stores, because enterReplayMode prefers chart.backtestingSession and
      // falls back to userStorage; leaving the stale one in place would let the
      // fallback win on any realm whose chart object is rebuilt.
      ch.backtestingSession = { ...(ch.backtestingSession || {}), startDate };
      try {
        if (r.w.userStorage && typeof r.w.userStorage.setItem === 'function') {
          const prior = JSON.parse(r.w.userStorage.getItem('backtestingSession') || '{}');
          r.w.userStorage.setItem('backtestingSession', JSON.stringify({ ...prior, startDate }));
        }
      } catch (_e) { /* the chart field is the one enterReplayMode reads first */ }
      return {
        realm: r.name,
        state: 'SEEDED',
        bars: bars.length,
        index: at,
        runwayBars: bars.length - 1 - at,
        startDate,
      };
    } catch (e) { return { realm: r.name, state: 'SEED_THREW', why: String(e && e.message) }; }
  });
}

/**
 * Give every realm runway, then start the ones that are not playing.
 *
 * Order matters and is the whole point: rewind first, ask the product's own
 * `play()` second, fall back to the prototype only third and record that it
 * happened. A realm started by the fallback still yields a valid rate — and the
 * fallback is itself the shell-override defect, so it is reported rather than
 * quietly enabling the measurement.
 */
export async function prepareRealmsForWindow({ runway, speed, step }) {
  const sleepIn = (ms) => new Promise((r) => setTimeout(r, ms));
  const realms = [{ w: window, name: 'top' }];
  for (const f of [...document.querySelectorAll('iframe')].slice(0, 4)) {
    try { realms.push({ w: f.contentWindow, name: f.id || 'panel' }); } catch (_e) { /* cross-origin */ }
  }
  const out = [];
  for (const r of realms) {
    const rs = r.w.chart && r.w.chart.replaySystem;
    if (!rs) { out.push({ realm: r.name, state: 'NO_REPLAY_SYSTEM' }); continue; }
    const len = Array.isArray(rs.fullRawData) ? rs.fullRawData.length : null;
    const idx = rs.currentIndex ?? null;
    const before = {
      rawBars: len,
      currentIndex: idx,
      fromEnd: len != null && idx != null ? len - 1 - idx : null,
      playing: !!rs.isPlaying,
      sessionStartIndex: rs.sessionStartIndex ?? null,
    };
    let seekedTo = null;
    let seekThrew = null;
    let seekHeld = null;
    let runwayBlocked = null;
    if (before.fromEnd != null && before.fromEnd < runway && typeof rs.seekTo === 'function') {
      // The product's own seek, not a hand-written index assignment: a realm
      // rewound by poking currentIndex would carry stale animation state.
      seekedTo = Math.max(0, len - 1 - runway);
      /**
       * The floor is checked BEFORE asking, because `seekTo` clamps silently: a
       * seek below `sessionStartIndex` returns having moved nothing, and a gate
       * that only reads `fromEnd` afterwards reports "the rewind did not work"
       * without saying that it could never have worked. The b126 re-run issued
       * `seekTo(1760)` to four realms and all four stayed at index 1880.
       */
      if (before.sessionStartIndex != null && before.sessionStartIndex > seekedTo) {
        runwayBlocked = `RUNWAY_BLOCKED_BY_SESSION_FLOOR: sessionStartIndex ${before.sessionStartIndex} > target ${seekedTo}`;
      }
      try { rs.seekTo(seekedTo); } catch (e) { seekThrew = String(e && e.message); }
      await sleepIn(400);
      seekHeld = (rs.currentIndex ?? null) === seekedTo;
    }
    let startedVia = before.playing ? 'already-playing' : null;
    if (!rs.isPlaying) {
      try { rs.play(); } catch (_e) { /* the silent refusal is the subject */ }
      await sleepIn(800);
      if (rs.isPlaying) startedVia = 'instance-play';
      else {
        const proto = Object.getPrototypeOf(rs);
        if (proto && typeof proto.play === 'function') {
          try { proto.play.call(rs); } catch (_e) { /* ignore */ }
          await sleepIn(800);
          startedVia = rs.isPlaying ? 'prototype-fallback' : 'would-not-start';
        } else startedVia = 'would-not-start';
      }
    }
    const lenAfter = Array.isArray(rs.fullRawData) ? rs.fullRawData.length : null;
    const idxAfter = rs.currentIndex ?? null;
    out.push({
      realm: r.name,
      state: seekThrew ? 'SEEK_THREW' : 'PREPARED',
      why: seekThrew || runwayBlocked || undefined,
      before,
      seekedTo,
      seekHeld,
      runwayBlocked,
      startedVia,
      after: {
        rawBars: lenAfter,
        currentIndex: idxAfter,
        fromEnd: lenAfter != null && idxAfter != null ? lenAfter - 1 - idxAfter : null,
        playing: !!rs.isPlaying,
        stepSeconds: typeof rs.getStepSeconds === 'function' ? rs.getStepSeconds() : null,
        sessionStartIndex: rs.sessionStartIndex ?? null,
      },
      asked: { speed, step },
    });
  }
  return out;
}

/**
 * Watch the playhead directly, in slices, for the whole window.
 *
 * The meter is the thing under test, so it cannot also be the evidence that
 * replay was moving: a zero from a stopped replay and a zero from a broken meter
 * are different findings and only the playhead separates them. Slices exist
 * because one delta cannot tell a realm that ran the window at half rate from one
 * that ran ten seconds and parked.
 */
export async function sampleRealmsOverWindow({ sampleMs, sliceMs }) {
  const sleepIn = (ms) => new Promise((r) => setTimeout(r, ms));
  const realms = [{ w: window, name: 'top' }];
  for (const f of [...document.querySelectorAll('iframe')].slice(0, 4)) {
    try { realms.push({ w: f.contentWindow, name: f.id || 'panel' }); } catch (_e) { /* cross-origin */ }
  }
  const head = (w) => {
    try {
      const rs = w.chart && w.chart.replaySystem;
      if (!rs) return null;
      const t = rs.currentTime != null ? rs.currentTime : rs.replayTimestamp;
      return {
        t: Number(t),
        playing: !!rs.isPlaying,
        active: !!rs.isActive,
        /**
         * Carried per slice because the series LENGTH moves during a run and that
         * was invisible in the artifact: the b126 re-run settled with 4000 bars in
         * every realm and was down to 1881 in all four by the time the window
         * opened. A shrinking series with the playhead on its last bar is a
         * different finding from a stalled meter, and the numbers have to be in
         * the file rather than inferred from console output.
         */
        rawBars: Array.isArray(rs.fullRawData) ? rs.fullRawData.length : null,
        currentIndex: rs.currentIndex ?? null,
      };
    } catch (_e) { return null; }
  };
  /** Why a realm is not playing, asked of the engine rather than guessed. */
  const why = (w) => {
    try {
      const rs = w.chart && w.chart.replaySystem;
      if (!rs) return { reason: 'no replaySystem' };
      const raw = Array.isArray(rs.fullRawData) ? rs.fullRawData.length : null;
      return {
        active: !!rs.isActive,
        mode: typeof rs.getPlaybackMode === 'function' ? rs.getPlaybackMode() : null,
        currentIndex: rs.currentIndex ?? null,
        rawBars: raw,
        atLastBar: typeof rs._isAtLastLoadedBar === 'function' ? rs._isAtLastLoadedBar() : null,
        noOpAtEnd: typeof rs._playWouldBeNoOpAtSessionEnd === 'function'
          ? rs._playWouldBeNoOpAtSessionEnd() : null,
        subBarMode: typeof rs._isSubBarStepMode === 'function' ? rs._isSubBarStepMode() : null,
        edgeWait: rs._replayForwardEdgeWait ?? null,
        hasMoreRight: !!(w.chart && w.chart._serverCursors && w.chart._serverCursors.hasMoreRight),
        windowBlocked: !!w.__talariaChartWindowBlocked,
        playStarting: !!rs.isPlayStarting,
        hidden: typeof rs._isReplayPageHidden === 'function' ? rs._isReplayPageHidden() : null,
        timer: !!rs._nextCandleTimer,
        interval: !!rs.playInterval,
        edgeWaits: rs._loadedEdgeWaits ?? null,
        probeRetries: rs.edgeProbeRetryCount ?? null,
        panLoading: !!(w.chart && w.chart._panLoading),
        fileId: (w.chart && w.chart.currentFileId) ?? null,
        sessionEnd: typeof rs._getBacktestSessionEndMs === 'function'
          ? rs._getBacktestSessionEndMs() : null,
        playheadAtSessionEnd: (() => {
          try {
            const e = rs._getBacktestSessionEndMs();
            return e == null ? null : !!rs._playheadReachedSessionEnd(e);
          } catch (_e) { return null; }
        })(),
      };
    } catch (e) { return { reason: String(e && e.message) }; }
  };
  const first = realms.map((r) => ({ name: r.name, h: head(r.w) }));
  const t0 = performance.now();
  const slices = [];
  const sliceCount = Math.max(1, Math.round(sampleMs / sliceMs));
  let prevHeads = realms.map((r) => head(r.w));
  let prevAt = performance.now();
  for (let s = 0; s < sliceCount; s += 1) {
    await sleepIn(sliceMs);
    const now = performance.now();
    const wall = (now - prevAt) / 1000;
    const heads = realms.map((r) => head(r.w));
    slices.push({
      sliceSeconds: +wall.toFixed(2),
      perRealm: realms.map((r, i) => {
        const a = prevHeads[i];
        const b = heads[i];
        const adv = a && b && Number.isFinite(a.t) && Number.isFinite(b.t) ? (b.t - a.t) / 1000 : null;
        return {
          realm: r.name,
          playing: b ? b.playing : null,
          marketSecAdvanced: adv,
          marketPerWall: adv === null ? null : +(adv / wall).toFixed(2),
          rawBars: b ? b.rawBars : null,
          currentIndex: b ? b.currentIndex : null,
          barsLost: a && b && a.rawBars != null && b.rawBars != null ? a.rawBars - b.rawBars : null,
        };
      }),
    });
    prevHeads = heads;
    prevAt = now;
  }
  const wallSec = (performance.now() - t0) / 1000;
  const rows = realms.map((r, i) => {
    const a = first[i].h;
    const b = head(r.w);
    const advanced = a && b && Number.isFinite(a.t) && Number.isFinite(b.t) ? (b.t - a.t) / 1000 : null;
    const moved = advanced !== null && advanced > 0;
    return {
      realm: r.name,
      playingBefore: a ? a.playing : null,
      playingAfter: b ? b.playing : null,
      marketSecAdvanced: advanced,
      marketPerWall: advanced === null ? null : +(advanced / wallSec).toFixed(2),
      // Also for realms that moved and then stopped: the interesting case is a
      // realm that ran to the loaded edge and gave up there.
      diagnosis: (moved && b && b.playing) ? null : why(r.w),
    };
  });
  return { windowSeconds: +wallSec.toFixed(2), sliceSeconds: +(sliceMs / 1000).toFixed(2), rows, slices };
}
