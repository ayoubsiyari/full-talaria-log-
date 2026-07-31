#!/bin/bash
# Confirm the 04:00 window has a checksum-verified backup in place, and that the live state matches it.
set -u
cd /root/b-tal01891 || exit 1
MAN=$(ls -t killswitch-backups/*.manifest 2>/dev/null | head -1)
[ -n "$MAN" ] || { echo "FAIL: no manifest"; exit 1; }

echo "=== manifest (checksums only, never contents - this file holds secrets) ==="
cat "$MAN"

echo
echo "=== verify: on-disk file against the manifest, and the running container ==="
bash killswitch.sh verify "$MAN"; rc=$?
echo "verify exit: $rc"

echo
echo "=== backup files present ==="
ls -la killswitch-backups/

echo
echo "=== independent re-read of the backup, right now ==="
BK=$(grep '^backup=' "$MAN" | cut -d= -f2-)
WANT=$(grep '^sha256=' "$MAN" | cut -d= -f2-)
GOT=$(sha256sum "$BK" | awk '{print $1}')
echo "manifest says: $WANT"
echo "backup is now: $GOT"
[ "$WANT" = "$GOT" ] && echo "READY: backup is intact and matches the live file" \
                     || { echo "FAIL: backup drifted"; exit 1; }
exit $rc
