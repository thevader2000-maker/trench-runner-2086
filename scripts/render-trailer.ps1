param(
  [int]$Port = 9235,
  [int]$TimeoutSeconds = 90
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
  $buffer = New-Object byte[] 131072
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
$downloadPath = Join-Path $root "trailer"
New-Item -ItemType Directory -Force -Path $downloadPath | Out-Null

$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$profile = Join-Path $env:TEMP ("trench-trailer-" + [guid]::NewGuid().ToString("N"))
$url = "file:///" + ((Resolve-Path (Join-Path $root "index.html")).Path.Replace("\", "/")) + "?trailer"
$edgeProcess = $null
$socket = [System.Net.WebSockets.ClientWebSocket]::new()

try {
  $edgeProcess = Start-Process -FilePath $edge -ArgumentList @(
    "--headless=new",
    "--disable-gpu",
    "--disable-extensions",
    "--allow-file-access-from-files",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--no-first-run",
    "--autoplay-policy=no-user-gesture-required",
    "--window-size=1920,1080",
    "--force-device-scale-factor=1",
    "--remote-debugging-port=$Port",
    "--user-data-dir=$profile",
    $url
  ) -WindowStyle Hidden -PassThru

  $target = $null
  for ($attempt = 0; $attempt -lt 50 -and -not $target; $attempt++) {
    Start-Sleep -Milliseconds 200
    try {
      $targets = Invoke-RestMethod "http://127.0.0.1:$Port/json/list" -TimeoutSec 1
      $target = $targets | Where-Object { $_.url -like "*?trailer*" } | Select-Object -First 1
    } catch {}
  }
  if (-not $target) { throw "Trailer tab was not exposed by Edge." }

  $null = $socket.ConnectAsync([Uri]$target.webSocketDebuggerUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  $id = 1
  Send-Cdp $socket $id "Page.setDownloadBehavior" @{
    behavior = "allow"
    downloadPath = $downloadPath
    eventsEnabled = $true
  }
  $null = Receive-Cdp $socket $id

  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  $status = $null
  while ([DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Seconds 1
    $id++
    Send-Cdp $socket $id "Runtime.evaluate" @{
      expression = "JSON.stringify(window.TR_TRAILER.snapshot())"
      returnByValue = $true
    }
    $response = Receive-Cdp $socket $id
    $value = $response.result.result.value
    if ($value) { $status = $value | ConvertFrom-Json }
    if ($status.complete) { break }
  }
  if (-not $status.complete) {
    throw "Trailer recording did not finish within $TimeoutSeconds seconds. Last status: $($status | ConvertTo-Json -Compress)"
  }

  $download = $null
  for ($attempt = 0; $attempt -lt 30 -and -not $download; $attempt++) {
    Start-Sleep -Milliseconds 500
    $download = Get-ChildItem -LiteralPath $downloadPath -Filter "*.webm" |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1
  }
  if (-not $download) { throw "Trailer download was not created." }

  $finalPath = Join-Path $downloadPath "trench-runner-2086-trailer-final.webm"
  if ($download.FullName -ne $finalPath) {
    Copy-Item -LiteralPath $download.FullName -Destination $finalPath -Force
  }
  Get-Item -LiteralPath $finalPath | Format-List FullName, Length, LastWriteTime
} finally {
  if ($socket.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
    $null = $socket.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "done", [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  }
  $socket.Dispose()
  if ($edgeProcess -and -not $edgeProcess.HasExited) { Stop-Process -Id $edgeProcess.Id -Force }
}
