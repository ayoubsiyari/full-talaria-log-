# Kill-switch restore-in-place: rehearsed, 17 of 17, and armed for the 04:00 window

**From:** Manager B
**Date:** 2026-07-31 21:50
**Tools:** `_evidence/manager-B/k4-window-claim/killswitch.sh`,
`rehearse-killswitch-restore.sh`, `confirm-killswitch-ready.sh`

---

## State right now [verified]

| | |
|---|---|
| target | `/opt/talaria/.env`, 2869 bytes, mode 600, owner 0:0 |
| sha256 | `4ac6ffefb161db86ae0e3e36e64d5a8b2eef369eb32d0839b5f96e5d9fe5c907` |
| backup | `/root/b-tal01891/killswitch-backups/env.20260731T203911Z.bak`, mode 600 |
| verified | backup re-read from disk and byte-identical to the original, **before** any mutation |
| container | `TALARIA_DISABLE_*` set in `talaria-trading-chart-1`: **0** |

That last line is the useful one. No kill-switch is set on this canary at all, so "restored" is not a
fuzzy state — the invariant is *zero switches present*, and it is checked against the running container
rather than against the file I wrote.

## What the tool guarantees, and why each part exists

The rule the 15:00 incident actually taught, stated once: **a backup you have not checksummed is not a
backup, and the time to check it is before you mutate, not after.** Everything else follows.

- **Verified before mutation.** `backup` copies, re-reads the copy from disk, compares, and refuses to
  permit any write if they differ. A mutation can never begin behind an unverified backup.
- **Restore is genuinely in place.** The existing inode is truncated and rewritten, not replaced by a
  `mv`. A `mv`-over silently substitutes mode, owner and inode — on a 0600 file holding secrets that is
  a permissions change disguised as a restore. The rehearsal asserts the inode is unchanged.
- **Restore is verified against the thing itself.** The file is re-read from disk after writing and
  compared to the recorded checksum. Mismatch exits non-zero and prints where the good copy still is.
- **A corrupt backup is refused.** Restore checksums the backup before writing it over a good file.
- **Signals restore and then stop.** See below.
- **Nothing is suppressed, and no contents are ever printed.** `.env` holds secrets and this output goes
  into evidence artifacts. Checksums only — the manifest above is the complete record and carries none.

## The defect the rehearsal found in my own tool

My first version trapped `INT`/`TERM`/`HUP` with the same handler as `EXIT`. That handler *returns*. So
on a SIGTERM the file was restored correctly and then **the job carried on running**, and the rehearsal
printed `SHOULD NOT REACH: job completed normally`.

That is worse than not restoring. A measurement that continues past its own interruption, with its
conditions silently flipped back underneath it mid-run, produces a plausible number from two different
configurations and no line in the log saying so. It is the confound pattern again, manufactured by the
safety mechanism.

Fixed: signals get a separate handler that restores, clears the exit trap, and exits with the signal's
code (130/143/129), announcing `this run is void, not resumed`. The rehearsal now asserts all three —
file restored, job stopped, exit code identifies the signal.

## Rehearsal result [measured]

Run against a byte-copy of the real `.env`, not the real one. Deliberate: applying a server-side switch
for real needs a container restart, C's soak still shows one established connection to `:3000`, and I
committed not to disturb it. The file mechanics are identical on a copy; only the restart is deferred to
the window. The rehearsal asserts the real `.env` checksum is unchanged at the end, and it was.

```
1. backup verified before mutation ......................... PASS
2. switch application really changes the file .............. PASS (2 assertions)
3. restore byte-identical, inode preserved, line gone ...... PASS (3 assertions)
4. SIGTERM mid-run: restored, stopped, exit 143 ............ PASS (4 assertions)
5. SIGKILL: unrestored as expected, verify DETECTS it ...... PASS (3 assertions)
6. corrupt backup refused, good file intact ................ PASS (2 assertions)
   real /opt/talaria/.env unchanged throughout ............. PASS
   live container carries zero kill-switches ............... PASS
                                              17 passed, 0 failed
```

## The limit, stated rather than papered over

**SIGKILL cannot be trapped.** If the process is `kill -9`ed or the host loses power mid-run, the switch
stays applied and no handler will fix it. I tested this rather than omitting it: test 5 SIGKILLs a job
holding an applied switch and confirms the file is left mutated.

The mitigation is detection, not prevention. `killswitch.sh verify <manifest>` exits non-zero on a file
that is not in its recorded state, and separately reports how many `TALARIA_DISABLE_*` the **running
container** carries. Test 5 confirms `verify` catches the SIGKILLed case (exit 3) and that a manual
restore recovers it.

**So the standing instruction for the window is: run `verify` after every arm, not only after the last
one.** A trap covers the paths it can reach; `verify` covers the ones it cannot.

## Sequencing for 04:00

1. C's arm-1 cut runs first. I do not touch the host until C confirms.
2. `confirm-killswitch-ready.sh` — re-reads the backup and the container, must print `READY`.
3. Arms run. Any arm that applies a switch restarts the container, so nothing runs during a soak.
4. `killswitch.sh verify <manifest>` after **each** arm, not just at the end.
5. Final state check: zero `TALARIA_DISABLE_*` in the container, `.env` sha back to `4ac6ffef…`.

## Confidence

- [verified] current checksums, file mode, backup integrity, and zero switches in the running container
  — all read back from the host after the fact, not asserted from what I wrote.
- [measured] 17 of 17 rehearsal assertions, including the two failure modes.
- [verified] SIGKILL leaves the switch applied and `verify` detects it — tested, not reasoned.
- [inferred] that the mechanics transfer unchanged from the sandbox copy to `/opt/talaria/.env`. Same
  code path and same filesystem, but the real target has not been mutated and restored, only backed up.
  The first real apply/restore happens in the window and I will publish its checksums.
- [unverified] whether C's soak still holds that one connection to `:3000`. Zero log lines in three
  minutes and 0.68% container CPU say it is idle either way, and I am treating it as live regardless.
