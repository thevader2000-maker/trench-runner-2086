param([int]$Port = 9260)

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

function Evaluate {
  param([System.Net.WebSockets.ClientWebSocket]$Socket, [ref]$Id, [string]$Expression)
  $Id.Value++
  Send-Cdp $Socket $Id.Value "Runtime.evaluate" @{ expression = $Expression; returnByValue = $true; awaitPromise = $true }
  $response = Receive-Cdp $Socket $Id.Value
  if ($response.result.exceptionDetails) { throw $response.result.exceptionDetails.text }
  return $response.result.result.value
}

$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$profile = Join-Path $env:TEMP ("trench-accessibility-" + [guid]::NewGuid().ToString("N"))
$url = "file:///" + ((Resolve-Path (Join-Path $root "index.html")).Path.Replace("\", "/"))
$process = Start-Process -FilePath $edge -ArgumentList @(
  "--headless=new", "--disable-gpu", "--allow-file-access-from-files", "--no-first-run",
  "--window-size=1280,900", "--force-device-scale-factor=1",
  "--remote-debugging-port=$Port", "--user-data-dir=$profile", $url
) -WindowStyle Hidden -PassThru

$socket = [System.Net.WebSockets.ClientWebSocket]::new()
try {
  $target = $null
  for ($attempt = 0; $attempt -lt 50 -and -not $target; $attempt++) {
    Start-Sleep -Milliseconds 200
    try {
      $targets = Invoke-RestMethod "http://127.0.0.1:$Port/json/list" -TimeoutSec 1
      $target = $targets | Where-Object { $_.url -like "*index.html*" } | Select-Object -First 1
    } catch {}
  }
  if (-not $target) { throw "Accessibility test page was not exposed by Edge." }

  $null = $socket.ConnectAsync([Uri]$target.webSocketDebuggerUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  $id = 0
  Start-Sleep -Seconds 2

  $defaults = Evaluate $socket ([ref]$id) "JSON.stringify({settings:window.TR_ACCESSIBILITY.snapshot(),aria:document.querySelector('#radioMessage').getAttribute('aria-live')})" | ConvertFrom-Json
  if (-not $defaults.settings.subtitles) { throw "Subtitles are not enabled by default." }
  if ($defaults.aria -ne "polite") { throw "Subtitle ARIA live region is missing." }

  $configured = Evaluate $socket ([ref]$id) @"
document.querySelector('#settingsButton').click();
document.querySelector('#subtitlesEnabled').value = 'true';
document.querySelector('#colorVisionMode').value = 'tritanopia';
document.querySelector('#reducedMotion').value = 'true';
const fireChanged = window.TR_ACCESSIBILITY.setBinding('fire', 'KeyF');
const duplicateRejected = !window.TR_ACCESSIBILITY.setBinding('boost', 'KeyF');
document.querySelector('#closeSettingsButton').click();
JSON.stringify({fireChanged, duplicateRejected, snapshot:window.TR_ACCESSIBILITY.snapshot(), bodyMode:document.body.dataset.colorVision, reduced:document.body.classList.contains('reduced-camera')})
"@ | ConvertFrom-Json

  if (-not $configured.fireChanged) { throw "Fire binding could not be changed." }
  if (-not $configured.duplicateRejected) { throw "Duplicate binding was not rejected." }
  if ($configured.snapshot.bindings.fire -ne "KeyF") { throw "Fire binding is not KeyF." }
  if ($configured.snapshot.bindings.boost -ne "ShiftLeft") { throw "Boost binding changed after duplicate assignment." }
  if ($configured.bodyMode -ne "tritanopia" -or -not $configured.reduced) { throw "Accessibility classes were not applied." }

  $id++
  Send-Cdp $socket $id "Page.reload"
  $null = Receive-Cdp $socket $id
  Start-Sleep -Seconds 2
  $persisted = Evaluate $socket ([ref]$id) "JSON.stringify({settings:window.TR_ACCESSIBILITY.snapshot(),bodyMode:document.body.dataset.colorVision,reduced:document.body.classList.contains('reduced-camera')})" | ConvertFrom-Json
  if ($persisted.settings.bindings.fire -ne "KeyF") { throw "Rebound key did not persist." }
  if ($persisted.settings.colorVision -ne "tritanopia" -or -not $persisted.settings.reducedMotion) { throw "Accessibility settings did not persist." }

  $fireWorks = Evaluate $socket ([ref]$id) @"
(async () => {
  document.querySelector('#startButton').click();
  document.querySelector('#skipButton').click();
  dispatchEvent(new KeyboardEvent('keydown', {code:'KeyF'}));
  await new Promise(resolve => setTimeout(resolve, 250));
  dispatchEvent(new KeyboardEvent('keyup', {code:'KeyF'}));
  return window.TR_BENCHMARK.snapshot().shots > 0;
})()
"@
  if (-not $fireWorks) { throw "The rebound fire key did not fire player shots." }

  $id++
  Send-Cdp $socket $id "Page.reload"
  $null = Receive-Cdp $socket $id
  Start-Sleep -Seconds 2
  $id++
  Send-Cdp $socket $id "Runtime.evaluate" @{ expression = "document.querySelector('#settingsButton').click()" }
  $null = Receive-Cdp $socket $id
  Start-Sleep -Milliseconds 500
  $id++
  Send-Cdp $socket $id "Page.captureScreenshot" @{ format = "png"; fromSurface = $true; captureBeyondViewport = $false }
  $shot = Receive-Cdp $socket $id
  [System.IO.File]::WriteAllBytes((Join-Path $root "press\accessibility-options.png"), [Convert]::FromBase64String($shot.result.data))

  $report = [ordered]@{
    testedAt = [DateTime]::UtcNow.ToString("o")
    subtitlesDefault = $defaults.settings.subtitles
    ariaLive = $defaults.aria
    colorVision = $persisted.settings.colorVision
    reducedMotion = $persisted.settings.reducedMotion
    fireBinding = $persisted.settings.bindings.fire
    reboundFireWorks = [bool]$fireWorks
    duplicateBindingRejected = $configured.duplicateRejected
    persistedAfterReload = $true
  }
  $report | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root "accessibility-report.json") -Encoding UTF8
  $report | ConvertTo-Json
} finally {
  if ($socket.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
    $null = $socket.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "done", [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  }
  $socket.Dispose()
  if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force }
}
