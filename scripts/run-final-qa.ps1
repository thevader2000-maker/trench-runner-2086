param(
  [int]$Port = 8092
)

$ErrorActionPreference = "Stop"
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$output = [System.IO.Path]::GetFullPath((Join-Path $root "qa-results"))
if (-not $output.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "QA output directory escaped the project root."
}
if (Test-Path -LiteralPath $output) {
  Get-ChildItem -LiteralPath $output -File |
    Where-Object { $_.Name -notlike "visual-server*" } |
    Remove-Item -Force
}
New-Item -ItemType Directory -Force -Path $output | Out-Null

$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$firefox = "C:\Program Files\Mozilla Firefox\firefox.exe"
foreach ($browser in @($chrome, $edge, $firefox)) {
  if (-not (Test-Path -LiteralPath $browser)) { throw "Required browser is missing: $browser" }
}

$playwrightRoot = Get-ChildItem -Path (Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\.pnpm") -Directory |
  Where-Object Name -Like "playwright@*" |
  Sort-Object Name -Descending |
  Select-Object -First 1
$playwrightCoreRoot = Get-ChildItem -Path (Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\.pnpm") -Directory |
  Where-Object Name -Like "playwright-core@*" |
  Sort-Object Name -Descending |
  Select-Object -First 1
if (-not $playwrightRoot -or -not $playwrightCoreRoot) {
  throw "The bundled Playwright runtime was not found."
}
$env:NODE_PATH = "$($playwrightRoot.FullName)\node_modules;$($playwrightCoreRoot.FullName)\node_modules"

while ($true) {
  $probe = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
  try {
    $probe.Start()
    $probe.Stop()
    break
  } catch {
    try { $probe.Stop() } catch {}
    $Port++
  }
}

$baseUrl = "http://127.0.0.1:$Port/"
$serverOut = Join-Path $output "server.log"
$serverErr = Join-Path $output "server-error.log"
$server = Start-Process -FilePath "powershell.exe" -ArgumentList @(
  "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
  (Join-Path $root "Start-TrenchRunner.ps1"),
  "-Mode", "submission", "-Port", $Port, "-NoBrowser"
) -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $serverOut -RedirectStandardError $serverErr -PassThru

$results = [System.Collections.Generic.List[object]]::new()
try {
  $ready = $false
  for ($attempt = 0; $attempt -lt 40 -and -not $ready; $attempt++) {
    Start-Sleep -Milliseconds 250
    try {
      $response = Invoke-WebRequest -Uri "${baseUrl}submission.html" -UseBasicParsing -TimeoutSec 2
      $ready = $response.StatusCode -eq 200
    } catch {}
  }
  if (-not $ready) { throw "Local QA server failed to start at $baseUrl" }

  $runs = @(
    @{ Browser = "chrome"; Path = $chrome; Width = 1920; Height = 1080; Profile = "desktop" },
    @{ Browser = "edge"; Path = $edge; Width = 2560; Height = 1440; Profile = "desktop" },
    @{ Browser = "chrome"; Path = $chrome; Width = 1366; Height = 768; Profile = "laptop" }
  )
  foreach ($run in $runs) {
    Write-Host "Testing $($run.Browser) $($run.Profile) $($run.Width)x$($run.Height)..."
    & node (Join-Path $PSScriptRoot "qa-chromium.cjs") `
      $run.Browser $run.Path $run.Width $run.Height $baseUrl $output $run.Profile | Out-Null
    $exitCode = $LASTEXITCODE
    $reportPath = Join-Path $output "$($run.Browser)-$($run.Profile)-$($run.Width)x$($run.Height).json"
    if (Test-Path -LiteralPath $reportPath) {
      $results.Add((Get-Content -Raw -LiteralPath $reportPath | ConvertFrom-Json))
    } else {
      $results.Add([pscustomobject]@{
        browser = $run.Browser
        profile = $run.Profile
        viewport = "$($run.Width)x$($run.Height)"
        passed = $false
        errors = @("QA process exited with code $exitCode before writing a report.")
        networkErrors = @()
      })
    }
  }

  Write-Host "Testing Firefox desktop 1920x1080..."
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "qa-firefox.ps1") `
    -BaseUrl $baseUrl -OutputDir "qa-results" | Out-Null
  $firefoxExit = $LASTEXITCODE
  $firefoxReport = Join-Path $output "firefox-desktop-1920x1080.json"
  if (Test-Path -LiteralPath $firefoxReport) {
    $results.Add((Get-Content -Raw -LiteralPath $firefoxReport | ConvertFrom-Json))
  } else {
    $results.Add([pscustomobject]@{
      browser = "firefox"
      profile = "desktop"
      viewport = "1920x1080"
      passed = $false
      errors = @("Firefox QA process exited with code $firefoxExit before writing a report.")
      networkErrors = @()
    })
  }

  $allPassed = @($results | Where-Object { -not $_.passed }).Count -eq 0
  $summary = [ordered]@{
    generatedAt = [DateTime]::UtcNow.ToString("o")
    passed = $allPassed
    methodology = [ordered]@{
      browsers = "Installed stable Chrome, Edge and Firefox executables"
      laptop = "1366x768 viewport, device scale factor 1, low effects and reduced motion"
      gamepad = "Deterministic standard Gamepad API simulation: left stick, RT and RB"
      physicalHardware = "A final physical laptop and controller spot check remains recommended before submission"
    }
    results = $results
  }
  $summary | ConvertTo-Json -Depth 15 | Set-Content -LiteralPath (Join-Path $output "final-qa-report.json") -Encoding UTF8

  $lines = [System.Collections.Generic.List[string]]::new()
  $lines.Add("# Final QA Report")
  $lines.Add("")
  $lines.Add("Overall: **$(if ($allPassed) { 'PASS' } else { 'FAIL' })**")
  $lines.Add("")
  $lines.Add("| Browser | Version | Profile | Viewport | Result | Console | Network |")
  $lines.Add("| --- | --- | --- | --- | --- | ---: | ---: |")
  foreach ($result in $results) {
    $lines.Add("| $($result.browser) | $($result.version) | $($result.profile) | $($result.viewport) | $(if ($result.passed) { 'PASS' } else { 'FAIL' }) | $(@($result.errors).Count) | $(@($result.networkErrors).Count) |")
  }
  $lines.Add("")
  $lines.Add("## Coverage")
  $lines.Add("")
  $lines.Add("- Installed Chrome at 1920x1080")
  $lines.Add("- Installed Edge at 2560x1440")
  $lines.Add("- Installed Firefox at 1920x1080")
  $lines.Add("- Laptop profile at 1366x768 with low effects, reduced motion and a 30 FPS floor")
  $lines.Add("- Standard Gamepad API input: left stick steering, RT dual fire and RB boost")
  $lines.Add("- Six decoded pre-rendered voice assets with active CONTROL playback")
  $lines.Add("- Browser console errors, uncaught page errors, failed requests and HTTP 4xx/5xx responses")
  $lines.Add("- Submission assets, trailer metadata, horizontal overflow and canvas sizing")
  $lines.Add("")
  $lines.Add("## Hardware Note")
  $lines.Add("")
  $lines.Add("Laptop and gamepad coverage is deterministic browser-level simulation. Perform one final spot check on the exact presentation laptop and physical controller before judging.")
  $lines | Set-Content -LiteralPath (Join-Path $root "FINAL_QA_REPORT.md") -Encoding UTF8

  if (-not $allPassed) { throw "Final QA found one or more failures. See FINAL_QA_REPORT.md and qa-results." }
  Write-Host "Final QA passed."
} finally {
  if ($server -and -not $server.HasExited) {
    Stop-Process -Id $server.Id -Force
  }
}
