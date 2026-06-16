param([int]$Port = 9250)

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

function Set-Viewport {
  param([System.Net.WebSockets.ClientWebSocket]$Socket, [ref]$Id, [int]$Width, [int]$Height, [bool]$Mobile)
  $Id.Value++
  Send-Cdp $Socket $Id.Value "Emulation.setDeviceMetricsOverride" @{
    width = $Width
    height = $Height
    deviceScaleFactor = 1
    mobile = $Mobile
  }
  $null = Receive-Cdp $Socket $Id.Value
}

function Evaluate {
  param([System.Net.WebSockets.ClientWebSocket]$Socket, [ref]$Id, [string]$Expression)
  $Id.Value++
  Send-Cdp $Socket $Id.Value "Runtime.evaluate" @{ expression = $Expression; returnByValue = $true }
  return Receive-Cdp $Socket $Id.Value
}

function Capture {
  param([System.Net.WebSockets.ClientWebSocket]$Socket, [ref]$Id, [string]$Path)
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
$preview = Join-Path $root "press\submission-preview"
New-Item -ItemType Directory -Force -Path $preview | Out-Null

$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$profile = Join-Path $env:TEMP ("trench-submission-" + [guid]::NewGuid().ToString("N"))
$url = "file:///" + ((Resolve-Path (Join-Path $root "submission.html")).Path.Replace("\", "/"))
$process = Start-Process -FilePath $edge -ArgumentList @(
  "--headless=new", "--disable-gpu", "--allow-file-access-from-files", "--no-first-run",
  "--window-size=1440,1100", "--force-device-scale-factor=1",
  "--remote-debugging-port=$Port", "--user-data-dir=$profile", $url
) -WindowStyle Hidden -PassThru

$socket = [System.Net.WebSockets.ClientWebSocket]::new()
try {
  $target = $null
  for ($attempt = 0; $attempt -lt 50 -and -not $target; $attempt++) {
    Start-Sleep -Milliseconds 200
    try {
      $targets = Invoke-RestMethod "http://127.0.0.1:$Port/json/list" -TimeoutSec 1
      $target = $targets | Where-Object { $_.url -like "*submission.html*" } | Select-Object -First 1
    } catch {}
  }
  if (-not $target) { throw "Submission page was not exposed by Edge." }

  $null = $socket.ConnectAsync([Uri]$target.webSocketDebuggerUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  $id = 0
  Set-Viewport $socket ([ref]$id) 1440 1100 $false
  Start-Sleep -Seconds 2
  $check = Evaluate $socket ([ref]$id) @"
JSON.stringify({
  title: document.title,
  videoReady: document.querySelector('video').readyState >= 1,
  galleryImages: [...document.querySelectorAll('.gallery img')].filter(image => image.complete && image.naturalWidth > 0).length,
  galleryItems: document.querySelectorAll('.gallery-item').length,
  playLinks: [...document.querySelectorAll('a[href^="index.html"]')].length,
  lightboxWorks: (() => {
    document.querySelector('.gallery-item').click();
    const open = document.querySelector('#lightbox').open;
    document.querySelector('#lightbox').close();
    return open;
  })()
})
"@
  Set-Content -LiteralPath (Join-Path $preview "submission-check.json") -Value $check.result.result.value -Encoding UTF8
  Capture $socket ([ref]$id) (Join-Path $preview "submission-desktop.png")

  $null = Evaluate $socket ([ref]$id) "document.querySelector('#gallery').scrollIntoView(); true"
  Start-Sleep -Milliseconds 800
  Capture $socket ([ref]$id) (Join-Path $preview "submission-gallery.png")

  Set-Viewport $socket ([ref]$id) 390 844 $true
  $id++
  Send-Cdp $socket $id "Page.navigate" @{ url = $url }
  $null = Receive-Cdp $socket $id
  Start-Sleep -Seconds 2
  Capture $socket ([ref]$id) (Join-Path $preview "submission-mobile.png")

  Get-ChildItem -LiteralPath $preview -Filter "*.png" | Select-Object FullName, Length
} finally {
  if ($socket.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
    $null = $socket.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "done", [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  }
  $socket.Dispose()
  if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force }
}
