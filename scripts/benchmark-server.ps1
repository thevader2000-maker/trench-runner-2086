$ErrorActionPreference = "Stop"

$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$port = 8087
$server = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
$server.Start()

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".js"   = "text/javascript; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".wav"  = "audio/wav"
  ".webm" = "video/webm"
  ".mp4"  = "video/mp4"
  ".png"  = "image/png"
  ".svg"  = "image/svg+xml"
  ".json" = "application/json"
}

try {
  while ($true) {
    $client = $server.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
      $requestLine = $reader.ReadLine()
      while ($reader.ReadLine()) {}
      $requestPath = ($requestLine -split " ")[1]
      $relative = [System.Uri]::UnescapeDataString(($requestPath -split "\?")[0]).TrimStart("/")
      if ([string]::IsNullOrWhiteSpace($relative)) { $relative = "index.html" }
      $candidate = [System.IO.Path]::GetFullPath((Join-Path $root $relative))

      if (-not $candidate.StartsWith($root) -or -not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
        $body = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
        $header = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
      } else {
        $body = [System.IO.File]::ReadAllBytes($candidate)
        $extension = [System.IO.Path]::GetExtension($candidate).ToLowerInvariant()
        $contentType = $mime[$extension]
        if (-not $contentType) { $contentType = "application/octet-stream" }
        $header = "HTTP/1.1 200 OK`r`nContent-Type: $contentType`r`nContent-Length: $($body.Length)`r`nCache-Control: no-cache`r`nConnection: close`r`n`r`n"
      }

      $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
      $stream.Write($headerBytes, 0, $headerBytes.Length)
      $stream.Write($body, 0, $body.Length)
      $stream.Flush()
    } finally {
      $client.Close()
    }
  }
} finally {
  $server.Stop()
}
