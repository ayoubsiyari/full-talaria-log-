# Download sample forex M1 datasets locally via Dukascopy (no VPS, no FirstRate account).
# Requires trading-chart container running with the updated download/fetch-data.js in the image.
#
# Usage (from repo root):
#   .\scripts\local-download-forex.ps1
#   .\scripts\local-download-forex.ps1 -Days 7 -Instruments eurusd,gbpusd
#   .\scripts\local-download-forex.ps1 -Majors -Days 14

param(
    [int]$Days = 30,
    [switch]$Majors,
    [string[]]$Instruments = @()
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

if ($Majors -or $Instruments.Count -eq 0) {
    $args = @("python3", "scripts/local_import_dukascopy.py", "--majors", "--days", "$Days")
} else {
    $args = @("python3", "scripts/local_import_dukascopy.py", "--days", "$Days")
    foreach ($inst in $Instruments) {
        $args += @("--instrument", $inst.Trim().ToLower())
    }
}

Write-Host "==> Ensuring trading-chart is up..."
docker compose up -d trading-chart db redis questdb journal-backend | Out-Null
Start-Sleep -Seconds 8

Write-Host "==> Fetching forex datasets (binary tile builds queue in background)..."
docker compose exec -T trading-chart @args

Write-Host ""
Write-Host "Open http://localhost:3000/chart/ after binaries finish (Admin → Datasets for progress)."
