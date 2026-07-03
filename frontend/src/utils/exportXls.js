import dayjs from 'dayjs'
import api from '../api/client'

const escapeCell = (value) => (value ?? '').toString()
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

const escapeSheetName = (value, fallback = 'Sheet1') => {
  const sheetName = (value || fallback).toString()
    .replace(/[:*?/\\]/g, ' ')
    .replaceAll('[', ' ')
    .replaceAll(']', ' ')
    .trim()
  return escapeCell((sheetName || fallback).slice(0, 31))
}

const formatValue = (row, column) => {
  const value = row[column.key]
  if (column.type === 'date') return value ? dayjs(value).format('DD/MM/YYYY') : ''
  if (column.type === 'datetime') return value ? dayjs(value).format('DD/MM/YYYY HH:mm') : ''
  if (column.type === 'number') return Number(value || 0)
  return value ?? ''
}

const htmlCell = (row, column) => {
  const value = row[column.key]
  if (column.type === 'number') {
    const numberValue = Number(value || 0)
    return `<td style="text-align:right;mso-number-format:'#,##0.00';">${Number.isFinite(numberValue) ? numberValue : 0}</td>`
  }
  if (column.type === 'date') {
    const dateValue = value ? dayjs(value) : null
    const displayValue = dateValue?.isValid() ? dateValue.format('YYYY-MM-DD') : ''
    return `<td style="text-align:left;mso-number-format:'dd\\/mm\\/yyyy';">${escapeCell(displayValue)}</td>`
  }
  if (column.type === 'datetime') {
    const dateValue = value ? dayjs(value) : null
    const displayValue = dateValue?.isValid() ? dateValue.format('YYYY-MM-DD HH:mm:ss') : ''
    return `<td style="text-align:left;mso-number-format:'dd\\/mm\\/yyyy\\ hh:mm';">${escapeCell(displayValue)}</td>`
  }
  return `<td style="text-align:left;mso-number-format:'\\@';">${escapeCell(value ?? '')}</td>`
}

const xmlCell = (row, column, header = false) => {
  if (header) {
    return `<Cell ss:StyleID="Header"><Data ss:Type="String">${escapeCell(column.label)}</Data></Cell>`
  }
  if (column.type === 'number') {
    const numberValue = Number(row[column.key] || 0)
    return `<Cell ss:StyleID="Number"><Data ss:Type="Number">${Number.isFinite(numberValue) ? numberValue : 0}</Data></Cell>`
  }
  if (column.type === 'date' || column.type === 'datetime') {
    const dateValue = row[column.key] ? dayjs(row[column.key]) : null
    if (!dateValue?.isValid()) {
      return '<Cell ss:StyleID="Text"><Data ss:Type="String"></Data></Cell>'
    }
    const styleId = column.type === 'datetime' ? 'DateTime' : 'Date'
    return `<Cell ss:StyleID="${styleId}"><Data ss:Type="DateTime">${dateValue.format('YYYY-MM-DDTHH:mm:ss')}</Data></Cell>`
  }
  return `<Cell ss:StyleID="Text"><Data ss:Type="String">${escapeCell(row[column.key] ?? '')}</Data></Cell>`
}

export function downloadXLS(rows, columns, filename, sheetName = filename) {
  const header = columns.map(column => (
    `<th style="background:#217346;color:#ffffff;font-weight:bold;">${escapeCell(column.label)}</th>`
  )).join('')

  const body = rows.map(row => (
    `<tr>${columns.map(column => {
      return htmlCell(row, column)
    }).join('')}</tr>`
  )).join('')

  const safeSheetName = escapeCell(sheetName).slice(0, 31) || 'Sheet1'
  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:x="urn:schemas-microsoft-com:office:excel"
          xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
      <head>
        <meta charset="UTF-8" />
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>${safeSheetName}</x:Name>
                <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
      </head>
      <body>
        <table border="1">
          <thead><tr>${header}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </body>
    </html>
  `

  const blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}_${dayjs().format('YYYYMMDD_HHmm')}.xls`
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadWorkbookXLS(sheets, filename) {
  const worksheets = sheets.map((sheet, index) => {
    const columns = sheet.columns || []
    const rows = sheet.rows || []
    const header = `<Row>${columns.map(column => xmlCell({}, column, true)).join('')}</Row>`
    const body = rows.map(row => (
      `<Row>${columns.map(column => xmlCell(row, column)).join('')}</Row>`
    )).join('')

    return `
      <Worksheet ss:Name="${escapeSheetName(sheet.name, `Sheet${index + 1}`)}">
        <Table>
          ${header}
          ${body}
        </Table>
        <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
          <DisplayGridlines/>
        </WorksheetOptions>
      </Worksheet>
    `
  }).join('')

  const xml = `<?xml version="1.0"?>
    <?mso-application progid="Excel.Sheet"?>
    <Workbook
      xmlns="urn:schemas-microsoft-com:office:spreadsheet"
      xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
      <Styles>
        <Style ss:ID="Header">
          <Font ss:Bold="1" ss:Color="#FFFFFF"/>
          <Interior ss:Color="#217346" ss:Pattern="Solid"/>
        </Style>
        <Style ss:ID="Text">
          <NumberFormat ss:Format="@"/>
        </Style>
        <Style ss:ID="Number">
          <Alignment ss:Horizontal="Right"/>
          <NumberFormat ss:Format="#,##0.00"/>
        </Style>
        <Style ss:ID="Date">
          <NumberFormat ss:Format="dd/mm/yyyy"/>
        </Style>
        <Style ss:ID="DateTime">
          <NumberFormat ss:Format="dd/mm/yyyy hh:mm"/>
        </Style>
      </Styles>
      ${worksheets}
    </Workbook>
  `

  const blob = new Blob(['\uFEFF' + xml], { type: 'application/vnd.ms-excel;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}_${dayjs().format('YYYYMMDD_HHmm')}.xls`
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadHtmlXLS(html, filename, sheetName = filename) {
  const safeSheetName = escapeSheetName(sheetName)
  const documentHtml = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:x="urn:schemas-microsoft-com:office:excel"
          xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
      <head>
        <meta charset="UTF-8" />
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>${safeSheetName}</x:Name>
                <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
      </head>
      <body>${html}</body>
    </html>
  `

  const blob = new Blob(['\uFEFF' + documentHtml], { type: 'application/vnd.ms-excel;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}_${dayjs().format('YYYYMMDD_HHmm')}.xls`
  a.click()
  URL.revokeObjectURL(url)
}

export async function exportRowsToXLS({
  fetchRows,
  rows,
  columns,
  filename,
  sheetName,
  message,
  setExporting,
  loadingText = 'Mengambil data export...',
  emptyText = 'Tidak ada data untuk diekspor',
  successText,
  auditModule,
  auditDescription,
}) {
  setExporting?.(true)
  message?.loading?.({ content: loadingText, key: 'export', duration: 0 })
  try {
    const exportRows = fetchRows ? await fetchRows() : (rows || [])
    if (!exportRows.length) {
      message?.warning?.({ content: emptyText, key: 'export' })
      return
    }

    downloadWorkbookXLS([
      { name: sheetName || filename, columns, rows: exportRows },
    ], filename)
    try {
      await api.post('/api/audit/event', {
        action: 'export',
        module: auditModule || sheetName || filename,
        description: auditDescription || `Export ${sheetName || filename}`,
        metadata: {
          filename,
          sheetName: sheetName || filename,
          rows: exportRows.length,
        },
      })
    } catch {
      // Audit failure should not block the downloaded export.
    }
    message?.success?.({
      content: successText || `${exportRows.length} baris berhasil diekspor`,
      key: 'export',
    })
  } catch (error) {
    message?.error?.({ content: `Gagal export: ${error.message || 'error'}`, key: 'export' })
  } finally {
    setExporting?.(false)
  }
}
