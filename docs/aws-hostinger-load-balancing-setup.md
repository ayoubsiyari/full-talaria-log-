# AWS + Hostinger load balancing / failover setup (Talaria)

**Goal:** Add an empty Hostinger VPS next to the live AWS server **without downtime**, **without splitting user data**, and with an instant rollback path.

**Domain assumed:** `talaria-log.com` / `www.talaria-log.com`  
**Stack assumed:** root `docker-compose.yml` (`homepage`, `journal-backend`, `trading-chart`, `trading-chart-worker`, `db`, `redis`, `questdb`) + volumes `postgres_data`, `questdb_data`, `chart_uploads`, `chart_data`.

---

## 1. Read this first (decision)

### Do **not** do this
- Point DNS to both servers while each runs its **own** Postgres / Redis / QuestDB / upload disk.
- Cut DNS over in one step with no health checks.
- Expose Postgres/Redis/QuestDB publicly on `0.0.0.0` without a VPN and firewall allowlist.

That causes logouts, missing charts, wrong journals, broken uploads, and hard-to-debug “sometimes works” bugs.

### Do this instead (recommended path)

| Phase | Mode | Traffic | Risk |
|------|------|---------|------|
| A | Prepare Hostinger offline | AWS 100% | None |
| B | Private test Hostinger | AWS 100% | None |
| C | Cloudflare **failover** (Hostinger standby) | AWS primary | Low |
| D *(optional later)* | True load balance | Split traffic | Medium — only after shared storage |

**Recommendation for week 1:** stop at **Phase C (failover)**.  
True 50/50 load balancing across AWS + Hostinger is possible later, but needs shared file storage (S3 or equivalent) first because `chart_uploads` / `chart_data` live on local Docker volumes today.

---

## 2. Target architecture

### Phase C — failover (safe default)

```
                    Internet users
                           |
                     Cloudflare
                     (DNS + proxy)
                           |
              ┌────────────┴────────────┐
              |                         |
         AWS (PRIMARY)            Hostinger (STANDBY)
         healthy = online         only used if AWS fails
              |
    ┌─────────┴──────────┐
    | App containers     |
    | homepage           |
    | journal-backend    |
    | trading-chart      |
    | trading-chart-worker
    └─────────┬──────────┘
              |
    Local data plane on AWS
    - Postgres (db)
    - Redis
    - QuestDB
    - chart_uploads / chart_data volumes
```

Hostinger runs the **same app images**, but either:

- **Option C1 (simplest standby):** full stack on Hostinger with **periodic data sync** from AWS; promote only during AWS outage (accept some data lag), **or**
- **Option C2 (hotter standby):** Hostinger app containers talk to **AWS data plane** over a private VPN (Tailscale/WireGuard). Faster failover; needs careful firewalling and latency awareness.

### Phase D — true load balance (later)

```
                    Cloudflare Load Balancing
                    sticky sessions ON
                           |
              ┌────────────┴────────────┐
           AWS app node            Hostinger app node
              |                         |
              └───────────┬─────────────┘
                          |
                 Shared data plane
                 - Managed Postgres OR primary Postgres on AWS
                 - Shared Redis
                 - Shared object storage for uploads/tiles (S3)
                 - QuestDB strategy decided deliberately (usually stay single-writer)
```

Until uploads/tiles are on shared storage, **do not** put both nodes in active/active for chart traffic.

---

## 3. Inventory checklist (do on AWS first)

SSH to the live AWS box and record:

```bash
# Where the app lives (adjust path if different)
cd /opt/talaria   # or your real repo root
git rev-parse --short HEAD
docker compose ps
docker stats --no-stream

# Public ports
ss -tulpn | grep -E ':80|:443|:3000'

# Disk used by stateful volumes
docker system df -v | head -100
du -sh /var/lib/docker/volumes/* 2>/dev/null | sort -h | tail -30

# Confirm health endpoints used in compose comments
curl -fsS http://127.0.0.1:3000/ | head -c 200
curl -fsS http://127.0.0.1:3000/api/status
curl -fsS http://127.0.0.1:3000/journal/api/health
```

Also collect (store in a password manager, not in git):

- [ ] Cloudflare account access for `talaria-log.com`
- [ ] AWS public IP / hostname
- [ ] Hostinger public IP
- [ ] Current TLS termination (Cloudflare Full / nginx / Caddy / none)
- [ ] `.env` secrets: `SECRET_KEY`, `JWT_SECRET_KEY`, Stripe, SMTP, Google OAuth, DB passwords
- [ ] GHCR deploy pull access (see `scripts/deploy.sh` registry `ghcr.io/ayoubsiyari`)

---

## 4. Phase A — prepare Hostinger (no DNS change)

### A1. Server baseline

On the empty Hostinger VPS:

```bash
# Ubuntu 22.04/24.04 recommended
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl git ufw fail2ban

# Docker (official install)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# log out/in after this

docker --version
docker compose version
```

Firewall (start strict):

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
# Do NOT open 5432 / 6379 / 8812 / 9009 to the world
sudo ufw enable
sudo ufw status
```

### A2. Clone repo + env

```bash
sudo mkdir -p /opt/talaria
sudo chown $USER:$USER /opt/talaria
cd /opt/talaria
git clone <YOUR_REPO_URL> .
cp .env.example .env   # if present; otherwise copy .env from AWS securely
```

Copy `.env` from AWS with SCP/SFTP (never commit it):

```bash
# from your laptop
scp user@AWS_IP:/opt/talaria/.env user@HOSTINGER_IP:/opt/talaria/.env
```

**Must match AWS on both nodes (later active/active):**

- `SECRET_KEY`
- `JWT_SECRET_KEY`
- `POSTGRES_*`
- Stripe / Google / SMTP keys
- `FRONTEND_URL=https://www.talaria-log.com`
- `CORS_*` / `TRUSTED_ORIGINS` / `STRIPE_REDIRECT_ALLOWED_ORIGINS`

### A3. Deploy app images (same as AWS)

Prefer pull-based deploy (does not compile on the VPS):

```bash
cd /opt/talaria
# Ensure GHCR login if images are private:
# echo $GHCR_TOKEN | docker login ghcr.io -u <user> --password-stdin

./scripts/deploy.sh
# or pin a known-good tag:
# IMAGE_TAG=<git-sha> ./scripts/deploy.sh
```

### A4. Choose standby mode

#### Option C1 — full local stack on Hostinger (cold/warm standby)

Keep compose as-is (local `db`, `redis`, `questdb`, local volumes).  
Hostinger is a **copy** of the app. Sync data on a schedule (see §6). Cloudflare only sends traffic here if AWS health checks fail.

**Pros:** isolated, simple firewall.  
**Cons:** failover may lose recent writes unless sync is frequent / streaming.

#### Option C2 — Hostinger apps → AWS data plane (hot standby)

Run on Hostinger only:

- `homepage`
- `journal-backend`
- `trading-chart`
- `trading-chart-worker` *(optional; often keep workers only on AWS to avoid duplicate FirstRate/binary jobs)*

Point them at AWS over VPN:

```env
# Example conceptual env — hostnames must be VPN IPs/names, not public internet
DB_HOST=aws-db.tailnet-or-vpn
DB_PORT=5432
DATABASE_URL=postgresql://talaria:***@aws-db:5432/talaria
REDIS_URL=redis://aws-redis:6379
QUESTDB_PG_URL=postgresql://admin:***@aws-questdb:8812/qdb
QUESTDB_ILP_HOST=aws-questdb
```

You will need a compose overlay that:

1. Does **not** start a second Postgres/Redis/QuestDB as source of truth (or starts them disabled).
2. Mounts **shared** upload/data storage — if still local Docker volumes, chart datasets will diverge. For C2 without S3, only use Hostinger for homepage/journal **or** accept read-only chart limitations until shared storage exists.

**Pros:** same live data.  
**Cons:** cross-provider latency; VPN/firewall complexity; uploads still a problem without shared disk/S3.

**Practical week-1 choice:** **Option C1 + Cloudflare failover**.

---

## 5. Phase B — private validation (still AWS 100%)

Do **not** change public DNS yet.

### B1. Test by IP / temporary hostname

On Hostinger:

```bash
docker compose ps
curl -fsS http://127.0.0.1:3000/api/status
curl -fsS http://127.0.0.1:3000/journal/api/health
```

From your laptop, temporarily map:

```text
HOSTINGER_IP   hb.talaria-log.com
```

Add a Cloudflare DNS record **DNS-only (grey cloud)** for `hb.talaria-log.com` → Hostinger IP, or use `/etc/hosts`.

### B2. Functional checklist on Hostinger

- [ ] Homepage loads
- [ ] Login / JWT cookie works
- [ ] Open chart / backtest session
- [ ] Switch symbol
- [ ] Place or view journal entries
- [ ] Stripe portal return URLs still allowed (if billing tested)
- [ ] No mixed-content / CORS errors in browser console

### B3. Confirm AWS untouched

```bash
# on AWS
docker compose ps
curl -fsS https://www.talaria-log.com/api/status
```

Users should notice **zero** change.

---

## 6. Data sync for Option C1 (standby with local DB)

Only needed if Hostinger has its own Postgres/volumes.

### 6.1 What must be synced

| Data | Volume / service | Priority |
|------|------------------|----------|
| Users, sessions, journals, billing | `postgres_data` / `db` | Critical |
| Chart uploads + binaries/tiles | `chart_uploads`, `chart_data` | Critical for charts |
| Cache | `redis` | Optional (can rebuild) |
| QuestDB | `questdb_data` | If QuestDB reads are enabled |

### 6.2 Example Postgres dump/restore (maintenance window friendly)

On AWS:

```bash
docker compose exec -T db pg_dump -U talaria -Fc talaria > /tmp/talaria-$(date +%F).dump
scp /tmp/talaria-*.dump user@HOSTINGER_IP:/tmp/
```

On Hostinger (standby only — not while it serves users):

```bash
docker compose stop journal-backend trading-chart trading-chart-worker homepage
docker compose exec -T db pg_restore -U talaria -d talaria --clean --if-exists < /tmp/talaria-YYYY-MM-DD.dump
docker compose up -d
```

### 6.3 Example volume sync for chart files

Prefer `rsync` over VPN during low traffic:

```bash
# conceptual — adjust volume mountpaths after `docker volume inspect`
rsync -aH --delete \
  user@AWS_IP:/var/lib/docker/volumes/talaria_chart_uploads/_data/ \
  /var/lib/docker/volumes/talaria_chart_uploads/_data/
```

Schedule with cron (e.g. hourly) while Hostinger is standby.

### 6.4 Worker duplication warning

If both nodes run `trading-chart-worker` with FirstRate / binary queue enabled, you can double-ingest or fight over jobs.

**Standby rule:** on Hostinger set until promotion:

```env
FIrstrate_SCHEDULE_ENABLED=false
# and/or scale worker to 0:
# docker compose stop trading-chart-worker
```

Only enable workers on Hostinger after it becomes primary.

---

## 7. Phase C — Cloudflare failover (no crash path)

### C1. Health endpoints

Use the same monitors already documented in compose:

- `https://www.talaria-log.com/` (homepage)
- `https://www.talaria-log.com/api/status` (chart)
- `https://www.talaria-log.com/journal/api/health` (journal)

Also add **origin-specific** health checks in Cloudflare Load Balancing that hit each origin IP directly (not only the public hostname).

### C2. Cloudflare setup (failover)

1. Cloudflare → **Traffic** → **Load Balancing** (plan may require paid LB feature; alternatively use **DNS failover** tools / Secondary IP with health checks).
2. Create **Pool A — AWS**
   - Origin: AWS IP, port 443
   - Health check: HTTPS `/api/status` (or `/journal/api/health`)
3. Create **Pool B — Hostinger**
   - Origin: Hostinger IP
   - Same health check path
4. Create LB hostname `www.talaria-log.com` (or proxied record used by the site)
5. Steering: **Failover**
   - Primary = AWS pool
   - Fallback = Hostinger pool
6. Session affinity: **ON (cookie / IP)** once you move to active/active; for pure failover it matters less.
7. TTL / proxy: orange-cloud proxied.

### C3. TLS mode

Prefer:

- Cloudflare SSL mode: **Full (strict)** with valid certs on both origins, **or**
- Cloudflare origin certs installed on both nginx/homepage containers / host reverse proxies

Do not leave one origin on HTTP-only Flexible if the other is Full — browsers will see intermittent failures.

### C4. Soft cutover drill

1. Keep Hostinger synced / healthy.
2. In Cloudflare, temporarily mark AWS pool **drained** or simulate failure in a staging LB hostname first (`lb-test.talaria-log.com`).
3. Confirm site serves from Hostinger.
4. Restore AWS as primary.
5. Only then attach the real `www` hostname.

### C5. Instant rollback

If anything looks wrong:

1. Cloudflare → set only AWS pool enabled / Hostinger disabled  
2. Or switch DNS A record back to AWS IP only  
3. Users recover within Cloudflare cache/DNS seconds–minutes

No app redeploy required for rollback.

---

## 8. Phase D — true load balancing (only when ready)

Complete these gates before 50/50 traffic:

- [ ] Shared Postgres reachable from both app nodes (VPN or managed DB)
- [ ] Shared Redis for rate limits + bar cache (`REDIS_URL`)
- [ ] Shared object storage for `chart_uploads` / tiles (S3 + `TILE_CDN_*` if used)
- [ ] Single writer policy for QuestDB / FirstRate / binary queue (usually one worker node)
- [ ] Identical image tags on both nodes (`IMAGE_TAG=... ./scripts/deploy.sh`)
- [ ] Sticky sessions enabled at Cloudflare
- [ ] Connection budget reviewed (`POSTGRES_MAX_CONNECTIONS`, optional PgBouncer profile)

### Suggested traffic ramp

| Day | AWS | Hostinger |
|-----|-----|-----------|
| 0 | 100% | 0% (health only) |
| 1 | 95% | 5% |
| 2 | 80% | 20% |
| 3+ | 50% | 50% *(if metrics clean)* |

Watch:

- 5xx rate at Cloudflare
- `/api/status` latency
- Postgres connections
- Redis memory
- Disk on upload volumes
- Auth/CORS anomalies

---

## 9. Security requirements (non-negotiable)

1. **Never** publish Postgres `5432`, Redis `6379`, QuestDB `8812`/`9009` to `0.0.0.0/0`.
2. Use **Tailscale or WireGuard** for cross-server DB/Redis if Option C2/D.
3. Keep `SECRET_KEY` / `JWT_SECRET_KEY` identical across app nodes.
4. Keep `assert_production_security` / redirect allowlists intact — fix env URLs, do not disable guards.
5. Hostinger SSH: keys only, `ufw` + `fail2ban`.
6. Deploy with the same CI images (`scripts/deploy.sh`); do not `--build` heavy chart bundles on small VPS CPUs.

---

## 10. Day-2 operations

### Deploy both nodes the same way

```bash
# AWS
cd /opt/talaria && IMAGE_TAG=<sha> ./scripts/deploy.sh

# Hostinger
cd /opt/talaria && IMAGE_TAG=<sha> ./scripts/deploy.sh
```

Never leave nodes on different image tags while both receive traffic.

### Monitoring

Enable optional Uptime Kuma from compose profile if desired:

```bash
docker compose --profile monitoring up -d uptime-kuma
# tunnel: ssh -L 3001:127.0.0.1:3001 user@AWS_IP
```

Monitors:

- `https://www.talaria-log.com/`
- `https://www.talaria-log.com/api/status`
- `https://www.talaria-log.com/journal/api/health`

Alert on Telegram/email when either origin fails.

### Backup ownership

While AWS is primary:

- DB dumps + volume snapshots run on **AWS**
- Hostinger sync is disaster recovery, not the backup source of truth

---

## 11. Failure playbooks

### AWS down, Hostinger standby (C1)

1. Confirm AWS unhealthy in Cloudflare.
2. Cloudflare fails over to Hostinger automatically (if configured).
3. If Hostinger workers were stopped, start them **after** promotion:
   ```bash
   docker compose up -d trading-chart-worker
   # re-enable FIrstrate only if this node is now primary
   ```
4. Communicate possible data lag equal to last successful sync age.
5. When AWS returns: resync **from Hostinger → AWS** before switching primary back (avoid clobbering newer Hostinger writes).

### Bad deploy on one node

1. Drain that origin in Cloudflare.
2. Roll back image tag on that node only.
3. Re-enable origin after health checks pass.

---

## 12. Minimal “do it this week” checklist

- [ ] Inventory AWS (IPs, `.env`, volumes, health URLs)
- [ ] Provision Hostinger (Docker, UFW, repo, `.env`)
- [ ] `./scripts/deploy.sh` on Hostinger
- [ ] Private test via `hb.` hostname / hosts file
- [ ] Choose C1 sync schedule (Postgres dump + rsync uploads)
- [ ] Disable Hostinger workers / FirstRate until promotion
- [ ] Configure Cloudflare failover (AWS primary, Hostinger fallback)
- [ ] Drill failover on a test hostname
- [ ] Document rollback (disable Hostinger pool)
- [ ] Defer true 50/50 until shared storage exists

---

## 13. Open decisions (fill in before Phase D)

1. **Shared uploads:** S3 / R2 / NFS — which provider?
2. **QuestDB:** stay single-node on AWS, or replicate?
3. **Workers:** AWS-only forever, or elect a primary worker node?
4. **DB:** keep Postgres on AWS VM, or move to managed Postgres?

Until those are decided, **failover (Phase C)** is the correct production posture.

---

## 14. Related repo files

- `docker-compose.yml` — services, healthchecks, volumes, monitoring profile
- `scripts/deploy.sh` — pull GHCR images and recreate containers (no host build)
- `scripts/vps-export-data.sh` / `scripts/import-vps-data-local.ps1` — existing data move helpers (adapt for AWS→Hostinger)
- `docs/talaria-performance-fixes.md` — notes on scaling chart workers vs more nodes
- `homepage/nginx.local.conf` — static `/chart/` + caching behavior behind homepage

---

## Bottom line

You **can** add Hostinger without crashing the live site by:

1. Leaving AWS as the only public origin while Hostinger is built and tested  
2. Using Cloudflare **failover** first (not split traffic)  
3. Syncing or sharing data deliberately  
4. Keeping an instant Cloudflare rollback to AWS-only  

True load balancing is a **second project** that needs a shared data plane — especially for `chart_uploads` / `chart_data`.
