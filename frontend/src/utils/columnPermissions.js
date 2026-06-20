export function filterColumnsByPermission(module, columns, user) {
  const allowed = user?.column_permissions?.[module]
  if (!allowed || allowed.length === 0) return columns

  const allowedSet = new Set(allowed)
  return columns.filter(column => {
    if (!column.dataIndex || typeof column.dataIndex !== 'string') return true
    return allowedSet.has(column.dataIndex)
  })
}

export function filterExportColumnsByPermission(module, columns, user) {
  const allowed = user?.column_permissions?.[module]
  if (!allowed || allowed.length === 0) return columns

  const allowedSet = new Set(allowed)
  return columns.filter(column => allowedSet.has(column.key))
}
