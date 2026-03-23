$lines = [System.IO.File]::ReadAllLines('c:\Users\HADES\OneDrive\Desktop\talaria\chart v 1.4\chart\index.html')
$line = $lines[54138]
# Split into chunks of 3000 chars
$chunkSize = 3000
$pos = 0
$i = 1
while ($pos -lt $line.Length) {
    $chunk = $line.Substring($pos, [Math]::Min($chunkSize, $line.Length - $pos))
    Write-Output "=== CHUNK $i ==="
    Write-Output $chunk
    $pos += $chunkSize
    $i++
}
