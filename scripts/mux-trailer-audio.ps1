param(
  [string]$InputVideo = "trailer\trench-runner-2086-trailer-final.mp4",
  [string]$AudioPath = "trailer\trench-runner-2086-trailer-audio.wav",
  [string]$OutputPath = "trailer\trench-runner-2086-trailer-final.mp4",
  [double]$AudioDelaySeconds = 0.0
)

$ErrorActionPreference = "Stop"
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$ffmpeg = Get-ChildItem (Join-Path $root "tools\ffmpeg\extracted") -Recurse -Filter "ffmpeg.exe" -ErrorAction SilentlyContinue |
  Select-Object -First 1
if (-not $ffmpeg) { throw "FFmpeg is missing under tools\ffmpeg\extracted." }

$input = [System.IO.Path]::GetFullPath((Join-Path $root $InputVideo))
$audio = [System.IO.Path]::GetFullPath((Join-Path $root $AudioPath))
$output = [System.IO.Path]::GetFullPath((Join-Path $root $OutputPath))
$temp = [System.IO.Path]::ChangeExtension($output, ".remux.tmp.mp4")

if (-not (Test-Path -LiteralPath $input)) { throw "Input video is missing: $input" }
if (-not (Test-Path -LiteralPath $audio)) { throw "Audio file is missing: $audio" }

$audioDelayMs = [int][Math]::Round($AudioDelaySeconds * 1000)
$audioFilter = "adelay=${audioDelayMs}|${audioDelayMs},atrim=0:60,asetpts=PTS-STARTPTS,aresample=async=1:first_pts=0"

& $ffmpeg.FullName `
  -y `
  -fflags +genpts `
  -i $input `
  -i $audio `
  -map 0:v:0 `
  -map 1:a:0 `
  -vf "fps=30,setpts=N/(30*TB),scale=in_range=pc:out_range=tv,format=yuv420p" `
  -c:v libx264 `
  -preset medium `
  -crf 18 `
  -profile:v high `
  -level 4.1 `
  -r 30 `
  -fps_mode cfr `
  -frames:v 1800 `
  -g 60 `
  -bf 0 `
  -keyint_min 30 `
  -sc_threshold 0 `
  -af $audioFilter `
  -c:a aac `
  -b:a 192k `
  -ar 48000 `
  -ac 2 `
  -t 60 `
  -movflags +faststart `
  -use_editlist 0 `
  -muxpreload 0 `
  -muxdelay 0 `
  -avoid_negative_ts make_zero `
  -video_track_timescale 30000 `
  $temp
if ($LASTEXITCODE -ne 0) { throw "Trailer remux failed with exit code $LASTEXITCODE." }

Move-Item -LiteralPath $temp -Destination $output -Force
Get-Item -LiteralPath $output | Format-List FullName, Length, LastWriteTime
