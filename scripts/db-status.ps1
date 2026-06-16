$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "pg-env.ps1")

$PgCtl = Resolve-PgTool "pg_ctl"
$PgIsReady = Resolve-PgTool "pg_isready"

& $PgIsReady -h $PgHost -p $PgPort
if ($LASTEXITCODE -eq 0) {
  Write-Host "PostgreSQL is running and accepting connections."
  exit 0
}

& $PgCtl -D $DataDir status
