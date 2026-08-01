#!/usr/bin/env bash
# Does a properly-powered flag A/B fit before the 04:00 window opens?
#
# Answering from measured per-window cost rather than an estimate, because the estimate is the thing that
# would make me overrun into someone else's scheduled cut. The falsifier sweep is the right reference:
# same harness, same login, same seek, same 120 s measurement window.
set -uo pipefail
cd /root/b-tal01891

echo "=== measured cost per window, from the falsifier sweep ==="
node -e '
const fs=require("fs");
const r=JSON.parse(fs.readFileSync("saturation-falsifier.json","utf8"));
const t0=Date.parse(r.startedAt||r.results[0].at), t1=Date.parse(r.finishedAt||r.results[r.results.length-1].at);
const n=r.results.length;
const wall=(t1-t0)/1000;
console.log("  windows completed : "+n);
console.log("  wall clock        : "+wall.toFixed(0)+" s ("+(wall/60).toFixed(1)+" min)");
console.log("  per window        : "+(wall/n).toFixed(0)+" s  <- includes login, seek, 120 s measure, teardown");
console.log("");
console.log("  NB this sweep reused one browser across windows. An A/B that toggles a .env flag cannot:");
console.log("  the container restarts between arms, so each arm pays setup again.");
' 2>&1

echo
echo "=== what a REGIME-01-compliant A/B costs at the 10% margin (n=5/arm) ==="
node -e '
const per=Number(process.argv[1]);
const cells=[["zero-trade  flag ON",5],["zero-trade  flag OFF",5],["trade-bearing flag ON",5],["trade-bearing flag OFF",5]];
let tot=0;
for(const [name,n] of cells){const s=n*per; tot+=s; console.log("  "+name.padEnd(24)+n+" x "+per.toFixed(0)+"s = "+(s/60).toFixed(1)+" min");}
const restarts=2*90;
console.log("  container restarts x2   = "+(restarts/60).toFixed(1)+" min");
console.log("  preflight + verify      = 5.0 min");
console.log("  ------------------------------------------");
console.log("  TOTAL                   = "+((tot+restarts)/60+5).toFixed(1)+" min");
console.log("");
console.log("  zero-trade arms only    = "+((10*per+restarts)/60+5).toFixed(1)+" min");
' "$(node -e '
const fs=require("fs");const r=JSON.parse(fs.readFileSync("saturation-falsifier.json","utf8"));
const t0=Date.parse(r.startedAt||r.results[0].at),t1=Date.parse(r.finishedAt||r.results[r.results.length-1].at);
console.log(((t1-t0)/1000/r.results.length).toFixed(1));')"

echo
echo "=== time actually available ==="
echo -n "  now (host UTC)       : "; date -u '+%H:%M'
echo    "  window opens         : 03:00 UTC (= 04:00 in the Director's local time)"
echo -n "  minutes remaining    : "; echo $(( ( $(date -u -d '03:00' +%s) - $(date -u +%s) ) / 60 ))
echo    "  and C's arm-1 cut runs FIRST in that window, so an overrun lands on C, not on me."
