$lines = [System.IO.File]::ReadAllLines('c:\Users\HADES\OneDrive\Desktop\talaria\chart v 1.4\chart\index.html')
$line = $lines[54138]
$line.Substring(0, [Math]::Min(8000, $line.Length)) | Out-File 'c:\Users\HADES\OneDrive\Desktop\talaria\tmp_func.txt' -Encoding UTF8
Write-Output "Done. Length: $($line.Length)"
