# Restore VPS Postgres + chart uploads into local docker compose stack.
#
# Prerequisites:
#   1. Run scripts/vps-export-data.sh on the VPS and copy the export folder here, e.g.:
#        scp -r user@YOUR_VPS:/tmp/talaria-export-20260606 ./local-data/
#   2. Local stack created at least once: docker compose up -d db redis questdb journal-backend
#
# Usage (from repo root):
#   .\scripts\import-vps-data-local.ps1 -ExportDir .\local-data\talaria-export-20260606
#   .\scripts\import-vps-data-local.ps1 -ExportDir .\local-data\talaria-export-20260606 -SkipUploads

param(
    [Parameter(Mandatory = $true)]
    [string]$ExportDir,
    [switch]$SkipUploads
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

$pgDump = Join-Path $ExportDir "postgres.sql.gz"
$uploadsTar = Join-Path $ExportDir "chart-uploads.tar.gz"

if (-not (Test-Path $pgDump)) {
    throw "Missing $pgDump — run scripts/vps-export-data.sh on the VPS first."
}

Write-Host "==> Stopping services that hold DB/uploads locks..."
docker compose stop trading-chart trading-chart-worker homepage journal-backend 2>$null

Write-Host "==> Restoring Postgres (this replaces data in the local postgres volume)..."
docker compose up -d db
$deadline = (Get-Date).AddMinutes(3)
do {
    Start-Sleep -Seconds 2
    $healthy = docker compose ps db 2>$null | Select-String "healthy"
} while (-not $healthy -and (Get-Date) -lt $deadline)

docker compose exec -T db psql -U talaria -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'talaria' AND pid <> pg_backend_pid();" 2>$null | Out-Null
docker compose exec -T db psql -U talaria -d postgres -c "DROP DATABASE IF EXISTS talaria;"
docker compose exec -T db psql -U talaria -d postgres -c "CREATE DATABASE talaria;"
Get-Content $pgDump -Raw | docker compose exec -T db bash -c "gunzip -c | psql -U talaria -d talaria -v ON_ERROR_STOP=1"

if (-not $SkipUploads) {
    if (-not (Test-Path $uploadsTar)) {
        throw "Missing $uploadsTar (use -SkipUploads to import DB only)."
    }
    Write-Host "==> Restoring chart uploads volume..."
    docker compose up -d trading-chart
    Start-Sleep -Seconds 5
    Get-Content $uploadsTar -Raw | docker compose exec -T trading-chart bash -c "rm -rf /app/uploads/* /app/uploads/.[!.]* 2>/dev/null; tar xzf - -C /app"
}

Write-Host "==> Starting full stack..."
docker compose up -d

Write-Host "==> Done. Open http://localhost:3000 and sign in with your VPS account."
if (Test-Path (Join-Path $ExportDir "manifest.txt")) {
    Write-Host ""
    Get-Content (Join-Path $ExportDir "manifest.txt")
}
