$lines = [System.IO.File]::ReadAllLines('c:\Users\HADES\OneDrive\Desktop\talaria\chart v 1.4\chart\index.html')
$line = $lines[54138]
$idx = $line.IndexOf('if(chartCheckbox){chartCheckbox.addEventListener')
$chunk = $line.Substring($idx, [Math]::Min(2000, $line.Length - $idx))
Write-Output "=== chartCheckbox handler ==="
Write-Output $chunk
