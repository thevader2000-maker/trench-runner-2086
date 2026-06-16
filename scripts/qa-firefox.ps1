param(
  [int]$Port = 9275,
  [string]$BaseUrl = "http://127.0.0.1:8092/",
  [string]$OutputDir = "qa-results"
)

$ErrorActionPreference = "Stop"
$script:Events = [System.Collections.Generic.List[object]]::new()

function Send-Bidi {
  param([System.Net.WebSockets.ClientWebSocket]$Socket, [int]$Id, [string]$Method, [hashtable]$Params = @{})
  $payload = @{ id = $Id; method = $Method; params = $Params } | ConvertTo-Json -Compress -Depth 20
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
  $null = $Socket.SendAsync([ArraySegment[byte]]::new($bytes), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
}

function Receive-Bidi {
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
      if ($message.id -eq $ExpectedId) {
        if ($message.type -eq "error" -or $message.error) {
          throw "BiDi $($message.error): $($message.message)"
        }
        return $message
      }
      if ($message.method) { $script:Events.Add($message) }
    } finally {
      $stream.Dispose()
    }
  }
}

function Invoke-Bidi {
  param([System.Net.WebSockets.ClientWebSocket]$Socket, [ref]$Id, [string]$Method, [hashtable]$Params = @{})
  $Id.Value++
  Send-Bidi $Socket $Id.Value $Method $Params
  return Receive-Bidi $Socket $Id.Value
}

function Evaluate-Bidi {
  param([System.Net.WebSockets.ClientWebSocket]$Socket, [ref]$Id, [string]$Context, [string]$Expression)
  $response = Invoke-Bidi $Socket $Id "script.evaluate" @{
    expression = $Expression
    target = @{ context = $Context }
    awaitPromise = $true
    resultOwnership = "none"
  }
  if ($response.result.result.type -eq "exception") {
    throw "Firefox evaluation failed: $($response.result.result.exceptionDetails.text)"
  }
  return $response.result.result.value
}

function Get-EventErrors {
  $console = [System.Collections.Generic.List[string]]::new()
  $network = [System.Collections.Generic.List[object]]::new()
  foreach ($event in $script:Events) {
    if ($event.method -eq "log.entryAdded" -and $event.params.level -eq "error") {
      $console.Add([string]$event.params.text)
    }
    if ($event.method -eq "network.fetchError") {
      $isTrailerMetadataAbort = $event.params.errorText -eq "NS_BINDING_ABORTED" -and
        $event.params.request.url.EndsWith("/trailer/trench-runner-2086-trailer-final.mp4")
      if (-not $isTrailerMetadataAbort) {
        $network.Add([ordered]@{ url = $event.params.request.url; error = $event.params.errorText })
      }
    }
    if ($event.method -eq "network.responseCompleted" -and [int]$event.params.response.status -ge 400) {
      $network.Add([ordered]@{ url = $event.params.response.url; status = [int]$event.params.response.status })
    }
  }
  return @{ console = $console; network = $network }
}

$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$output = [System.IO.Path]::GetFullPath((Join-Path $root $OutputDir))
New-Item -ItemType Directory -Force -Path $output | Out-Null
$firefox = "C:\Program Files\Mozilla Firefox\firefox.exe"
$profile = Join-Path $env:TEMP ("trench-firefox-qa-" + [guid]::NewGuid().ToString("N"))
$stdout = Join-Path $env:TEMP ("trench-firefox-qa-" + [guid]::NewGuid().ToString("N") + ".log")
$stderr = Join-Path $env:TEMP ("trench-firefox-qa-" + [guid]::NewGuid().ToString("N") + ".err")
New-Item -ItemType Directory -Force -Path $profile | Out-Null
$process = Start-Process -FilePath $firefox -ArgumentList @(
  "--headless", "-no-remote", "--new-instance", "--profile", $profile, "--remote-debugging-port", $Port, "about:blank"
) -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru

$socket = [System.Net.WebSockets.ClientWebSocket]::new()
try {
  $connected = $false
  for ($attempt = 0; $attempt -lt 40 -and -not $connected; $attempt++) {
    Start-Sleep -Milliseconds 250
    try {
      $null = $socket.ConnectAsync([Uri]"ws://127.0.0.1:$Port/session", [Threading.CancellationToken]::None).GetAwaiter().GetResult()
      $connected = $true
    } catch {}
  }
  if (-not $connected) { throw "Firefox WebDriver BiDi endpoint was unavailable." }

  $id = 0
  $session = Invoke-Bidi $socket ([ref]$id) "session.new" @{
    capabilities = @{ alwaysMatch = @{ acceptInsecureCerts = $true } }
  }
  $null = Invoke-Bidi $socket ([ref]$id) "session.subscribe" @{
    events = @("log.entryAdded", "network.responseCompleted", "network.fetchError")
  }
  $contextResponse = Invoke-Bidi $socket ([ref]$id) "browsingContext.create" @{ type = "tab" }
  $context = $contextResponse.result.context
  $null = Invoke-Bidi $socket ([ref]$id) "browsingContext.setViewport" @{
    context = $context
    viewport = @{ width = 1920; height = 1080 }
    devicePixelRatio = 1
  }

  $pages = [System.Collections.Generic.List[object]]::new()
  $null = Invoke-Bidi $socket ([ref]$id) "browsingContext.navigate" @{
    context = $context
    url = "${BaseUrl}submission.html"
    wait = "complete"
  }
  Start-Sleep -Seconds 2
  $submission = Evaluate-Bidi $socket ([ref]$id) $context @"
JSON.stringify({
  title: document.title,
  images: [...document.images].filter(image => image.getAttribute('src')).map(image => ({src:image.getAttribute('src'),loaded:image.complete && image.naturalWidth > 0})),
  videoReady: document.querySelector('video')?.readyState >= 1,
  playLinks: document.querySelectorAll('a[href="index.html?jury"]').length,
  scrollWidth: document.documentElement.scrollWidth,
  innerWidth
})
"@ | ConvertFrom-Json
  $shot = Invoke-Bidi $socket ([ref]$id) "browsingContext.captureScreenshot" @{
    context = $context
    origin = "viewport"
  }
  [System.IO.File]::WriteAllBytes((Join-Path $output "firefox-desktop-submission-1920x1080.png"), [Convert]::FromBase64String($shot.result.data))
  $pages.Add([ordered]@{ page = "submission"; details = $submission })

  $null = Invoke-Bidi $socket ([ref]$id) "browsingContext.navigate" @{
    context = $context
    url = "${BaseUrl}index.html?jury"
    wait = "complete"
  }
  $ready = $false
  $stateHistory = [System.Collections.Generic.List[string]]::new()
  for ($attempt = 0; $attempt -lt 14 -and -not $ready; $attempt++) {
    Start-Sleep -Seconds 1
    $state = [string](Evaluate-Bidi $socket ([ref]$id) $context "window.TR_QA ? window.TR_QA.snapshot().state : 'loading'")
    $stateHistory.Add($state)
    if ($attempt -eq 2 -and $state -eq "briefing") {
      $null = Evaluate-Bidi $socket ([ref]$id) $context "document.querySelector('#skipButton').click(); 'briefing-skipped'"
    }
    $ready = $state -eq "playing"
  }
  if (-not $ready) {
    $diagnostic = Evaluate-Bidi $socket ([ref]$id) $context "JSON.stringify({href:location.href,search:location.search,readyState:document.readyState,qa:Boolean(window.TR_QA),body:document.body?.className || ''})"
    throw "Firefox game did not enter playing state. States: $($stateHistory -join ', '). Diagnostic: $diagnostic"
  }
  $game = Evaluate-Bidi $socket ([ref]$id) $context "JSON.stringify({qa:window.TR_QA.snapshot(),accessibility:window.TR_ACCESSIBILITY.snapshot(),canvas:{width:document.querySelector('#game').width,height:document.querySelector('#game').height},scrollWidth:document.documentElement.scrollWidth,innerWidth})" | ConvertFrom-Json
  $shot = Invoke-Bidi $socket ([ref]$id) "browsingContext.captureScreenshot" @{
    context = $context
    origin = "viewport"
  }
  [System.IO.File]::WriteAllBytes((Join-Path $output "firefox-desktop-game-1920x1080.png"), [Convert]::FromBase64String($shot.result.data))
  $pages.Add([ordered]@{ page = "game"; details = $game })

  Start-Sleep -Seconds 1
  $eventErrors = Get-EventErrors
  $layoutPassed = $submission.scrollWidth -le $submission.innerWidth -and
    $game.scrollWidth -le $game.innerWidth -and
    $game.qa.width -eq 1920 -and $game.qa.height -eq 1080
  $assetsPassed = @($submission.images | Where-Object { -not $_.loaded }).Count -eq 0 -and
    $submission.videoReady -and $submission.playLinks -eq 3
  $voicePassed = $game.qa.voiceAssets -eq 6
  $report = [ordered]@{
    browser = "firefox"
    version = $session.result.capabilities.browserVersion
    profile = "desktop"
    viewport = "1920x1080"
    passed = $layoutPassed -and $assetsPassed -and $voicePassed -and $eventErrors.console.Count -eq 0 -and $eventErrors.network.Count -eq 0
    checks = @{ layoutPassed = $layoutPassed; assetsPassed = $assetsPassed; voicePassed = $voicePassed }
    errors = $eventErrors.console
    networkErrors = $eventErrors.network
    pages = $pages
  }
  $report | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $output "firefox-desktop-1920x1080.json") -Encoding UTF8
  $report | ConvertTo-Json -Depth 8
  if (-not $report.passed) { exit 1 }
} finally {
  if ($context) {
    try { $null = Invoke-Bidi $socket ([ref]$id) "browsingContext.close" @{ context = $context } } catch {}
  }
  if ($socket.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
    try { $null = $socket.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "done", [Threading.CancellationToken]::None).GetAwaiter().GetResult() } catch {}
  }
  $socket.Dispose()
  if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force }
  if ($profile.StartsWith($env:TEMP, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $profile)) {
    Start-Sleep -Milliseconds 300
    try { Remove-Item -LiteralPath $profile -Recurse -Force } catch {}
  }
}
