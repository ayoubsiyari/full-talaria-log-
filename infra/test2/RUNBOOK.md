# TEST-2 operator runbook and Tier-3 packet

Status: implementation only. This profile must not be started until the host-specific preflight and seed manifest are green. TEST-1 has absolute precedence.

## Fixed scope

- Compose project `talaria-test2`; host port `3001` is bound only to `127.0.0.1`; one internal network `talaria-test2-private`.
- Dedicated PostgreSQL database `talaria_test2` and non-superuser bootstrap role `talaria_test2_app`; dedicated Redis and QuestDB.
- Six explicit TEST-2 volumes. No external volumes, bind mounts, host networking, `container_name`, `volumes_from`, TEST-1 DNS, or shared persistence.
- Separate QA cookie, origin, account IDs, DB/QuestDB credentials, application secret and JWT secret. Billing/OAuth/telemetry credentials are blank.
- Resource ceiling: 7.82 GiB memory and 4.5 CPUs across the whole profile. Per-service limits are in `compose.yml`; do not raise them without a new host audit.
- Permanent TEST-2 response header and red `TEST-2 · QA ONLY · ISOLATED DATA` HTML badge. Port 3001 is operator-only: use a private SSH tunnel; never issue a tester-shared URL.
- The deployment contains no LOD/decimation workaround.

## One-time secret preparation

On the host, create a path outside every source/deployment repository:

```sh
sudo install -d -m 0700 /etc/talaria/test2
sudo install -m 0600 /dev/null /etc/talaria/test2/runtime.env
sudoedit /etc/talaria/test2/runtime.env
```

The file must define `TEST2_POSTGRES_ADMIN_PASSWORD`, `TEST2_POSTGRES_PASSWORD`, `TEST2_QUESTDB_PASSWORD`, `TEST2_SECRET_KEY`, `TEST2_JWT_SECRET_KEY`, `TEST2_PROOF_HMAC_KEY`, `TEST2_ORIGIN`, and immutable digest-pinned `TEST2_CHART_IMAGE`, `TEST2_HOMEPAGE_IMAGE`, `TEST2_JOURNAL_IMAGE`. Values must be newly generated and must not equal TEST-1/prod values. Never copy a TEST-1/prod env file.

Set:

```sh
export TEST2_SECRETS_FILE=/etc/talaria/test2/runtime.env
export TEST1_SECRETS_FILE=/etc/talaria/test1/runtime.env
export TEST1_ORIGIN=https://test1.example.invalid
export TEST1_COOKIE_NAME=chart_session_id
export TEST1_FORBIDDEN_TOKENS=talaria-test1,postgres-test1,redis-test1,questdb-test1
export TEST2_PROOF_HMAC_KEY=<new-external-32+-character-proof-key>
```

Replace the origin/token examples with the audited TEST-1 values. Preflight compares file and individual secret hashes and rejects reuse.

## Preflight, snapshot, start

```sh
node infra/test2/preflight.mjs
export TEST1_COMPOSE_PROJECT=<exact-test1-project>
export TEST1_POSTGRES_USER=<test1-role>
export TEST1_POSTGRES_DB=<test1-database>
node infra/test2/isolation-proof.mjs snapshot /var/lib/talaria-test2/test1-before.json
docker compose --project-name talaria-test2 --env-file "$TEST2_SECRETS_FILE" -f infra/test2/compose.yml up -d
```

Preflight intentionally remains RED until `seed-manifest.json` is replaced by measured host evidence: curated QA-only data no larger than 15 GiB, four distinct symbols, at least 98,901 overlapping 1m bars, and evidence paths showing mixed-2 predictive and mixed-4 characterization loaded and ran. `DONE` is prohibited while either cell is false.

Create only IDs matching `qa-test2-*`. Seed the sentinel printed by `isolation-proof snapshot` into a TEST-2 session, trade, and queue key; never insert it into TEST-1.

## TEST-1 precedence watchdog

Run under a host service manager with restart-on-failure. The guard pauses workloads before its first health read, after every monitoring error, and on SIGTERM/SIGINT. Install an independent stop-post pause because a process cannot handle SIGKILL or host OOM:

```sh
export TEST2_COMPOSE_FILE="$PWD/infra/test2/compose.yml"
export TEST1_HEALTH_URL=https://test1.example.invalid/api/status
node infra/test2/guard.mjs
```

Supervisor contract (systemd equivalent is mandatory):

```ini
[Service]
ExecStart=/usr/bin/node /opt/talaria-test2/infra/test2/guard.mjs
Restart=always
KillSignal=SIGTERM
TimeoutStopSec=20
ExecStopPost=/bin/sh -c '/usr/bin/docker compose --project-name talaria-test2 -f /opt/talaria-test2/infra/test2/compose.yml ps -q chart-test2 worker-test2 questdb-test2 | /usr/bin/xargs -r /usr/bin/docker pause'
```

If `ExecStopPost` fails, the supervisor must alert and immediately stop the entire TEST-2 project. It must never address TEST-1 container IDs.

The guard pauses TEST-2 chart, worker, and QuestDB when TEST-1 is unhealthy, available host memory is below 2 GiB, or CPU exceeds 85% for four samples. It resumes only after three consecutive safe samples and only unpauses TEST-2 workload IDs. Guard failure is an alert condition; stop TEST-2.

## Occupancy

Every harness must acquire a lease before work and poll `status`; a soak stops activity while its state is `paused`, preserving its checkpoint, then resumes when `running`.

```sh
node infra/test2/occupancy.mjs acquire soak soak-<id>
node infra/test2/occupancy.mjs acquire parked-build-diagnosis diagnosis-<id>
node infra/test2/occupancy.mjs acquire blocking-train-candidate train-<id>
node infra/test2/occupancy.mjs release train-<id>
```

Priority is blocking train candidate > parked-build diagnosis > soak.

## Teardown, rollback, isolation acceptance

```sh
docker compose --project-name talaria-test2 --env-file "$TEST2_SECRETS_FILE" -f infra/test2/compose.yml down
node infra/test2/isolation-proof.mjs verify /var/lib/talaria-test2/test1-before.json
```

Normal rollback is the previous digest-pinned TEST-2 image set in the external secret file followed by preflight and `up -d`; it never targets TEST-1. Destructive data rollback requires a separately approved TEST-2-only volume restore. Do not use `down -v` during acceptance.

The isolation verifier accepts only sentinels matching `^qa-test2-[a-f0-9]{24}$`. It passes the value through a psql variable into `set_config`; JavaScript never interpolates SQL. It scans all TEST-1 text and JSON/JSONB columns (including session/trade tables), plus every Redis key and serialized value (queue/cache coverage). The proof artifact is HMAC-SHA256 sealed with the external `TEST2_PROOF_HMAC_KEY` before its sentinel or baseline is trusted. It then verifies TEST-1 container/image/mount inventory and read-only content hashes for every mounted volume are unchanged. Archive before/after JSON, rendered Compose config, preflight output, guard state, seed manifest, mixed-cell measurements, and teardown output.

## Security / I16 review checklist

- [ ] Independent reviewer confirms all secrets remain external mode 0600 and hash-distinct.
- [ ] No prod/TEST-1 account, session, trade, queue, DNS, URL, mount, network, secret, or image credential entered TEST-2.
- [ ] QA IDs only; no public/shared tester link; port 3001 reached through operator access.
- [ ] Negative controls and four-state oracle proof pass three times and once on a second clock/host.
- [ ] Oracle provenance records source commit and `last proven RED`; stale proof is marked `UNPROVEN`, never green.
- [ ] TEST-1 health degradation, low-memory, sustained-CPU, safe-resume, occupancy preemption and guard-failure drills are archived.
- [ ] Sentinel absent from TEST-1 sessions/trades/queues; TEST-1 container and volume-content digest unchanged after teardown.
- [ ] Reviewer records I16 conclusion and signs the packet before any host deployment authorization.
