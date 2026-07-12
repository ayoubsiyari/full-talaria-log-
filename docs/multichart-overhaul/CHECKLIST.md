# Multichart Pre-Merge Checklist

Use this checklist for any change that touches multichart behavior, harness wiring, or the chart engine paths used by multichart.

## Required Before Merge

1. Worker report is complete.
   - The implementation report should describe changed files, behavior covered, and any remaining defects or follow-up work.

2. The regression gate is green locally.
   - From `chart v 1.4/chart/multichart-prod/harness/` run:

```powershell
npm run gate
```

   - **Current gate state (post-closure, b105):** 29 scenarios GREEN (`H-S2`..`H-S31`, incl. `H-S19b`), **0 known-failing**. The former baseline failures `H-S2`, `H-S3`, and `H-S6` are all green.
   - Any failure is now a regression. If any scenario is added to `known-failing.json`, it must be justified in the same change; a baseline test that turns green means `known-failing.json` is stale and must be ratcheted down in the same change.

3. If engine files changed, mirrored copies match.
   - Canonical chart engine files live under `chart v 1.4/chart/**`.
   - Deployed static mirror files live under `homepage/public/chart/**`.
   - Compare only files that are intentionally mirrored, such as `chart.js`, `modules/**`, `multichart-prod/**`, and other served chart assets.

PowerShell example:

```powershell
$pairs = @(
  @("chart v 1.4\chart\chart.js", "homepage\public\chart\chart.js"),
  @("chart v 1.4\chart\modules", "homepage\public\chart\modules"),
  @("chart v 1.4\chart\multichart-prod", "homepage\public\chart\multichart-prod")
)

foreach ($pair in $pairs) {
  $left = $pair[0]
  $right = $pair[1]
  if (Test-Path $left -PathType Leaf) {
    Get-FileHash $left, $right -Algorithm SHA256 | Format-Table Path, Hash
  } else {
    Get-ChildItem $left -Recurse -File | ForEach-Object {
      $rel = Resolve-Path -Relative $_.FullName
      $mirror = Join-Path $right (Resolve-Path -Relative $_.FullName).Substring((Resolve-Path -Relative $left).Length).TrimStart('\', '/')
      if (Test-Path $mirror) {
        $a = (Get-FileHash $_.FullName -Algorithm SHA256).Hash
        $b = (Get-FileHash $mirror -Algorithm SHA256).Hash
        if ($a -ne $b) { Write-Error "Mirror mismatch: $($_.FullName) -> $mirror" }
      }
    }
  }
}
```

Linux/GitHub runner example:

```bash
sha256sum "chart v 1.4/chart/chart.js" "homepage/public/chart/chart.js"
diff -qr "chart v 1.4/chart/modules" "homepage/public/chart/modules"
diff -qr "chart v 1.4/chart/multichart-prod" "homepage/public/chart/multichart-prod"
```

4. Build ID is bumped if this is shipping to users.
   - Bump only the existing build/version hooks used by the chart delivery path.
   - Do not add parallel build IDs or cache-busting schemes.

## CI Gate

Pull requests touching `chart v 1.4/chart/**` or `chart v 1.4/talaria-design/src/Multichart*` run the multichart harness workflow. The workflow calls `npm run gate`, which now expects all 29 scenarios (`H-S2`..`H-S31`, incl. `H-S19b`) green with 0 known-failing, and blocks new regressions and stale baselines.
