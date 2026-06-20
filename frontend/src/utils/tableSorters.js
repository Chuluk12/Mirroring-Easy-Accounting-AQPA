function normalizeValue(value) {
  if (value === null || value === undefined) return ''

  if (typeof value === 'number') return value

  const text = String(value).trim()
  if (!text) return ''

  const numeric = Number(text.replace(/\./g, '').replace(',', '.'))
  if (!Number.isNaN(numeric) && /^-?[\d.,]+$/.test(text)) return numeric

  const time = Date.parse(text)
  if (!Number.isNaN(time) && /^\d{4}-\d{2}-\d{2}|^\d{2}\/\d{2}\/\d{4}/.test(text)) {
    return time
  }

  return text.toLowerCase()
}

function compareValues(a, b) {
  const left = normalizeValue(a)
  const right = normalizeValue(b)

  if (typeof left === 'number' && typeof right === 'number') {
    return left - right
  }

  return String(left).localeCompare(String(right), 'id', {
    numeric: true,
    sensitivity: 'base',
  })
}

export function withTableSorters(columns) {
  return columns.map(column => {
    if (column.children) {
      return { ...column, children: withTableSorters(column.children) }
    }

    if (column.sorter || !column.dataIndex || typeof column.dataIndex !== 'string') {
      return column
    }

    return {
      ...column,
      sorter: (a, b) => compareValues(a[column.dataIndex], b[column.dataIndex]),
      sortDirections: ['ascend', 'descend'],
    }
  })
}
