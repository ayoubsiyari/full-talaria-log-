#!/bin/sh
echo "=== live / prior pins ==="
cat /root/talaria-restore/LIVE-PIN.txt
cat /root/talaria-restore/PRIOR-PIN.txt 2>/dev/null || echo NO_PRIOR_PIN
echo "=== keep-list ==="
cat /root/talaria-restore/KEEP-BUILDS.txt 2>/dev/null || echo NO_KEEP_LIST
echo "=== artifacts for the builds under grading ==="
for b in 20260729b103 20260729b104 20260730b105 20260730b106; do
  tarball=/root/talaria-restore/images/canary-$b.tar.gz
  if [ -f "$tarball" ]; then
    printf '%s tarball=yes bytes=%s\n' "$b" "$(stat -c %s "$tarball")"
  else
    printf '%s tarball=MISSING\n' "$b"
  fi
  printf '  images: %s\n' "$(docker images --format '{{.Repository}}:{{.Tag}}' | grep -c "canary-$b")"
done
