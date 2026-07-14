param(
  [string]$OldCsv = 'tickets/support-export-full-14-07-26/messages.csv',
  [string]$NewCsv = 'tickets/support-export-full-15-07-26/messages.csv'
)
$old = Import-Csv $OldCsv
$new = Import-Csv $NewCsv
Write-Output ("COLUMNS: " + ($new[0].PSObject.Properties.Name -join ' | '))
$idCol = $new[0].PSObject.Properties.Name[0]
$oldIds = @{}
foreach ($r in $old) { $oldIds[$r.$idCol] = $true }
$fresh = $new | Where-Object { -not $oldIds.ContainsKey($_.$idCol) }
Write-Output ("OLD: " + $old.Count + "  NEW: " + $new.Count + "  FRESH: " + $fresh.Count)
Write-Output "--- FRESH TICKETS ---"
foreach ($r in $fresh) {
  Write-Output ("=== " + ($r.PSObject.Properties | ForEach-Object { $_.Name + ': ' + $_.Value }) -join ' || ')
  Write-Output ""
}
