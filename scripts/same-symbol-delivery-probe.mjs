/**
 * Live check: does datasetMode=same-symbol get 4/4 panels delivering?
 * Soak blocker until this passes.
 */
import fs from 'fs';
import path from 'path';
import { bootConf01Session } from './lib/conf01-session.mjs';
import { loadConf05Indicators } from './lib/conf05-indicators.mjs';
import { HEAP_CYCLE_DATASET_MODE_SAME_SYMBOL } from './lib/heap-cycle-dataset-config.mjs';
import { clockOf } from './lib/clock.mjs';

const OUT = process.argv.find((a) => a.startsWith('--out='))?.split('=').slice(1).join('=')
  || `_evidence/manager-C/same-symbol-delivery-${Date.now()}.json`;

const log = (m) => console.log(`[same-symbol ${clockOf(new Date(), { seconds: true })}] ${m}`);

async function main() {
  const artifact = { signature: 'SAME-SYMBOL-DELIVERY-V1', startedAt: new Date().toISOString() };
  let session = null;
  try {
    log('booting CONF-01 same-symbol requireDeliveringPanels=4');
    session = await bootConf01Session({
      indicators: loadConf05Indicators().pairs,
      replaySpeed: 10,
      placeOrder: false,
      datasetMode: HEAP_CYCLE_DATASET_MODE_SAME_SYMBOL,
      requireDeliveringPanels: 4,
      label: 'same-symbol-delivery-probe',
    });
    artifact.conf01 = session.conf01;
    log(`boot ok: datasetMode=${session.conf01.datasetMode} advancing=${session.conf01.delivering?.advancingPanels} fileIds=${JSON.stringify(session.conf01.fileIds)}`);

    // Hold 45s and re-read playheads
    const read = async () => session.page.evaluate(() => {
      const out = [];
      const visit = (w, label) => {
        try {
          const c = w.chart; const rs = w.replaySystem || c?.replaySystem;
          if (!rs) return;
          out.push({
            realm: label, tf: c?.currentTimeframe ?? null,
            fileId: c?.currentFileId ?? c?.fileId ?? null,
            playhead: rs.currentIndex, masterLen: rs.fullRawData?.length ?? null,
            playing: !!rs.isPlaying,
          });
        } catch (_) {}
      };
      visit(window, 'host');
      for (let i = 0; i < window.frames.length; i++) { try { visit(window.frames[i], `frame${i}`); } catch (_) {} }
      return out;
    });
    const a = await read();
    await new Promise((r) => setTimeout(r, 45_000));
    const b = await read();
    artifact.sampleA = a;
    artifact.sampleB = b;
    artifact.deltas = a.map((p) => {
      const q = b.find((x) => x.realm === p.realm) || {};
      return {
        realm: p.realm, tf: p.tf, fileId: p.fileId,
        delta: (q.playhead ?? 0) - (p.playhead ?? 0),
        playheadA: p.playhead, playheadB: q.playhead,
        masterLen: q.masterLen ?? p.masterLen,
      };
    });
    const delivering = artifact.deltas.filter((d) => d.delta > 0).length;
    artifact.deliveringAfter45s = delivering;
    artifact.verdict = delivering >= 4 ? 'FOUR_OF_FOUR_DELIVERING' : `ONLY_${delivering}_OF_FOUR_DELIVERING`;
    log(`after 45s: ${artifact.verdict}`);
    for (const d of artifact.deltas) log(`  ${d.tf} file=${d.fileId} ${d.playheadA}->${d.playheadB} delta=${d.delta}`);
  } catch (e) {
    artifact.verdict = 'ERROR';
    artifact.error = String(e && e.stack ? e.stack : e).slice(0, 1500);
    log('ERROR ' + artifact.error.split('\n')[0]);
  } finally {
    try { if (session?.browser) await session.browser.close(); } catch (_) {}
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(artifact, null, 2));
    log(`artifact -> ${OUT}`);
  }
}

main();
