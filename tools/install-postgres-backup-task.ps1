[CmdletBinding()]
param(
    [string]$TaskName = "AQPA PostgreSQL Daily Backup",
    [string]$DailyAt = "01:00"
)

$ErrorActionPreference = "Stop"
$backupScript = (Resolve-Path (Join-Path $PSScriptRoot "postgres-backup.ps1")).Path
$powerShell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$action = New-ScheduledTaskAction -Execute $powerShell -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$backupScript`""
$trigger = New-ScheduledTaskTrigger -Daily -At $DailyAt
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
    -Description "Backup harian database aplikasi AQPA, verifikasi archive, checksum, dan retensi." -Force | Out-Null

Write-Host "Scheduled Task '$TaskName' aktif setiap hari pukul $DailyAt." -ForegroundColor Green
