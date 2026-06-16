$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "pg-env.ps1")

$PgCtl = Resolve-PgTool "pg_ctl"
$PgIsReady = Resolve-PgTool "pg_isready"
$PidFile = Join-Path $DataDir "postmaster.pid"

if (-not (Test-Path $DataDir)) {
  throw "PostgreSQL data directory not found. Run npm run db:init first."
}

& $PgIsReady -h $PgHost -p $PgPort -q
if ($LASTEXITCODE -eq 0) {
  Write-Host "PostgreSQL is already accepting connections at ${PgHost}:$PgPort."
  exit 0
}

if (Test-Path $PidFile) {
  $PidText = (Get-Content -Path $PidFile -TotalCount 1 -ErrorAction SilentlyContinue)
  $PidNumber = 0
  if ([int]::TryParse($PidText, [ref]$PidNumber)) {
    $ExistingProcess = Get-Process -Id $PidNumber -ErrorAction SilentlyContinue
    if (-not $ExistingProcess) {
      Remove-Item -LiteralPath $PidFile -Force -ErrorAction Stop
      Write-Host "Removed stale PostgreSQL lock file: $PidFile"
    }
  }
}

New-Item -ItemType Directory -Force -Path $DataRoot | Out-Null
& $PgCtl -D $DataDir -l $RuntimeLogFile -o "-p $PgPort" -w start
