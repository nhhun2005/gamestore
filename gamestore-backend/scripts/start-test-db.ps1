param([string]$PostgresBin = (Join-Path $PSScriptRoot '../target/pg-runtime/pgsql/bin'))
$ErrorActionPreference = 'Stop'
$backendRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$dataPath = [IO.Path]::GetFullPath((Join-Path $backendRoot 'target/commerce-postgres'))
if (!$dataPath.StartsWith((Join-Path $backendRoot 'target') + [IO.Path]::DirectorySeparatorChar)) { throw 'Invalid test cluster directory' }
$bin = [IO.Path]::GetFullPath($PostgresBin)
if (!(Test-Path -LiteralPath (Join-Path $bin 'initdb.exe'))) { throw 'Provide -PostgresBin pointing to PostgreSQL bin (initdb/pg_ctl/createdb/psql).' }
New-Item -ItemType Directory -Path (Join-Path $backendRoot 'target') -Force | Out-Null
if (!(Test-Path -LiteralPath (Join-Path $dataPath 'PG_VERSION'))) {
    & (Join-Path $bin 'initdb.exe') -D $dataPath -U commerce_test --auth=trust --locale=C --encoding=UTF8
    if ($LASTEXITCODE -ne 0) { throw 'Test initdb failed' }
}
& (Join-Path $bin 'pg_ctl.exe') -D $dataPath status
if ($LASTEXITCODE -ne 0) {
    if (Get-NetTCPConnection -LocalPort 55439 -State Listen -ErrorAction SilentlyContinue) { throw 'Port 55439 belongs to another process; refusing to alter it.' }
    & (Join-Path $bin 'pg_ctl.exe') -D $dataPath -l (Join-Path $backendRoot 'target/commerce-postgres.log') -o '-p 55439 -h 127.0.0.1' start
    if ($LASTEXITCODE -ne 0) { throw 'Test PostgreSQL startup failed' }
}
foreach ($database in @('commerce_test', 'commerce_live_test')) {
    $exists = & (Join-Path $bin 'psql.exe') -X -h 127.0.0.1 -p 55439 -U commerce_test -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$database'"
    if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the local test cluster' }
    if ($exists -ne '1') {
        & (Join-Path $bin 'createdb.exe') -h 127.0.0.1 -p 55439 -U commerce_test $database
        if ($LASTEXITCODE -ne 0) { throw "Could not create $database" }
    }
}
Write-Output 'Local test databases ready on 127.0.0.1:55439. No application database was modified.'
