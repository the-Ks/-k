$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "pg-env.ps1")

$InitDb = Resolve-PgTool "initdb"
$PgCtl = Resolve-PgTool "pg_ctl"
$Createdb = Resolve-PgTool "createdb"
$Psql = Resolve-PgTool "psql"

New-Item -ItemType Directory -Force -Path $DataRoot | Out-Null

if (-not (Test-Path $PasswordFile)) {
  Set-Content -Path $PasswordFile -Value $PgPassword -NoNewline
}

if (-not (Test-Path $DataDir)) {
  & $InitDb -D $DataDir -U $PgUser -A scram-sha-256 "--pwfile=$PasswordFile" -E UTF8 --locale=C
}

& $PgCtl -D $DataDir status | Out-Null
if ($LASTEXITCODE -ne 0) {
  & $PgCtl -D $DataDir -l $InitLogFile -o "-p $PgPort" -w start
}

Set-PgClientEnv

$DbExists = (& $Psql -h $PgHost -p $PgPort -U $PgUser -d postgres -tAc "select 1 from pg_database where datname = '$DbName'").Trim()
if ($DbExists -ne "1") {
  & $Createdb -h $PgHost -p $PgPort -U $PgUser $DbName
}
& $Psql -h $PgHost -p $PgPort -U $PgUser -d $DbName -v ON_ERROR_STOP=1 -f (Join-Path $Root "database\postgresql\001_init.sql")
& $Psql -h $PgHost -p $PgPort -U $PgUser -d $DbName -v ON_ERROR_STOP=1 -f (Join-Path $Root "database\postgresql\003_message_media.sql")
& $Psql -h $PgHost -p $PgPort -U $PgUser -d $DbName -v ON_ERROR_STOP=1 -f (Join-Path $Root "database\postgresql\002_seed_demo.sql")

Write-Host "Database is ready: postgres://$PgUser:****@${PgHost}:$PgPort/$DbName"
