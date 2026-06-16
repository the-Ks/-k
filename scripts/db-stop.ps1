$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "pg-env.ps1")

$PgCtl = Resolve-PgTool "pg_ctl"

& $PgCtl -D $DataDir status | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Project PostgreSQL data directory is not running."
  exit 0
}

& $PgCtl -D $DataDir -w stop
