param(
  [string]$InputPath = "trailer\trench-runner-2086-trailer-final.webm",
  [string]$OutputPath = "trailer\trench-runner-2086-trailer-final.mp4"
)

$ErrorActionPreference = "Stop"
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$ffmpeg = Get-ChildItem (Join-Path $root "tools\ffmpeg\extracted") -Recurse -Filter "ffmpeg.exe" -ErrorAction SilentlyContinue |
  Select-Object -First 1
if (-not $ffmpeg) {
  throw "FFmpeg is missing. Extract an FFmpeg Windows build under tools\ffmpeg\extracted."
}

$input = [System.IO.Path]::GetFullPath((Join-Path $root $InputPath))
$output = [System.IO.Path]::GetFullPath((Join-Path $root $OutputPath))

& $ffmpeg.FullName `
  -y `
  -fflags +genpts `
  -i $input `
  -vf "fps=30,scale=1920:1080:flags=lanczos,format=yuv420p" `
  -af "aresample=async=1:first_pts=0" `
  -c:v libx264 `
  -preset medium `
  -crf 18 `
  -profile:v high `
  -level 4.1 `
  -g 60 `
  -keyint_min 30 `
  -sc_threshold 0 `
  -c:a aac `
  -b:a 192k `
  -ar 48000 `
  -movflags +faststart `
  -shortest `
  $output

if ($LASTEXITCODE -ne 0) {
  throw "Trailer conversion failed with exit code $LASTEXITCODE."
}

Get-Item -LiteralPath $output | Format-List FullName, Length, LastWriteTime
