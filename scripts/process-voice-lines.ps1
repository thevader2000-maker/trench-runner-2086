$ErrorActionPreference = "Stop"
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$input = Join-Path $root "assets\audio\voice-raw"
$output = Join-Path $root "assets\audio\voice"
$ffmpeg = Join-Path $root "tools\ffmpeg\extracted\ffmpeg-8.1.1-essentials_build\bin\ffmpeg.exe"

if (-not (Test-Path -LiteralPath $ffmpeg)) { throw "Bundled ffmpeg was not found." }
New-Item -ItemType Directory -Force -Path $output | Out-Null

$master = "loudnorm=I=-18:TP=-1.5:LRA=7"
$control = "highpass=f=150,lowpass=f=6800,acompressor=threshold=0.12:ratio=3:attack=8:release=120:makeup=1.8,$master"
$nexus = "highpass=f=220,lowpass=f=4300,flanger=delay=3:depth=1.5:regen=18:width=55:speed=0.35,acompressor=threshold=0.11:ratio=4:attack=5:release=100:makeup=1.7,aecho=0.8:0.45:20:0.13,$master"
$archon = "asetrate=21600,aresample=24000,highpass=f=70,lowpass=f=4600,acompressor=threshold=0.1:ratio=4:attack=10:release=180:makeup=1.8,aecho=0.82:0.62:42|88:0.24|0.12,$master"

$jobs = @(
  @{ Name = "control-launch"; Filter = $control },
  @{ Name = "control-weapons-free"; Filter = $control },
  @{ Name = "control-escape"; Filter = $control },
  @{ Name = "control-finale"; Filter = "highpass=f=150,lowpass=f=6800,acompressor=threshold=0.12:ratio=3:attack=8:release=120:makeup=1.8,aecho=0.8:0.35:55:0.1,$master" },
  @{ Name = "nexus-warning"; Filter = $nexus },
  @{ Name = "archon-reveal"; Filter = $archon }
)

foreach ($job in $jobs) {
  $source = Join-Path $input "$($job.Name).wav"
  $target = Join-Path $output "$($job.Name).wav"
  if (-not (Test-Path -LiteralPath $source)) { throw "Missing raw voice line: $source" }
  & $ffmpeg -hide_banner -loglevel error -y -i $source -af $job.Filter -ar 24000 -ac 1 -c:a pcm_s16le $target
  if ($LASTEXITCODE -ne 0) { throw "Voice processing failed for $($job.Name)." }
}

Copy-Item -LiteralPath (Join-Path $input "voice-lines.json") -Destination (Join-Path $output "voice-lines.json") -Force
Write-Host "Processed voice lines in $output"
