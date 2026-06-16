param(
  [int]$Port = 9236,
  [int]$Fps = 30,
  [int]$DurationSeconds = 60,
  [string]$AudioSource = "trailer\trench-runner-2086-trailer-audio.wav",
  [string]$OutputPath = "trailer\trench-runner-2086-trailer-final.mp4",
  [switch]$KeepFrames
)

$ErrorActionPreference = "Stop"

function Send-Cdp {
  param(
    [System.Net.WebSockets.ClientWebSocket]$Socket,
    [int]$Id,
    [string]$Method,
    [hashtable]$Params = @{}
  )
  $payload = @{ id = $Id; method = $Method; params = $Params } | ConvertTo-Json -Compress -Depth 8
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
  $segment = [ArraySegment[byte]]::new($bytes)
  $null = $Socket.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
}

function Receive-Cdp {
  param(
    [System.Net.WebSockets.ClientWebSocket]$Socket,
    [int]$ExpectedId
  )
  $buffer = New-Object byte[] 1048576
  while ($true) {
    $stream = [System.IO.MemoryStream]::new()
    try {
      do {
        $segment = [ArraySegment[byte]]::new($buffer)
        $result = $Socket.ReceiveAsync($segment, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
        $stream.Write($buffer, 0, $result.Count)
      } while (-not $result.EndOfMessage)
      $message = [System.Text.Encoding]::UTF8.GetString($stream.ToArray()) | ConvertFrom-Json
      if ($message.id -eq $ExpectedId) { return $message }
    } finally {
      $stream.Dispose()
    }
  }
}

$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$trailerRoot = [System.IO.Path]::GetFullPath((Join-Path $root "trailer"))
$frameRoot = [System.IO.Path]::GetFullPath((Join-Path $trailerRoot "offline-frames"))
if (-not $frameRoot.StartsWith($trailerRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Frame directory escaped the trailer directory."
}
if (Test-Path -LiteralPath $frameRoot) {
  Remove-Item -LiteralPath $frameRoot -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $frameRoot | Out-Null

$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$ffmpeg = Get-ChildItem (Join-Path $root "tools\ffmpeg\extracted") -Recurse -Filter "ffmpeg.exe" -ErrorAction SilentlyContinue |
  Select-Object -First 1
if (-not (Test-Path -LiteralPath $edge)) { throw "Microsoft Edge was not found." }
if (-not $ffmpeg) { throw "FFmpeg is missing under tools\ffmpeg\extracted." }

$profile = Join-Path $env:TEMP ("trench-offline-trailer-" + [guid]::NewGuid().ToString("N"))
$url = "file:///" + ((Resolve-Path (Join-Path $root "index.html")).Path.Replace("\", "/")) + "?offlineTrailer"
$edgeProcess = $null
$socket = [System.Net.WebSockets.ClientWebSocket]::new()
$frameCount = $Fps * $DurationSeconds

try {
  $edgeProcess = Start-Process -FilePath $edge -ArgumentList @(
    "--headless=new",
    "--disable-extensions",
    "--allow-file-access-from-files",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--no-first-run",
    "--window-size=1920,1080",
    "--force-device-scale-factor=1",
    "--remote-debugging-port=$Port",
    "--user-data-dir=$profile",
    $url
  ) -WindowStyle Hidden -PassThru

  $target = $null
  for ($attempt = 0; $attempt -lt 60 -and -not $target; $attempt++) {
    Start-Sleep -Milliseconds 200
    try {
      $targets = Invoke-RestMethod "http://127.0.0.1:$Port/json/list" -TimeoutSec 1
      $target = $targets | Where-Object { $_.url -like "*?offlineTrailer*" } | Select-Object -First 1
    } catch {}
  }
  if (-not $target) { throw "Offline trailer tab was not exposed by Edge." }

  $null = $socket.ConnectAsync([Uri]$target.webSocketDebuggerUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  for ($frame = 1; $frame -le $frameCount; $frame++) {
    Send-Cdp $socket $frame "Runtime.evaluate" @{
      expression = "window.TR_OFFLINE_TRAILER.renderFrame()"
      returnByValue = $true
    }
    $response = Receive-Cdp $socket $frame
    if ($response.result.exceptionDetails) {
      throw "Frame $frame failed: $($response.result.exceptionDetails.text)"
    }
    $dataUrl = [string]$response.result.result.value
    if (-not $dataUrl.StartsWith("data:image/jpeg;base64,")) {
      throw "Frame $frame did not return JPEG data."
    }
    $bytes = [Convert]::FromBase64String($dataUrl.Substring(23))
    $framePath = Join-Path $frameRoot ("frame-{0:D5}.jpg" -f $frame)
    [System.IO.File]::WriteAllBytes($framePath, $bytes)
    if ($frame -eq 1 -or $frame % ($Fps * 5) -eq 0) {
      Write-Host ("Rendered {0}/{1} frames ({2:N0}%)" -f $frame, $frameCount, ($frame / $frameCount * 100))
    }
  }

  $audio = [System.IO.Path]::GetFullPath((Join-Path $root $AudioSource))
  $output = [System.IO.Path]::GetFullPath((Join-Path $root $OutputPath))
  $framePattern = Join-Path $frameRoot "frame-%05d.jpg"
  & $ffmpeg.FullName `
    -y `
    -framerate $Fps `
    -i $framePattern `
    -i $audio `
    -map 0:v:0 `
    -map "1:a:0?" `
    -vf "fps=$Fps,setpts=N/($Fps*TB),scale=in_range=pc:out_range=tv,format=yuv420p" `
    -c:v libx264 `
    -preset medium `
    -crf 18 `
    -profile:v high `
    -level 4.1 `
    -r $Fps `
    -fps_mode cfr `
    -frames:v $frameCount `
    -g ($Fps * 2) `
    -bf 0 `
    -keyint_min $Fps `
    -sc_threshold 0 `
    -c:a aac `
    -af "atrim=0:$DurationSeconds,asetpts=PTS-STARTPTS,aresample=async=1:first_pts=0" `
    -b:a 192k `
    -ar 48000 `
    -ac 2 `
    -t $DurationSeconds `
    -movflags +faststart `
    -use_editlist 0 `
    -muxpreload 0 `
    -muxdelay 0 `
    -avoid_negative_ts make_zero `
    -video_track_timescale ($Fps * 1000) `
    $output
  if ($LASTEXITCODE -ne 0) { throw "FFmpeg failed with exit code $LASTEXITCODE." }
  Get-Item -LiteralPath $output | Format-List FullName, Length, LastWriteTime
} finally {
  if ($socket.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
    $null = $socket.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "done", [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  }
  $socket.Dispose()
  if ($edgeProcess -and -not $edgeProcess.HasExited) { Stop-Process -Id $edgeProcess.Id -Force }
  if (-not $KeepFrames -and (Test-Path -LiteralPath $frameRoot)) {
    $resolvedFrames = [System.IO.Path]::GetFullPath($frameRoot)
    if ($resolvedFrames.StartsWith($trailerRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
      Remove-Item -LiteralPath $resolvedFrames -Recurse -Force
    }
  }
}
