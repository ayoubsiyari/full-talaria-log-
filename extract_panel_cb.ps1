$lines = [System.IO.File]::ReadAllLines('c:\Users\HADES\OneDrive\Desktop\talaria\chart v 1.4\chart\index.html')
$line = $lines[54138]
$idx = $line.IndexOf('if(panelCheckbox){panelCheckbox.addEventListener')
$chunk = $line.Substring($idx, [Math]::Min(2500, $line.Length - $idx))
Write-Output "=== panelCheckbox handler ==="
Write-Output $chunk
