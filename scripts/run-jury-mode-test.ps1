param(
  [int]$Port = 9255,
  [int]$TimeoutSeconds = 110
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
  $buffer = New-Object byte[] 262144
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
$profile = Join-Path $env:TEMP ("trench-jury-test-" + [guid]::NewGuid().ToString("N"))
$url = "file:///" + ((Resolve-Path (Join-Path $root "index.html")).Path.Replace("\", "/")) + "?jury&benchmark"
$process = Start-Process -FilePath $edge -ArgumentList @(
  "--headless=new", "--disable-gpu", "--disable-extensions", "--no-first-run", "--mute-audio",
  "--autoplay-policy=no-user-gesture-required", "--remote-debugging-port=$Port",
  "--user-data-dir=$profile", $url
) -WindowStyle Hidden -PassThru

$socket = [System.Net.WebSockets.ClientWebSocket]::new()
try {
  $target = $null
  for ($attempt = 0; $attempt -lt 50 -and -not $target; $attempt++) {
    Start-Sleep -Milliseconds 200
    try {
      $targets = Invoke-RestMethod "http://127.0.0.1:$Port/json/list" -TimeoutSec 1
      $target = $targets | Where-Object { $_.url -like "*index.html?jury&benchmark*" } | Select-Object -First 1
    } catch {}
  }
  if (-not $target) { throw "Jury test tab was not exposed by Edge." }

  $null = $socket.ConnectAsync([Uri]$target.webSocketDebuggerUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  $id = 0
  $started = [DateTime]::UtcNow
  $deadline = $started.AddSeconds($TimeoutSeconds)
  $samples = [System.Collections.Generic.List[object]]::new()
  $final = $null

  while ([DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Seconds 1
    $id++
    Send-Cdp $socket $id "Runtime.evaluate" @{
      expression = "JSON.stringify({jury:window.TR_JURY.snapshot(),benchmark:window.TR_BENCHMARK.snapshot(),result:window.TR_BENCHMARK.result()})"
      returnByValue = $true
    }
    $response = Receive-Cdp $socket $id
    $value = $response.result.result.value
    if (-not $value) { continue }
    $data = $value | ConvertFrom-Json
    $samples.Add($data.jury)
    if ($data.jury.state -eq "result") {
      $final = $data
      break
    }
  }
  if (-not $final) { throw "Jury mode did not finish within $TimeoutSeconds seconds." }

  $wallSeconds = ([DateTime]::UtcNow - $started).TotalSeconds
  if ($final.jury.ship -ne "vanguard") { throw "Jury mode selected $($final.jury.ship), expected vanguard." }
  if ($final.jury.difficulty -ne "ace") { throw "Jury mode selected $($final.jury.difficulty), expected ace." }
  if ($final.jury.seconds -gt 100) { throw "Jury mode exceeded 100 seconds: $($final.jury.seconds)." }
  if (-not $final.result.result.won) { throw "Automated Jury Run did not reach mission completion." }

  $report = [ordered]@{
    completedAt = [DateTime]::UtcNow.ToString("o")
    wallSeconds = [math]::Round($wallSeconds, 2)
    jury = $final.jury
    mission = $final.result.result
    phases = $final.result.phases
    samples = $samples
  }
  $report | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $root "jury-mode-report.json") -Encoding UTF8
  $report | ConvertTo-Json -Depth 6
} finally {
  if ($socket.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
    $null = $socket.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "done", [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  }
  $socket.Dispose()
  if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force }
}
