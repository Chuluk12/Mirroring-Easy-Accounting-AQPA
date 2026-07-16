import dayjs from 'dayjs'
import api from '../api/client'

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

const textEncoder = new TextEncoder()

const escapeXml = value => (value ?? '').toString()
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;')

const safeSheetName = (value, fallback = 'Sheet1') => {
  const sheetName = (value || fallback).toString()
    .replace(/[:*?/\\[\]]/g, ' ')
    .trim()
  return (sheetName || fallback).slice(0, 31)
}

const safeTableName = value => {
  const base = (value || 'Table').toString()
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/^([^A-Za-z_])/, '_$1')
    .slice(0, 240)
  return base || 'Table'
}

const uniqueTableColumnLabels = columns => {
  const counts = new Map()
  return columns.map((column, index) => {
    const base = (column.label || `Column ${index + 1}`).toString().trim() || `Column ${index + 1}`
    const count = counts.get(base) || 0
    counts.set(base, count + 1)
    return count ? `${base}_${count + 1}` : base
  })
}

const columnLetter = index => {
  let n = index + 1
  let result = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    result = String.fromCharCode(65 + rem) + result
    n = Math.floor((n - 1) / 26)
  }
  return result
}

const cellRef = (rowIndex, colIndex) => `${columnLetter(colIndex)}${rowIndex + 1}`

const toExcelDateSerial = value => {
  const date = value ? dayjs(value) : null
  if (!date?.isValid()) return null
  const utc = Date.UTC(date.year(), date.month(), date.date(), date.hour(), date.minute(), date.second())
  return utc / 86400000 + 25569
}

const normalizeNumber = value => {
  if (value === null || value === undefined || value === '') return null
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

const normalizeKeyLabel = column => `${column.key || ''} ${column.label || ''}`.toLowerCase()

const isOrdinalColumn = column => {
  const key = String(column.key || '').trim().toLowerCase()
  const label = String(column.label || '').trim().toLowerCase().replace(/\./g, '')
  return key === 'no' && ['no', 'nomor', 'no urut', 'nomor urut'].includes(label)
}

const normalizeExportColumns = columns => (columns || []).filter(column => !isOrdinalColumn(column))

const inferColumnType = column => {
  if (column.type === 'currency' || column.type === 'accounting') return 'currency'
  if (column.type === 'date' || column.type === 'datetime' || column.type === 'number') return column.type

  const text = normalizeKeyLabel(column)
  if (/(^|[^a-z0-9])(tgl|tanggal|date)([^a-z0-9]|$)/.test(text) || text.includes('jatuh tempo') || text.includes('estimasi')) {
    return 'date'
  }
  return column.type || 'text'
}

const isCurrencyColumn = column => {
  const inferredType = inferColumnType(column)
  if (inferredType === 'currency') return true
  if (inferredType !== 'number') return false

  const text = normalizeKeyLabel(column)
  return [
    'amount', 'nilai', 'harga', 'price', 'cost', 'biaya', 'dpp', 'ppn', 'pph',
    'diskon', 'discount', 'uang muka', 'terbayar', 'terhutang', 'saldo',
    'balance', 'limit', 'rab', 'realisasi', 'selisih', 'profit', 'hpp',
    'sales', 'actual', 'target', 'gap', 'piutang', 'faktur', 'add cost', 'subtotal',
  ].some(token => text.includes(token))
}

const styleIdForColumn = column => {
  const type = inferColumnType(column)
  if (isCurrencyColumn(column)) return 3
  if (type === 'date') return 4
  if (type === 'datetime') return 5
  if (type === 'number') return 2
  return 0
}

const xlsxCell = (value, column, rowIndex, colIndex, isHeader = false) => {
  const ref = cellRef(rowIndex, colIndex)
  if (isHeader) {
    return `<c r="${ref}" t="inlineStr" s="1"><is><t>${escapeXml(column.label)}</t></is></c>`
  }

  const type = inferColumnType(column)
  if (type === 'date' || type === 'datetime') {
    const serial = toExcelDateSerial(value)
    if (serial === null) return `<c r="${ref}" s="${styleIdForColumn(column)}"/>`
    return `<c r="${ref}" s="${styleIdForColumn(column)}"><v>${serial}</v></c>`
  }

  if (type === 'number' || type === 'currency' || type === 'accounting') {
    const numberValue = normalizeNumber(value)
    if (numberValue === null) return `<c r="${ref}" s="${styleIdForColumn(column)}"/>`
    return `<c r="${ref}" s="${styleIdForColumn(column)}"><v>${numberValue}</v></c>`
  }

  return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value ?? '')}</t></is></c>`
}

const columnWidth = column => {
  const type = inferColumnType(column)
  if (column.width) return Math.max(8, Math.min(60, Number(column.width) || 14))
  if (isCurrencyColumn(column)) return 18
  if (type === 'date' || type === 'datetime') return type === 'datetime' ? 20 : 14
  return Math.max(10, Math.min(40, String(column.label || '').length + 4))
}

const worksheetXml = (sheet, index) => {
  const columns = normalizeExportColumns(sheet.columns)
  const rows = sheet.rows || []
  const rowCount = rows.length + 1
  const colCount = Math.max(columns.length, 1)
  const ref = `A1:${columnLetter(colCount - 1)}${Math.max(rowCount, 1)}`
  const colsXml = columns.map((column, colIndex) => (
    `<col min="${colIndex + 1}" max="${colIndex + 1}" width="${columnWidth(column)}" customWidth="1"/>`
  )).join('')
  const headerXml = `<row r="1">${columns.map((column, colIndex) => xlsxCell(column.label, column, 0, colIndex, true)).join('')}</row>`
  const bodyXml = rows.map((row, rowIndex) => (
    `<row r="${rowIndex + 2}">${columns.map((column, colIndex) => xlsxCell(row[column.key], column, rowIndex + 1, colIndex)).join('')}</row>`
  )).join('')
  const hasTable = rows.length && columns.length
  const autoFilter = hasTable ? '' : `<autoFilter ref="${ref}"/>`
  const tablePart = hasTable ? '<tableParts count="1"><tablePart r:id="rId1"/></tableParts>' : ''

  return `${XML_DECL}
<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">
  <dimension ref="${ref}"/>
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>${colsXml}</cols>
  <sheetData>${headerXml}${bodyXml}</sheetData>
  ${autoFilter}
  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
  ${tablePart}
</worksheet>`
}

const worksheetRelsXml = tableId => `${XML_DECL}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table${tableId}.xml"/>
</Relationships>`

const tableXml = (sheet, tableId) => {
  const columns = normalizeExportColumns(sheet.columns)
  const rows = sheet.rows || []
  const ref = `A1:${columnLetter(Math.max(columns.length, 1) - 1)}${Math.max(rows.length + 1, 1)}`
  const tableLabels = uniqueTableColumnLabels(columns)
  const tableColumns = tableLabels.map((label, index) => (
    `<tableColumn id="${index + 1}" name="${escapeXml(label)}"/>`
  )).join('')

  return `${XML_DECL}
<table xmlns="${NS_MAIN}" id="${tableId}" name="${safeTableName(sheet.name)}_${tableId}" displayName="${safeTableName(sheet.name)}_${tableId}" ref="${ref}" totalsRowShown="0">
  <autoFilter ref="${ref}"/>
  <tableColumns count="${columns.length}">${tableColumns}</tableColumns>
  <tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/>
</table>`
}

const stylesXml = () => `${XML_DECL}
<styleSheet xmlns="${NS_MAIN}">
  <numFmts count="4">
    <numFmt numFmtId="164" formatCode="#,##0.00"/>
    <numFmt numFmtId="165" formatCode="&quot;Rp&quot; #,##0.00;[Red]&quot;Rp&quot; -#,##0.00;&quot;Rp&quot; -"/>
    <numFmt numFmtId="166" formatCode="dd/mm/yyyy"/>
    <numFmt numFmtId="167" formatCode="dd/mm/yyyy hh:mm"/>
  </numFmts>
  <fonts count="2">
    <font><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF087FF5"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="6">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`

const workbookXml = sheets => `${XML_DECL}
<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">
  <sheets>
    ${sheets.map((sheet, index) => `<sheet name="${escapeXml(safeSheetName(sheet.name, `Sheet${index + 1}`))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}
  </sheets>
</workbook>`

const workbookRelsXml = sheets => `${XML_DECL}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}
  <Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`

const contentTypesXml = (sheets, tables) => `${XML_DECL}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  ${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
  ${tables.map(tableId => `<Override PartName="/xl/tables/table${tableId}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>`).join('')}
</Types>`

const rootRelsXml = () => `${XML_DECL}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`

const coreXml = () => `${XML_DECL}
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>AQPA Dashboard</dc:creator>
  <cp:lastModifiedBy>AQPA Dashboard</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified>
</cp:coreProperties>`

const appXml = () => `${XML_DECL}
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>AQPA Dashboard</Application>
</Properties>`

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let c = index
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

const crc32 = data => {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i += 1) {
    crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

const dosDateTime = () => {
  const now = new Date()
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2)
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()
  return { time, date }
}

const writeU16 = (view, offset, value) => view.setUint16(offset, value, true)
const writeU32 = (view, offset, value) => view.setUint32(offset, value, true)

const createZip = files => {
  const { time, date } = dosDateTime()
  const localParts = []
  const centralParts = []
  let offset = 0

  files.forEach(file => {
    const nameBytes = textEncoder.encode(file.name)
    const dataBytes = textEncoder.encode(file.content)
    const crc = crc32(dataBytes)

    const localHeader = new Uint8Array(30 + nameBytes.length)
    const localView = new DataView(localHeader.buffer)
    writeU32(localView, 0, 0x04034b50)
    writeU16(localView, 4, 20)
    writeU16(localView, 6, 0)
    writeU16(localView, 8, 0)
    writeU16(localView, 10, time)
    writeU16(localView, 12, date)
    writeU32(localView, 14, crc)
    writeU32(localView, 18, dataBytes.length)
    writeU32(localView, 22, dataBytes.length)
    writeU16(localView, 26, nameBytes.length)
    writeU16(localView, 28, 0)
    localHeader.set(nameBytes, 30)
    localParts.push(localHeader, dataBytes)

    const centralHeader = new Uint8Array(46 + nameBytes.length)
    const centralView = new DataView(centralHeader.buffer)
    writeU32(centralView, 0, 0x02014b50)
    writeU16(centralView, 4, 20)
    writeU16(centralView, 6, 20)
    writeU16(centralView, 8, 0)
    writeU16(centralView, 10, 0)
    writeU16(centralView, 12, time)
    writeU16(centralView, 14, date)
    writeU32(centralView, 16, crc)
    writeU32(centralView, 20, dataBytes.length)
    writeU32(centralView, 24, dataBytes.length)
    writeU16(centralView, 28, nameBytes.length)
    writeU16(centralView, 30, 0)
    writeU16(centralView, 32, 0)
    writeU16(centralView, 34, 0)
    writeU16(centralView, 36, 0)
    writeU32(centralView, 38, 0)
    writeU32(centralView, 42, offset)
    centralHeader.set(nameBytes, 46)
    centralParts.push(centralHeader)

    offset += localHeader.length + dataBytes.length
  })

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0)
  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  writeU32(endView, 0, 0x06054b50)
  writeU16(endView, 8, files.length)
  writeU16(endView, 10, files.length)
  writeU32(endView, 12, centralSize)
  writeU32(endView, 16, offset)

  return new Blob([...localParts, ...centralParts, end], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

function downloadBlob(blob, filename, extension = 'xlsx') {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}_${dayjs().format('YYYYMMDD_HHmm')}.${extension}`
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadWorkbookXLS(sheets, filename) {
  const normalizedSheets = (sheets || []).map((sheet, index) => ({
    ...sheet,
    name: safeSheetName(sheet.name, `Sheet${index + 1}`),
    columns: normalizeExportColumns(sheet.columns),
    rows: sheet.rows || [],
  }))
  const tableIds = normalizedSheets
    .map((sheet, index) => (sheet.rows.length ? index + 1 : null))
    .filter(Boolean)

  const files = [
    { name: '[Content_Types].xml', content: contentTypesXml(normalizedSheets, tableIds) },
    { name: '_rels/.rels', content: rootRelsXml() },
    { name: 'docProps/core.xml', content: coreXml() },
    { name: 'docProps/app.xml', content: appXml() },
    { name: 'xl/workbook.xml', content: workbookXml(normalizedSheets) },
    { name: 'xl/_rels/workbook.xml.rels', content: workbookRelsXml(normalizedSheets) },
    { name: 'xl/styles.xml', content: stylesXml() },
  ]

  normalizedSheets.forEach((sheet, index) => {
    const sheetId = index + 1
    files.push({ name: `xl/worksheets/sheet${sheetId}.xml`, content: worksheetXml(sheet, index) })
    if (sheet.rows.length) {
      files.push({ name: `xl/worksheets/_rels/sheet${sheetId}.xml.rels`, content: worksheetRelsXml(sheetId) })
      files.push({ name: `xl/tables/table${sheetId}.xml`, content: tableXml(sheet, sheetId) })
    }
  })

  downloadBlob(createZip(files), filename, 'xlsx')
}

export function downloadXLS(rows, columns, filename, sheetName = filename) {
  downloadWorkbookXLS([{ name: sheetName, columns, rows }], filename)
}

export function downloadHtmlXLS(html, filename, sheetName = filename) {
  const blob = new Blob([`<html><head><meta charset="UTF-8" /></head><body>${html}</body></html>`], {
    type: 'application/vnd.ms-excel;charset=utf-8;',
  })
  downloadBlob(blob, filename, 'xls')
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
