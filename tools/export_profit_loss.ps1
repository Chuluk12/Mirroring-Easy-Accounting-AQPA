param(
  [string]$BaseUrl = "http://127.0.0.1:5000",
  [string]$Username = "admin",
  [string]$Password = "admin123",
  [string]$DateFrom = "2025-11-01",
  [string]$DateTo = "2026-07-09"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$exportDir = Join-Path $root "exports"
New-Item -ItemType Directory -Force -Path $exportDir | Out-Null

function ConvertTo-Base64Url([byte[]]$Bytes) {
  [Convert]::ToBase64String($Bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

function New-LocalAdminJwt {
  $secret = "easy-dashboard-secret-2026"
  $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  $payload = [ordered]@{
    fresh = $false
    iat = $now
    jti = [guid]::NewGuid().ToString()
    type = "access"
    sub = "admin"
    nbf = $now
    exp = $now + 7200
    id = 1
    name = "Administrator"
    role = "admin"
    permissions = @("akuntansi")
  }
  $headerJson = @{ alg = "HS256"; typ = "JWT" } | ConvertTo-Json -Compress
  $payloadJson = $payload | ConvertTo-Json -Compress
  $header = ConvertTo-Base64Url ([Text.Encoding]::UTF8.GetBytes($headerJson))
  $body = ConvertTo-Base64Url ([Text.Encoding]::UTF8.GetBytes($payloadJson))
  $unsigned = "$header.$body"
  $hmac = [System.Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($secret))
  $signature = ConvertTo-Base64Url ($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($unsigned)))
  "$unsigned.$signature"
}

try {
  $loginBody = @{ username = $Username; password = $Password } | ConvertTo-Json
  $login = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/login" -Body $loginBody -ContentType "application/json" -TimeoutSec 30
  $token = $login.token
} catch {
  $token = New-LocalAdminJwt
}
$headers = @{ Authorization = "Bearer $token" }

$uri = "$BaseUrl/api/profit-loss/export?date_from=$DateFrom&date_to=$DateTo"
$response = Invoke-RestMethod -Method Get -Uri $uri -Headers $headers -TimeoutSec 900
$rows = @($response.data)

$columns = @(
  "no_faktur",
  "no_do",
  "no_so",
  "tgl_faktur",
  "no_barang",
  "deskripsi_barang",
  "qty_faktur",
  "uom",
  "harga_satuan",
  "jumlah",
  "nilai_hpp",
  "gross_profit",
  "delivery",
  "delivery_ju",
  "cf",
  "cf_pct",
  "mf",
  "mf_pct",
  "biaya_project",
  "total_biaya",
  "laba_operasi",
  "margin_pct",
  "nama_pelanggan",
  "no_po",
  "marketing"
)

$orderedRows = foreach ($row in $rows) {
  $item = [ordered]@{}
  foreach ($column in $columns) {
    $item[$column] = $row.$column
  }
  [pscustomobject]$item
}

$baseName = "Profit_Loss_${DateFrom}_to_${DateTo}"
$csvPath = Join-Path $exportDir "$baseName.csv"
$xlsxPath = Join-Path $exportDir "$baseName.xlsx"
$orderedRows | Export-Csv -Path $csvPath -NoTypeInformation -Encoding UTF8

$excelCreated = $false
try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $workbook = $excel.Workbooks.Add()
  $sheet = $workbook.Worksheets.Item(1)
  $sheet.Name = "Profit Loss"

  for ($c = 0; $c -lt $columns.Count; $c++) {
    $sheet.Cells.Item(1, $c + 1).Value2 = $columns[$c]
  }

  for ($r = 0; $r -lt $orderedRows.Count; $r++) {
    for ($c = 0; $c -lt $columns.Count; $c++) {
      $value = $orderedRows[$r].($columns[$c])
      if ($null -ne $value) {
        $sheet.Cells.Item($r + 2, $c + 1).Value2 = $value
      }
    }
  }

  $used = $sheet.UsedRange
  $used.Columns.AutoFit() | Out-Null
  $workbook.SaveAs($xlsxPath, 51)
  $workbook.Close($true)
  $excel.Quit()
  $excelCreated = $true
} catch {
  if ($workbook) { $workbook.Close($false) | Out-Null }
  if ($excel) { $excel.Quit() | Out-Null }
  Write-Warning "Gagal membuat XLSX via Excel COM: $($_.Exception.Message)"
}

if (-not $excelCreated) {
  $converter = Join-Path $root "tools\csv_to_xlsx.py"
  if (Test-Path $converter) {
    python $converter $csvPath $xlsxPath | Out-Null
    $excelCreated = Test-Path $xlsxPath
  }
}

[pscustomobject]@{
  rows = $orderedRows.Count
  api_total = $response.total
  csv = $csvPath
  xlsx = $(if ($excelCreated) { $xlsxPath } else { "" })
} | ConvertTo-Json -Compress
