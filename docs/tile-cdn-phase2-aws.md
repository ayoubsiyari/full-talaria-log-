# Phase 2 — Tile CDN (S3 + CloudFront)

Part of the full plan: **[client-heavy-scaling-roadmap.md](./client-heavy-scaling-roadmap.md)** (Phases 1–8).

Offload immutable binary tiles from EC2 to CloudFront. The app already supports this via `TILE_CDN_REDIRECT` in `api_server.py`.

**You will see a difference when:**

| Signal | Before | After |
|--------|--------|-------|
| Tile URL | `200` from your server | `307` → CloudFront |
| Repeat tile fetch | nginx `X-Cache-Status: HIT` on EC2 | CloudFront `x-cache: Hit` |
| 20+ parallel tile requests | `trading-chart` CPU spikes | CPU stays lower; latency p50 drops on 2nd+ fetch |
| Users far from `eu-north-1` | All bytes from Stockholm EC2 | Edge POP closer to user |

**What CDN does *not* fix:** `/api/file/{id}/smart`, `/candles`, session PATCH — those stay on API (Redis cache helps). Phase 2 targets **raw tile bytes** (`/api/file/{id}/tile/{tf}/{idx}`).

---

## 1. AWS setup (one-time)

### 1.1 S3 bucket

Region: **eu-north-1** (same as EC2 — faster initial sync).

```bash
export AWS_REGION=eu-north-1
export TILE_CDN_S3_BUCKET=talaria-tiles-prod

aws s3 mb "s3://${TILE_CDN_S3_BUCKET}" --region "$AWS_REGION"
aws s3api put-public-access-block \
  --bucket "$TILE_CDN_S3_BUCKET" \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

### 1.2 CloudFront distribution

1. **Create distribution**
   - Origin: S3 bucket `talaria-tiles-prod`
   - Origin access: **Origin access control (OAC)** — bucket stays private
   - Default cache behavior: **GET, HEAD** only
   - Cache policy: **CachingOptimized** (or custom: min TTL 86400)
   - Compress objects: **Off** (tiles are already binary)

2. **Bucket policy** — allow CloudFront OAC only (AWS console offers a template when you attach OAC).

3. Note the distribution domain, e.g. `d1111abcdef8.cloudfront.net`

4. Optional: custom CNAME `tiles.talaria-log.com` + ACM cert (us-east-1 for CloudFront).

### 1.3 IAM on EC2 (sync script)

Attach a role or user policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::talaria-tiles-prod",
        "arn:aws:s3:::talaria-tiles-prod/*"
      ]
    }
  ]
}
```

Test: `aws sts get-caller-identity`

---

## 2. Sync tiles to S3

On the VPS at `/opt/talaria`:

```bash
cd /opt/talaria
export TILE_CDN_S3_BUCKET=talaria-tiles-prod
export AWS_DEFAULT_REGION=eu-north-1

# Smoke (3 files)
python3 scripts/sync-tiles-to-s3.py --uploads /var/lib/docker/volumes/talaria_chart_uploads/_data --limit 3

# Or inside container (if AWS CLI in image — usually run on host with volume path):
docker volume inspect talaria_chart_uploads -f '{{.Mountpoint}}'
# Full sync (can take a while for ~18GB tiles)
python3 scripts/sync-tiles-to-s3.py --uploads "$(docker volume inspect talaria_chart_uploads -f '{{.Mountpoint}}')"
```

S3 keys match the redirect URL: `api/file/{file_id}/tile/{tf}/{tile_idx}`

### After new dataset uploads

Re-run sync (cron every night or post-build):

```bash
# /etc/cron.d/talaria-tile-cdn
0 4 * * * ubuntu cd /opt/talaria && TILE_CDN_S3_BUCKET=talaria-tiles-prod AWS_DEFAULT_REGION=eu-north-1 python3 scripts/sync-tiles-to-s3.py --uploads /var/lib/docker/volumes/talaria_chart_uploads/_data >> /var/log/talaria-tile-cdn.log 2>&1
```

---

## 3. Enable redirect in `.env`

Repo root `.env` (or `chart v 1.4/chart/.env`):

```env
TILE_CDN_BASE_URL=https://d1111abcdef8.cloudfront.net
TILE_CDN_REDIRECT=true
```

Apply:

```bash
cd /opt/talaria
docker compose up -d trading-chart
```

---

## 4. Verify you see a difference

```bash
chmod +x scripts/verify-tile-cdn.sh

# BEFORE — with TILE_CDN_REDIRECT=false
./scripts/verify-tile-cdn.sh | tee /tmp/tile-cdn-before.txt

# Enable CDN in .env, restart trading-chart, then:
export TILE_CDN_BASE_URL=https://d1111abcdef8.cloudfront.net
./scripts/verify-tile-cdn.sh | tee /tmp/tile-cdn-after.txt
```

Compare **p50/p95** in section 3 and **trading-chart CPU**.

Browser check (DevTools → Network):

- Request: `/api/file/29/tile/1m/0`
- **Before:** `200`, size from your IP
- **After:** `307` then fetch to `cloudfront.net`, `x-cache: Hit` on repeat

---

## 5. Security note

Tiles are keyed by `file_id`. Anyone who knows the ID can request tiles (same as today without auth on tile GET). For private datasets, use CloudFront signed URLs later (not in Phase 2).

---

## 6. Rollback

```env
TILE_CDN_REDIRECT=false
```

```bash
docker compose up -d trading-chart
```

Tiles are still on disk; app serves locally again.
