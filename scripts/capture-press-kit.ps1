param(
  [int]$Port = 9245,
  [switch]$ScenesOnly
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

function Capture-Frame {
  param(
    [System.Net.WebSockets.ClientWebSocket]$Socket,
    [ref]$Id,
    [string]$Path
  )
  $Id.Value++
  Send-Cdp $Socket $Id.Value "Page.captureScreenshot" @{
    format = "png"
    fromSurface = $true
    captureBeyondViewport = $false
  }
  $response = Receive-Cdp $Socket $Id.Value
  [System.IO.File]::WriteAllBytes($Path, [Convert]::FromBase64String($response.result.data))
}

$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$press = Join-Path $root "press\screenshots"
New-Item -ItemType Directory -Force -Path $press | Out-Null

$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$profile = Join-Path $env:TEMP ("trench-press-" + [guid]::NewGuid().ToString("N"))
$previewUrl = "file:///" + ((Resolve-Path (Join-Path $root "trailer\preview-trailer.html")).Path.Replace("\", "/"))
$menuUrl = "file:///" + ((Resolve-Path (Join-Path $root "index.html")).Path.Replace("\", "/"))
$startUrl = if ($ScenesOnly) { $menuUrl } else { $previewUrl }
$edgeProcess = Start-Process -FilePath $edge -ArgumentList @(
  "--headless=new", "--disable-gpu", "--allow-file-access-from-files", "--no-first-run",
  "--autoplay-policy=no-user-gesture-required", "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
  "--window-size=1920,1080", "--force-device-scale-factor=1",
  "--remote-debugging-port=$Port", "--user-data-dir=$profile", $startUrl
) -WindowStyle Hidden -PassThru

$socket = [System.Net.WebSockets.ClientWebSocket]::new()
try {
  $target = $null
  for ($attempt = 0; $attempt -lt 50 -and -not $target; $attempt++) {
    Start-Sleep -Milliseconds 200
    try {
      $targets = Invoke-RestMethod "http://127.0.0.1:$Port/json/list" -TimeoutSec 1
      $target = $targets | Where-Object { $_.type -eq "page" -and $_.url -notlike "edge://*" } | Select-Object -First 1
    } catch {}
  }
  if (-not $target) { throw "Press-kit preview tab unavailable." }

  $null = $socket.ConnectAsync([Uri]$target.webSocketDebuggerUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  $id = 0
  $id++
  Send-Cdp $socket $id "Emulation.setDeviceMetricsOverride" @{
    width = 1920
    height = 1080
    deviceScaleFactor = 1
    mobile = $false
  }
  $null = Receive-Cdp $socket $id

  $shots = @(
    @{ Second = 6;  Name = "02-dual-laser-first-contact.png" },
    @{ Second = 13; Name = "03-trench-formation-combat.png" },
    @{ Second = 22; Name = "04-retro-vector-mode.png" },
    @{ Second = 29; Name = "05-archon-reveal.png" },
    @{ Second = 39; Name = "06-event-horizon.png" },
    @{ Second = 47; Name = "07-critical-escape.png" },
    @{ Second = 52; Name = "08-mission-finale.png" },
    @{ Second = 57; Name = "09-final-title-card.png" }
  )

  if (-not $ScenesOnly) {
    $elapsed = 0
    foreach ($shot in $shots) {
      Start-Sleep -Milliseconds (($shot.Second - $elapsed) * 1000)
      $elapsed = $shot.Second
      Capture-Frame $socket ([ref]$id) (Join-Path $press $shot.Name)
    }

    $id++
    Send-Cdp $socket $id "Page.navigate" @{ url = $menuUrl }
    $null = Receive-Cdp $socket $id
    Start-Sleep -Seconds 3
    Capture-Frame $socket ([ref]$id) (Join-Path $press "01-menu-key-art.png")
  }

  $scenes = @(
    @{ Scene = "archon"; Name = "05-archon-reveal.png" },
    @{ Scene = "event-horizon"; Name = "06-event-horizon.png" },
    @{ Scene = "escape"; Name = "07-critical-escape.png" },
    @{ Scene = "finale"; Name = "08-mission-finale.png" }
  )
  foreach ($scene in $scenes) {
    $id++
    Send-Cdp $socket $id "Page.navigate" @{ url = "${menuUrl}?capture=$($scene.Scene)" }
    $null = Receive-Cdp $socket $id
    Start-Sleep -Milliseconds 1500
    Capture-Frame $socket ([ref]$id) (Join-Path $press $scene.Name)
  }

  Get-ChildItem -LiteralPath $press -Filter "*.png" |
    Sort-Object Name |
    Select-Object Name, Length, LastWriteTime
} finally {
  if ($socket.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
    $null = $socket.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "done", [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  }
  $socket.Dispose()
  if ($edgeProcess -and -not $edgeProcess.HasExited) { Stop-Process -Id $edgeProcess.Id -Force }
}
