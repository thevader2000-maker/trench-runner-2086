param(
  [int]$Port = 9227,
  [int]$TimeoutSeconds = 150,
  [ValidateSet("cadet", "ace", "nightmare")]
  [string]$Difficulty = "ace"
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

$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$profile = Join-Path $env:TEMP ("trench-performance-" + [guid]::NewGuid().ToString("N"))
$url = "file:///" + ((Resolve-Path (Join-Path $PSScriptRoot "..\index.html")).Path.Replace("\", "/")) + "?benchmark&difficulty=$Difficulty"
$edgeProcess = Start-Process -FilePath $edge -ArgumentList @(
  "--headless=new",
  "--disable-gpu",
  "--disable-extensions",
  "--no-first-run",
  "--mute-audio",
  "--autoplay-policy=no-user-gesture-required",
  "--remote-debugging-port=$Port",
  "--user-data-dir=$profile",
  $url
) -WindowStyle Hidden -PassThru

$socket = [System.Net.WebSockets.ClientWebSocket]::new()
try {
  $target = $null
  for ($attempt = 0; $attempt -lt 50 -and -not $target; $attempt++) {
    Start-Sleep -Milliseconds 200
    try {
      $targets = Invoke-RestMethod "http://127.0.0.1:$Port/json/list" -TimeoutSec 1
      $target = $targets | Where-Object { $_.url -like "*index.html?benchmark*" } | Select-Object -First 1
    } catch {}
  }
  if (-not $target) { throw "Benchmark tab was not exposed by Edge." }

  $null = $socket.ConnectAsync([Uri]$target.webSocketDebuggerUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  $id = 1
  Send-Cdp $socket $id "Runtime.enable"
  $null = Receive-Cdp $socket $id

  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  $samples = [System.Collections.Generic.List[object]]::new()
  $final = $null
  while ([DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Seconds 1
    $id++
    Send-Cdp $socket $id "Runtime.evaluate" @{
      expression = "JSON.stringify({snapshot:window.TR_BENCHMARK.snapshot(),result:window.TR_BENCHMARK.result()})"
      returnByValue = $true
    }
    $response = Receive-Cdp $socket $id
    $value = $response.result.result.value
    if (-not $value) { continue }
    $data = $value | ConvertFrom-Json
    $samples.Add($data.snapshot)
    if ($data.snapshot.state -eq "result") {
      $final = $data.result
      break
    }
  }
  if (-not $final) { throw "Benchmark did not finish within $TimeoutSeconds seconds." }

  $output = [ordered]@{
    completedAt = [DateTime]::UtcNow.ToString("o")
    samples = $samples
    result = $final
  }
  $output | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $PSScriptRoot "..\benchmark-report-$Difficulty.json") -Encoding UTF8
  $output.result | ConvertTo-Json -Depth 12
} finally {
  if ($socket.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
    $null = $socket.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "done", [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  }
  $socket.Dispose()
  if ($edgeProcess -and -not $edgeProcess.HasExited) {
    Stop-Process -Id $edgeProcess.Id -Force
  }
}
