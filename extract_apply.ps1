$lines = [System.IO.File]::ReadAllLines('c:\Users\HADES\OneDrive\Desktop\talaria\chart v 1.4\chart\index.html')
$line = $lines[54138]
# Find the Apply button handler
$applyIdx = $line.IndexOf('applyBtn.addEventListener')
$chunk = $line.Substring($applyIdx, [Math]::Min(4000, $line.Length - $applyIdx))
Write-Output "=== Apply button handler ==="
Write-Output $chunk
