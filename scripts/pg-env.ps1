$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Get-QiEnv {
  param(
    [string[]]$Names,
    [string]$Default
  )

  foreach ($Name in $Names) {
    $Value = [Environment]::GetEnvironmentVariable($Name)
    if (-not [string]::IsNullOrWhiteSpace($Value)) {
      return $Value
    }
  }

  return $Default
}

function Resolve-QiPath {
  param([string]$PathValue)

  if ([System.IO.Path]::IsPathRooted($PathValue)) {
    return $PathValue
  }

  return [System.IO.Path]::GetFullPath((Join-Path $Root $PathValue))
}

$PgHost = Get-QiEnv -Names @("PGHOST", "POSTGRES_HOST") -Default "127.0.0.1"
$PgPort = Get-QiEnv -Names @("PGPORT", "POSTGRES_PORT") -Default "5432"
$PgUser = Get-QiEnv -Names @("PGUSER", "POSTGRES_USER") -Default "postgres"
$PgPassword = Get-QiEnv -Names @("PGPASSWORD", "POSTGRES_PASSWORD") -Default "postgres"
$DbName = Get-QiEnv -Names @("PGDATABASE", "POSTGRES_DB") -Default "quality_inspection"

$DefaultPgBin = Join-Path $Root "tools\postgresql\pgsql\bin"
$PgBin = Resolve-QiPath (Get-QiEnv -Names @("POSTGRES_BIN_DIR") -Default $DefaultPgBin)

$DataDir = Resolve-QiPath (Get-QiEnv -Names @("POSTGRES_DATA_DIR") -Default (Join-Path $Root "data\postgres"))
$DataRoot = Split-Path -Parent $DataDir
$PasswordFile = Resolve-QiPath (Get-QiEnv -Names @("POSTGRES_PASSWORD_FILE") -Default (Join-Path $DataRoot "pg_password.txt"))
$RuntimeLogFile = Resolve-QiPath (Get-QiEnv -Names @("POSTGRES_LOG_FILE") -Default (Join-Path $DataRoot "postgres-runtime.log"))
$InitLogFile = Resolve-QiPath (Get-QiEnv -Names @("POSTGRES_INIT_LOG_FILE") -Default (Join-Path $DataRoot "postgres.log"))

function Resolve-PgTool {
  param([string]$Name)

  foreach ($Ext in @(".exe", "")) {
    $Candidate = Join-Path $PgBin "$Name$Ext"
    if (Test-Path $Candidate) {
      return $Candidate
    }
  }

  foreach ($CommandName in @("$Name.exe", $Name)) {
    $Command = Get-Command $CommandName -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($Command) {
      return $Command.Source
    }
  }

  throw "PostgreSQL tool '$Name' not found. Put PostgreSQL binaries under '$PgBin', set POSTGRES_BIN_DIR, install PostgreSQL on PATH, or use docker-compose.postgres.yml."
}

function Set-PgClientEnv {
  $env:PGPASSWORD = $PgPassword
  $env:PGCLIENTENCODING = "UTF8"
}
