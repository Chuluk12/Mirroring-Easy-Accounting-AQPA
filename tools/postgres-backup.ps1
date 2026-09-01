[CmdletBinding()]
param(
    [string]$EnvFile = (Join-Path $PSScriptRoot "..\backend\.env"),
    [string]$BackupRoot = (Join-Path $PSScriptRoot "..\backups\postgres"),
    [int]$RetentionDays = 30,
    [string]$OffsitePath = $env:AQPA_BACKUP_OFFSITE_PATH
)

$ErrorActionPreference = "Stop"

function Read-DotEnv([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "File konfigurasi tidak ditemukan: $Path"
    }

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
        Sort-Object FullName -Descending |
        Select-Object -First 1
    if ($candidate) { return $candidate.FullName }
    throw "$Name tidak ditemukan. Pastikan PostgreSQL client tools terpasang."
}

$config = Read-DotEnv $EnvFile
$hostName = if ($config.APP_DB_HOST) { $config.APP_DB_HOST } else { "127.0.0.1" }
$port = if ($config.APP_DB_PORT) { $config.APP_DB_PORT } else { "5432" }
$database = $config.APP_DB_NAME
$user = $config.APP_DB_USER
$password = $config.APP_DB_PASSWORD

if (-not $database -or -not $user) {
    throw "APP_DB_NAME dan APP_DB_USER wajib tersedia di $EnvFile"
}

$pgDump = Find-PostgresTool "pg_dump"
$pgRestore = Find-PostgresTool "pg_restore"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$dayFolder = Join-Path $BackupRoot (Get-Date -Format "yyyy-MM-dd")
New-Item -ItemType Directory -Path $dayFolder -Force | Out-Null

$backupFile = Join-Path $dayFolder "$database-$timestamp.dump"
$logFile = Join-Path $dayFolder "$database-$timestamp.log"
$checksumFile = "$backupFile.sha256"

$previousPassword = $env:PGPASSWORD
try {
    $env:PGPASSWORD = $password
    & $pgDump --host $hostName --port $port --username $user --dbname $database `
        --format custom --compress=6 --no-password --file $backupFile 2>&1 |
        Tee-Object -FilePath $logFile
    if ($LASTEXITCODE -ne 0) { throw "pg_dump gagal dengan exit code $LASTEXITCODE" }

    if (-not (Test-Path -LiteralPath $backupFile) -or (Get-Item $backupFile).Length -eq 0) {
        throw "File backup tidak terbentuk atau berukuran 0 byte."
    }

    & $pgRestore --list $backupFile | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Verifikasi pg_restore --list gagal." }

    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $backupFile).Hash.ToLowerInvariant()
    "$hash  $([IO.Path]::GetFileName($backupFile))" | Set-Content -LiteralPath $checksumFile -Encoding ascii

    if ($OffsitePath) {
        $offsiteDay = Join-Path $OffsitePath (Get-Date -Format "yyyy-MM-dd")
        New-Item -ItemType Directory -Path $offsiteDay -Force | Out-Null
        Copy-Item -LiteralPath $backupFile, $checksumFile -Destination $offsiteDay -Force
    }

    if ($RetentionDays -gt 0 -and (Test-Path -LiteralPath $BackupRoot)) {
        $cutoff = (Get-Date).AddDays(-$RetentionDays)
        Get-ChildItem -LiteralPath $BackupRoot -Directory |
            Where-Object { $_.LastWriteTime -lt $cutoff } |
            Remove-Item -Recurse -Force
    }

    [pscustomobject]@{
        Status = "SUCCESS"
        Database = $database
        Backup = $backupFile
        SizeMB = [math]::Round((Get-Item $backupFile).Length / 1MB, 2)
        SHA256 = $hash
        Offsite = if ($OffsitePath) { $OffsitePath } else { "Belum dikonfigurasi" }
    } | Format-List
}
finally {
    $env:PGPASSWORD = $previousPassword
}
