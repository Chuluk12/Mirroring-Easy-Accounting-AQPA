[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$BackupFile,
    [string]$EnvFile = (Join-Path $PSScriptRoot "..\backend\.env"),
    [string]$TestDatabase = "easy_dashboard_aqpa_restore_test",
    [switch]$KeepTestDatabase
)

$ErrorActionPreference = "Stop"

function Read-DotEnv([string]$Path) {
    $values = @{}
    foreach ($line in Get-Content -LiteralPath $Path) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#") -or -not $trimmed.Contains("=")) { continue }
        $name, $value = $trimmed.Split("=", 2)
        $values[$name.Trim()] = $value.Trim().Trim('"').Trim("'")
    }
    return $values
}

function Find-PostgresTool([string]$Name) {
    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    $candidate = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\$Name.exe" -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending | Select-Object -First 1
    if ($candidate) { return $candidate.FullName }
    throw "$Name tidak ditemukan."
}

if (-not (Test-Path -LiteralPath $BackupFile)) { throw "Backup tidak ditemukan: $BackupFile" }
if ($TestDatabase -notmatch '^[a-zA-Z_][a-zA-Z0-9_]*$') { throw "Nama database test tidak valid." }

$config = Read-DotEnv $EnvFile
$hostName = if ($config.APP_DB_HOST) { $config.APP_DB_HOST } else { "127.0.0.1" }
$port = if ($config.APP_DB_PORT) { $config.APP_DB_PORT } else { "5432" }
$user = $config.APP_DB_USER
$password = $config.APP_DB_PASSWORD
$psql = Find-PostgresTool "psql"
$pgRestore = Find-PostgresTool "pg_restore"
$previousPassword = $env:PGPASSWORD

try {
    $env:PGPASSWORD = $password
    & $psql --host $hostName --port $port --username $user --dbname postgres --no-password `
        --set ON_ERROR_STOP=1 --command "DROP DATABASE IF EXISTS $TestDatabase WITH (FORCE);" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Gagal membersihkan database test." }

    & $psql --host $hostName --port $port --username $user --dbname postgres --no-password `
        --set ON_ERROR_STOP=1 --command "CREATE DATABASE $TestDatabase;" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Gagal membuat database test." }

    & $pgRestore --host $hostName --port $port --username $user --dbname $TestDatabase `
        --no-password --exit-on-error --no-owner --no-privileges $BackupFile
    if ($LASTEXITCODE -ne 0) { throw "Restore test gagal." }

    $tableCount = (& $psql --host $hostName --port $port --username $user --dbname $TestDatabase `
        --no-password --tuples-only --no-align --command `
        "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';").Trim()
    if ($LASTEXITCODE -ne 0 -or [int]$tableCount -lt 1) { throw "Restore selesai tetapi tidak menemukan tabel aplikasi." }

    Write-Host "RESTORE TEST SUCCESS: $tableCount tabel ditemukan di $TestDatabase" -ForegroundColor Green
}
finally {
    if (-not $KeepTestDatabase -and $psql -and $user) {
        & $psql --host $hostName --port $port --username $user --dbname postgres --no-password `
            --command "DROP DATABASE IF EXISTS $TestDatabase WITH (FORCE);" 2>$null | Out-Null
    }
    $env:PGPASSWORD = $previousPassword
}
