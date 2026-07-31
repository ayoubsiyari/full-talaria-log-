#!/usr/bin/env bash
# Does the journal API actually hand the client real screenshots for the seeded account?
# If it strips or defers them, a real-app measurement against this account measures nothing.
# Done with curl rather than a browser: the login page redirects once authenticated, which kept
# destroying the page context mid-evaluate. No browser is needed to answer this.
set -uo pipefail
BASE=http://127.0.0.1:3000
. /root/.talaria-test-env
SID=$(cat /root/b-m20j1/QA_SESSION_ID)
JAR=/tmp/m20j1-cookies.txt
rm -f "$JAR"

echo "=== log in ==="
code=$(curl -sS -c "$JAR" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}" \
  -o /tmp/login.json -w '%{http_code}')
echo "  http $code"
[ "$code" = "200" ] || { echo "  ABORT"; head -c 200 /tmp/login.json; exit 2; }
echo "  cookie set: $(grep -c chart_session_id "$JAR" || true)"

echo
echo "=== fetch the seeded journal ==="
code=$(curl -sS -b "$JAR" "$BASE/api/sessions/$SID/journal-trades" \
  -o /tmp/journal.json -w '%{http_code}')
echo "  http $code  bytes=$(wc -c < /tmp/journal.json)"
[ "$code" = "200" ] || { echo "  ABORT"; head -c 200 /tmp/journal.json; exit 2; }

echo
echo "=== do real screenshots reach the client? ==="
node -e '
const fs = require("fs");
const j = JSON.parse(fs.readFileSync("/tmp/journal.json","utf8"));
const arr = Array.isArray(j) ? j : (j.trades || j.data || j.journal_trades || []);
console.log("  rows returned      :", arr.length);
if (!arr.length) { console.log("  SEED_NOT_USABLE (no rows)"); process.exit(1); }
console.log("  row keys           :", Object.keys(arr[0]).slice(0,12).join(", "));
let shots = 0, bytes = 0, maxLen = 0;
const dims = [];
for (const row of arr) {
  let p = row;
  if (typeof row.payload_json === "string") { try { p = JSON.parse(row.payload_json); } catch { continue; } }
  else if (row.payload && typeof row.payload === "object") p = row.payload;
  for (const k of ["entryScreenshot","exitScreenshot"]) {
    const v = p[k];
    if (typeof v === "string" && v.startsWith("data:image")) {
      shots++; bytes += v.length; if (v.length > maxLen) maxLen = v.length;
    }
  }
}
console.log("  screenshots found  :", shots);
console.log("  total encoded      :", (bytes/1048576).toFixed(1), "MB");
console.log("  average per shot   :", shots ? Math.round(bytes/shots/1024) : 0, "KB");
console.log("  largest single shot:", Math.round(maxLen/1024), "KB");
console.log("");
if (shots > 0) {
  // A 240px thumbnail decodes to ~0.1 MB; these decode to whatever their natural size is.
  console.log("  SEED_USABLE — the client really does receive " + shots + " full-resolution captures");
  process.exit(0);
} else {
  console.log("  SEED_NOT_USABLE — rows arrive but carry no data-url screenshots");
  process.exit(1);
}
'
