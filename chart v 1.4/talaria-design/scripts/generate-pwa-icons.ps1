# Generate PWA / favicon PNGs from homepage/public/logo-04.png.
# - Crops to the blue mark (drops baked-in black background)
# - Scales to ~86% of canvas so the logo reads at 16–32px tab sizes
# - Forces logo pixels to full opacity (avoids invisible semi-transparent favicons)
param(
    [string]$Source = (Join-Path $PSScriptRoot "../../../homepage/public/logo-04.png"),
    [string[]]$TargetDirs = @(
        (Join-Path $PSScriptRoot "../../../homepage/public/pwa"),
        (Join-Path $PSScriptRoot "../live/public/pwa"),
        (Join-Path $PSScriptRoot "../../chart/pwa"),
        (Join-Path $PSScriptRoot "../../../homepage/public/chart/pwa")
    )
)

Add-Type -AssemblyName System.Drawing

function Get-ContentBounds($img, [int]$Threshold = 32) {
    $minX = $img.Width; $minY = $img.Height; $maxX = 0; $maxY = 0
    for ($y = 0; $y -lt $img.Height; $y++) {
        for ($x = 0; $x -lt $img.Width; $x++) {
            $c = $img.GetPixel($x, $y)
            if ($c.A -lt 16) { continue }
            if ($c.R -le $Threshold -and $c.G -le $Threshold -and $c.B -le $Threshold) { continue }
            if ($x -lt $minX) { $minX = $x }
            if ($y -lt $minY) { $minY = $y }
            if ($x -gt $maxX) { $maxX = $x }
            if ($y -gt $maxY) { $maxY = $y }
        }
    }
    if ($maxX -lt $minX) { throw "No visible logo pixels in $Source" }
    return @{ X = $minX; Y = $minY; W = ($maxX - $minX + 1); H = ($maxY - $minY + 1) }
}

function Save-LogoIcon($dest, [int]$size, $srcImg, $bounds) {
    $pad = [Math]::Max(2, [int][Math]::Round($size * 0.07))
    $inner = $size - (2 * $pad)
    $scale = [Math]::Min($inner / $bounds.W, $inner / $bounds.H)
    $drawW = [int][Math]::Round($bounds.W * $scale)
    $drawH = [int][Math]::Round($bounds.H * $scale)
    $dx = [int][Math]::Floor(($size - $drawW) / 2)
    $dy = [int][Math]::Floor(($size - $drawH) / 2)

    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    $srcRect = New-Object System.Drawing.Rectangle $bounds.X, $bounds.Y, $bounds.W, $bounds.H
    $destRect = New-Object System.Drawing.Rectangle $dx, $dy, $drawW, $drawH
    $g.DrawImage($srcImg, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose()

    for ($y = 0; $y -lt $size; $y++) {
        for ($x = 0; $x -lt $size; $x++) {
            $c = $bmp.GetPixel($x, $y)
            if ($c.A -lt 8) { continue }
            if ($c.R -le 28 -and $c.G -le 28 -and $c.B -le 28) {
                $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
                continue
            }
            $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, $c.R, $c.G, $c.B))
        }
    }

    $dir = Split-Path $dest -Parent
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $bmp.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

if (-not (Test-Path $Source)) { throw "Missing source logo: $Source" }
$srcImg = [System.Drawing.Image]::FromFile($Source)
$bounds = Get-ContentBounds $srcImg

foreach ($dir in $TargetDirs) {
    Save-LogoIcon (Join-Path $dir "icon-32.png") 32 $srcImg $bounds
    Save-LogoIcon (Join-Path $dir "icon-192.png") 192 $srcImg $bounds
    Save-LogoIcon (Join-Path $dir "icon-512.png") 512 $srcImg $bounds
    Write-Host "[generate-pwa-icons] -> $dir"
}

$srcImg.Dispose()

$favicon = Join-Path (Split-Path $TargetDirs[0] -Parent) "favicon.png"
Copy-Item -Force (Join-Path $TargetDirs[0] "icon-32.png") $favicon
Write-Host "[generate-pwa-icons] favicon -> $favicon"
