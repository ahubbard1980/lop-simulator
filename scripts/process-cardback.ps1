Add-Type -AssemblyName System.Drawing

$src = "C:\Users\ahubb\Downloads\LoP-Simulator\LOP Card Back\LOP Card Back.png"
$outDir = "C:\Users\ahubb\Downloads\LoP-Simulator\public\cards"
$outPath = Join-Path $outDir "card-back.png"

$cropRect = New-Object System.Drawing.Rectangle 49, 63, 651, 922
$targetWidth = 600

$img = [System.Drawing.Bitmap]::FromFile($src)
$cropped = $img.Clone($cropRect, $img.PixelFormat)

$targetHeight = [int]([math]::Round($targetWidth * $cropped.Height / $cropped.Width))
$resized = New-Object System.Drawing.Bitmap $targetWidth, $targetHeight
$g = [System.Drawing.Graphics]::FromImage($resized)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($cropped, (New-Object System.Drawing.Rectangle 0, 0, $targetWidth, $targetHeight))
$g.Dispose()

$resized.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)

$resized.Dispose()
$cropped.Dispose()
$img.Dispose()

Write-Output "Wrote: $outPath ($targetWidth x $targetHeight)"
