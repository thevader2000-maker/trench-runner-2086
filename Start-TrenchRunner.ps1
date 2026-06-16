param(
  [ValidateSet("game", "jury", "submission")]
  [string]$Mode = "game",
  [int]$Port = 8086,
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

$root = [System.IO.Path]::GetFullPath((Split-Path -Parent $MyInvocation.MyCommand.Path))
$startPage = if ($Mode -eq "submission") { "submission.html" } elseif ($Mode -eq "jury") { "index.html?jury" } else { "index.html" }
$listener = $null

for ($candidatePort = $Port; $candidatePort -lt ($Port + 20); $candidatePort++) {
  try {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $candidatePort)
    $listener.Start()
    $Port = $candidatePort
    break
  } catch {
    if ($listener) {
      try { $listener.Stop() } catch {}
      $listener = $null
    }
  }
}

if (-not $listener) {
  throw "No free local port was found between $Port and $($Port + 19)."
}

$baseUrl = "http://127.0.0.1:$Port/"
$startUrl = $baseUrl + $startPage
if (-not $NoBrowser) {
  Start-Process $startUrl
}

Write-Host ""
Write-Host "TRENCH RUNNER 2086 // LOCAL FLIGHT SERVER"
Write-Host "Mode: $Mode"
Write-Host "Open: $startUrl"
Write-Host "Close this window to stop the server."
Write-Host ""

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".js"   = "text/javascript; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".txt"  = "text/plain; charset=utf-8"
  ".md"   = "text/plain; charset=utf-8"
  ".wav"  = "audio/wav"
  ".webm" = "video/webm"
  ".mp4"  = "video/mp4"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".svg"  = "image/svg+xml"
  ".json" = "application/json; charset=utf-8"
}

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
      $requestLine = $reader.ReadLine()
      while ($reader.ReadLine()) {}

      $requestParts = $requestLine -split " "
      $method = $requestParts[0]
      $requestPath = $requestParts[1]
      $relative = [System.Uri]::UnescapeDataString(($requestPath -split "\?")[0]).TrimStart("/")
      if ([string]::IsNullOrWhiteSpace($relative)) { $relative = $startPage }
      $candidate = [System.IO.Path]::GetFullPath((Join-Path $root $relative))

      if (
        -not $candidate.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase) -or
        -not (Test-Path -LiteralPath $candidate -PathType Leaf)
      ) {
        $body = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
        $status = "404 Not Found"
        $contentType = "text/plain; charset=utf-8"
      } else {
        $body = [System.IO.File]::ReadAllBytes($candidate)
        $status = "200 OK"
        $extension = [System.IO.Path]::GetExtension($candidate).ToLowerInvariant()
        $contentType = $mime[$extension]
        if (-not $contentType) { $contentType = "application/octet-stream" }
      }

      $header = "HTTP/1.1 $status`r`nContent-Type: $contentType`r`nContent-Length: $($body.Length)`r`nCache-Control: no-cache`r`nX-Content-Type-Options: nosniff`r`nConnection: close`r`n`r`n"
      $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
      $stream.Write($headerBytes, 0, $headerBytes.Length)
      if ($method -ne "HEAD") {
        $stream.Write($body, 0, $body.Length)
      }
      $stream.Flush()
    } finally {
      $client.Close()
    }
  }
} finally {
  $listener.Stop()
}
