param(
  [int]$Port = 9240,
  [int]$CaptureSecond = 12
)

$ErrorActionPreference = "Stop"

function Send-Cdp {
  param([System.Net.WebSockets.ClientWebSocket]$Socket, [int]$Id, [string]$Method, [hashtable]$Params = @{})
  $payload = @{ id = $Id; method = $Method; params = $Params } | ConvertTo-Json -Compress -Depth 8
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
  $null = $Socket.SendAsync([ArraySegment[byte]]::new($bytes), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
}

function Receive-Cdp {
  param([System.Net.WebSockets.ClientWebSocket]$Socket, [int]$ExpectedId)
  $buffer = New-Object byte[] 10485760
  while ($true) {
    $stream = [System.IO.MemoryStream]::new()
    try {
      do {
        $result = $Socket.ReceiveAsync([ArraySegment[byte]]::new($buffer), [Threading.CancellationToken]::None).GetAwaiter().GetResult()
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
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$profile = Join-Path $env:TEMP ("trench-preview-" + [guid]::NewGuid().ToString("N"))
$url = "file:///" + ((Resolve-Path (Join-Path $root "trailer\preview-trailer.html")).Path.Replace("\", "/"))
$edgeProcess = Start-Process -FilePath $edge -ArgumentList @(
  "--headless=new", "--disable-gpu", "--allow-file-access-from-files", "--no-first-run",
  "--autoplay-policy=no-user-gesture-required", "--window-size=1920,1080",
  "--force-device-scale-factor=1", "--remote-debugging-port=$Port",
  "--user-data-dir=$profile", $url
) -WindowStyle Hidden -PassThru

$socket = [System.Net.WebSockets.ClientWebSocket]::new()
try {
  $target = $null
  for ($attempt = 0; $attempt -lt 50 -and -not $target; $attempt++) {
    Start-Sleep -Milliseconds 200
    try {
      $targets = Invoke-RestMethod "http://127.0.0.1:$Port/json/list" -TimeoutSec 1
      $target = $targets | Where-Object { $_.url -like "*preview-trailer.html*" } | Select-Object -First 1
    } catch {}
  }
  if (-not $target) { throw "Preview tab unavailable." }
  $null = $socket.ConnectAsync([Uri]$target.webSocketDebuggerUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  Start-Sleep -Seconds $CaptureSecond
  Send-Cdp $socket 1 "Runtime.evaluate" @{
    expression = "JSON.stringify((v=>{const q=v.getVideoPlaybackQuality();return {currentTime:v.currentTime,duration:v.duration,paused:v.paused,width:v.videoWidth,height:v.videoHeight,audioTracks:v.captureStream().getAudioTracks().length,totalVideoFrames:q.totalVideoFrames,droppedVideoFrames:q.droppedVideoFrames}})(document.querySelector('video')))"
    returnByValue = $true
  }
  $playbackResponse = Receive-Cdp $socket 1
  $playback = $playbackResponse.result.result.value
  Set-Content -LiteralPath (Join-Path $root "trailer\trailer-playback-check.json") -Value $playback -Encoding UTF8

  Send-Cdp $socket 2 "Page.captureScreenshot" @{ format = "png"; fromSurface = $true }
  $response = Receive-Cdp $socket 2
  $bytes = [Convert]::FromBase64String($response.result.data)
  $path = Join-Path $root "trailer\trailer-preview.png"
  [System.IO.File]::WriteAllBytes($path, $bytes)
  Get-Item $path | Format-List FullName, Length
} finally {
  if ($socket.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
    $null = $socket.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "done", [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  }
  $socket.Dispose()
  if ($edgeProcess -and -not $edgeProcess.HasExited) { Stop-Process -Id $edgeProcess.Id -Force }
}
