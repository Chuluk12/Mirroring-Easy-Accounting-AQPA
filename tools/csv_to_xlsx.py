import csv
from datetime import date, datetime
import sys
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape


DATE_COLUMNS = {"tgl_faktur", "tanggal", "Tanggal"}

ACCOUNTING_COLUMNS = {
    "harga_satuan",
    "jumlah",
    "nilai_hpp",
    "gross_profit",
    "delivery",
    "delivery_ju",
    "cf",
    "mf",
    "biaya_project",
    "total_biaya",
    "laba_operasi",
    "nilai",
    "Nilai",
}

NUMBER_COLUMNS = {
    "qty_faktur",
}

PERCENT_COLUMNS = {
    "margin_pct",
}


def column_name(index):
    result = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        result = chr(65 + remainder) + result
    return result


def excel_date_serial(value):
    text = str(value or "").strip()
    if not text:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%Y-%m-%d %H:%M:%S"):
        try:
            parsed = datetime.strptime(text, fmt).date()
            break
        except ValueError:
            parsed = None
    if not parsed:
        return None
    # Excel's 1900 date system includes the historical leap-year bug.
    return (parsed - date(1899, 12, 30)).days


def cell_xml(row_index, col_index, header, value):
    ref = f"{column_name(col_index)}{row_index}"
    text = "" if value is None else str(value)
    if row_index == 1:
        return f'<c r="{ref}" s="5" t="inlineStr"><is><t>{escape(text)}</t></is></c>'
    if header in DATE_COLUMNS:
        serial = excel_date_serial(text)
        if serial is not None:
            return f'<c r="{ref}" s="1"><v>{serial}</v></c>'
    if header in ACCOUNTING_COLUMNS or header in NUMBER_COLUMNS or header in PERCENT_COLUMNS:
        normalized = text.replace(",", ".").strip()
        if normalized:
            try:
                number = float(normalized)
                style = 2 if header in ACCOUNTING_COLUMNS else 3 if header in NUMBER_COLUMNS else 4
                return f'<c r="{ref}" s="{style}"><v>{number:.10g}</v></c>'
            except ValueError:
                pass
    return f'<c r="{ref}" t="inlineStr"><is><t>{escape(text)}</t></is></c>'


def sheet_xml(rows):
    headers = rows[0] if rows else []
    last_column = column_name(len(headers)) if headers else "A"
    parts = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
        '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>',
        '<cols>',
    ]
    for index, header in enumerate(headers, start=1):
        width = 14
        if header in {"deskripsi_barang", "nama_pelanggan"}:
            width = 32
        elif header in ACCOUNTING_COLUMNS:
            width = 18
        elif header in DATE_COLUMNS:
            width = 12
        parts.append(f'<col min="{index}" max="{index}" width="{width}" customWidth="1"/>')
    parts.extend([
        '</cols>',
        '<sheetData>',
    ])
    for row_index, row in enumerate(rows, start=1):
        parts.append(f'<row r="{row_index}">')
        for col_index, value in enumerate(row, start=1):
            header = headers[col_index - 1] if col_index <= len(headers) else ""
            parts.append(cell_xml(row_index, col_index, header, value))
        parts.append("</row>")
    if len(rows) > 1:
        parts.append(f'<autoFilter ref="A1:{last_column}{len(rows)}"/>')
    parts.extend(["</sheetData>", "</worksheet>"])
    return "".join(parts)


def write_xlsx(csv_path, xlsx_path):
    with open(csv_path, newline="", encoding="utf-8-sig") as handle:
        rows = list(csv.reader(handle))

    files = {
        "[Content_Types].xml": """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>""",
        "_rels/.rels": """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>""",
        "xl/workbook.xml": """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Profit Loss" sheetId="1" r:id="rId1"/></sheets>
</workbook>""",
        "xl/_rels/workbook.xml.rels": """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>""",
        "xl/styles.xml": """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="4">
<numFmt numFmtId="164" formatCode="dd/mm/yyyy"/>
<numFmt numFmtId="165" formatCode="_(&quot;Rp&quot;* #,##0.00_);_(&quot;Rp&quot;* (#,##0.00);_(&quot;Rp&quot;* &quot;-&quot;??_);_(@_)"/>
<numFmt numFmtId="166" formatCode="#,##0.0000"/>
<numFmt numFmtId="167" formatCode="0.00"/>
</numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9EAF7"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
</cellXfs>
</styleSheet>""",
        "xl/worksheets/sheet1.xml": sheet_xml(rows),
    }

    with zipfile.ZipFile(xlsx_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, content in files.items():
            archive.writestr(name, content)

    print(xlsx_path)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: csv_to_xlsx.py input.csv output.xlsx")
    write_xlsx(Path(sys.argv[1]), Path(sys.argv[2]))
