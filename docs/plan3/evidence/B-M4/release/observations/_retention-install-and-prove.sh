#!/usr/bin/env bash
set -uo pipefail
OBS=/mnt/c/Users/user/Desktop/talaria1/manager-b-plan3/docs/plan3/evidence/B-M4/release/observations
H='root@31.97.192.82'

echo "=== A. prove the OLD ordering was the destroyer (on the host, old script still in place) ==="
ssh -p 443 -o BatchMode=yes $H "printf '%s\n' 20260729b85 20260729b100 20260729b103 20260729b104 | sort -u | tail -n 2 | tr '\n' ' '; echo '  <- OLD sort keeps these two as newest'"
ssh -p 443 -o BatchMode=yes $H "printf '%s\n' 20260729b85 20260729b100 20260729b103 20260729b104 | sort -u -V | tail -n 2 | tr '\n' ' '; echo '  <- FIXED sort keeps these two as newest'"

echo "=== B. install fixed retention + record prior pin + keep-list b103/b104 ==="
scp -P 443 -o BatchMode=yes "$OBS/canary-image-retention.host.sh" $H:/root/talaria-restore/canary-image-retention.sh
echo "SCP_EXIT=$?"
ssh -p 443 -o BatchMode=yes $H 'set -u
  chmod +x /root/talaria-restore/canary-image-retention.sh
  echo 20260729b103 > /root/talaria-restore/PRIOR-PIN.txt
  KF=/root/talaria-restore/KEEP-BUILDS.txt
  for b in 20260729b103 20260729b104; do
    grep -qx "$b" "$KF" || printf "%s\n" "$b" >> "$KF"
  done
  echo "--- KEEP-BUILDS.txt now ---"; grep -v "^#" "$KF" | grep -v "^$"
'

echo "=== C. self-test the ranking (the gate) ==="
ssh -p 443 -o BatchMode=yes $H 'sh /root/talaria-restore/canary-image-retention.sh --self-test'
echo "SELFTEST_EXIT=$?"

echo "=== D. dry run under the fixed policy — nothing may be retired that anyone is grading ==="
ssh -p 443 -o BatchMode=yes $H 'sh /root/talaria-restore/canary-image-retention.sh 2>&1 | sed -n "1,40p"'
