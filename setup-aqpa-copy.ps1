$ErrorActionPreference = "Stop"

$source = Split-Path -Parent $MyInvocation.MyCommand.Path
$parent = Split-Path -Parent $source
$destination = Join-Path $parent "Easy Dashboard AQPA"

if (Test-Path -LiteralPath $destination) {
  throw "Folder tujuan sudah ada: $destination"
}

robocopy $source $destination /E /XD ".git" /XF "vite-dev.log" "vite-dev.err.log"
$robocopyExitCode = $LASTEXITCODE
if ($robocopyExitCode -gt 7) {
  throw "Robocopy gagal dengan kode $robocopyExitCode"
}

@"
EASY_DB_HOST=127.0.0.1
EASY_DB_PORT=3999
EASY_DB_PATH=D:/EASY/AQPA.EASY6
EASY_DB_USER=SYSDBA
EASY_DB_PASSWORD=NewPassword123
EASY_BACKEND_PORT=5001
"@ | Set-Content -LiteralPath (Join-Path $destination "backend\.env") -Encoding UTF8

@"
VITE_API_BASE_URL=http://192.168.11.67:5001
VITE_API_PORT=5001
VITE_DEV_PORT=5175
VITE_PREVIEW_PORT=4175
"@ | Set-Content -LiteralPath (Join-Path $destination "frontend\.env") -Encoding UTF8

Write-Host "Selesai membuat clone AQPA di: $destination"
Write-Host "Backend AQPA : http://0.0.0.0:5001"
Write-Host "Frontend AQPA: http://0.0.0.0:5175"
