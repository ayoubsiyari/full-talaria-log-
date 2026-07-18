$rows = @(Get-Content 'docs/tickets-overhaul/PLAN2-SCOREBOARD.csv' | Select-Object -Skip 1 | Where-Object {$_ -match ','})
$total = $rows.Count
$oos = @($rows | Where-Object {$_ -match ',OUT-OF-SCOPE'}).Count
$cv  = @($rows | Where-Object {$_ -match ',CLOSED-VERIFIED,'}).Count
$denom = $total - $oos
$pct = [math]::Round($cv * 100.0 / $denom, 1)
"CV=$cv TOTAL=$total OOS=$oos DENOM=$denom PCT=$pct"
