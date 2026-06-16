$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "pg-env.ps1")

$Psql = Resolve-PgTool "psql"

Set-PgClientEnv

Write-Host "Tables in database: $DbName"
& $Psql -h $PgHost -p $PgPort -U $PgUser -d $DbName -c "\dt"

Write-Host ""
Write-Host "Row counts:"
& $Psql -q -h $PgHost -p $PgPort -U $PgUser -d $DbName -c @"
create temp table temp_table_counts (
  table_name text,
  row_count bigint
) on commit drop;

do `$`$
declare
  table_record record;
  table_count bigint;
begin
  for table_record in
    select table_schema, table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
    order by table_name
  loop
    execute format('select count(*) from %I.%I', table_record.table_schema, table_record.table_name)
      into table_count;

    insert into temp_table_counts(table_name, row_count)
    values (table_record.table_schema || '.' || table_record.table_name, table_count);
  end loop;
end
`$`$;

select table_name, row_count
from temp_table_counts
order by table_name;
"@
