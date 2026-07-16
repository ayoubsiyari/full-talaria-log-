param(
  [string]$Csv = 'tickets/support-export-full-16-07-26/messages.csv',
  [int]$AfterId = 1623
)
$rows = Import-Csv $Csv
$fresh = $rows | Where-Object { [int]$_.ticket_id -gt $AfterId }
Write-Output ("FRESH ROWS: " + @($fresh).Count)
foreach ($r in $fresh) {
  Write-Output ($r.ticket_ref + " | " + $r.subject + " | " + $r.status + " | " + $r.created_at)
  Write-Output ("BODY: " + $r.body)
  Write-Output ("IMG: " + $r.image_file)
  Write-Output ""
}
