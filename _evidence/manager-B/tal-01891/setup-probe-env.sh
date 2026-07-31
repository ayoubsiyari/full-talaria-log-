#!/usr/bin/env bash
# puppeteer's postinstall tries to fetch a browser and fails on this host, but the browser is
# already cached. puppeteer-core is the same driver without the download step.
set -uo pipefail
cd /root/b-tal01891
rm -rf node_modules package-lock.json
npm init -y >/dev/null 2>&1
PUPPETEER_SKIP_DOWNLOAD=true npm i puppeteer-core --no-audit --no-fund 2>&1 | tail -4

echo "--- puppeteer-core version ---"
node -p "require('/root/b-tal01891/node_modules/puppeteer-core/package.json').version" 2>&1

echo "--- chrome binary ---"
CHROME=$(find /root/.cache/puppeteer/chrome -maxdepth 3 -name chrome -type f 2>/dev/null | head -1)
echo "  $CHROME"
[ -x "$CHROME" ] && echo "  executable: yes" || echo "  executable: NO"
"$CHROME" --version 2>&1 | sed 's/^/  /'
echo "$CHROME" > /root/b-tal01891/CHROME_PATH
