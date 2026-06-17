param(
  [switch]$Restart
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$RuntimeDir = Join-Path ([System.IO.Path]::GetTempPath()) "quality-inspection-system"
$BackendPort = if ($env:BACKEND_PORT) { [int]$env:BACKEND_PORT } else { 8787 }
$FrontendPort = if ($env:FRONTEND_PORT) { [int]$env:FRONTEND_PORT } else { 5173 }

function Resolve-Node {
  $command = Get-Command node -ErrorAction SilentlyContinue
  if (-not $command) {
    throw "Node.js was not found in PATH. Install Node.js 18+ or add node.exe to PATH."
  }
  return $command.Source
}

function Get-ListeningProcesses([int]$Port) {
  try {
    return @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
  } catch {
    return @()
  }
}

function Stop-Port([int]$Port) {
  $connections = Get-ListeningProcesses $Port
  foreach ($connection in $connections) {
    if ($connection.OwningProcess -and $connection.OwningProcess -ne $PID) {
      Stop-Process -Id $connection.OwningProcess -Force -ErrorAction SilentlyContinue
    }
  }
}

function Start-NodeProcess([string]$Name, [string]$Arguments, [string]$PidFile) {
  $process = Start-Process `
    -WindowStyle Hidden `
    -FilePath $script:NodePath `
    -ArgumentList $Arguments `
    -WorkingDirectory $Root `
    -PassThru
  Set-Content -LiteralPath $PidFile -Value $process.Id -Encoding ASCII
  Write-Host "$Name started. PID: $($process.Id)"
}

function Wait-Http([string]$Url, [string]$Name) {
  for ($i = 0; $i -lt 20; $i += 1) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing $Url -TimeoutSec 2
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        Write-Host "$Name ready: $Url"
        return
      }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }
  throw "$Name did not become ready: $Url"
}

New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
$script:NodePath = Resolve-Node

if ($Restart) {
  Stop-Port $BackendPort
  Stop-Port $FrontendPort
  Start-Sleep -Seconds 1
}

if ((Get-ListeningProcesses $BackendPort).Count -eq 0) {
  Start-NodeProcess "backend" "backend\src\server.js" (Join-Path $RuntimeDir "backend.pid")
} else {
  Write-Host "backend already listening on port $BackendPort"
}

if ((Get-ListeningProcesses $FrontendPort).Count -eq 0) {
  Start-NodeProcess "frontend" "frontend\server.js" (Join-Path $RuntimeDir "frontend.pid")
} else {
  Write-Host "frontend already listening on port $FrontendPort"
}

Wait-Http "http://127.0.0.1:$BackendPort/api/health" "backend"
Wait-Http "http://127.0.0.1:$FrontendPort" "frontend"

Write-Host ""
Write-Host "Open: http://127.0.0.1:$FrontendPort"
