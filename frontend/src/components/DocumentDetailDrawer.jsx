import { Descriptions, Drawer, Table, Tag, Typography } from 'antd'

const { Text } = Typography

function renderValue(value, render) {
  if (render) return render(value)
  if (value === null || value === undefined || value === '') return <Text type="secondary">-</Text>
  return value
}

export default function DocumentDetailDrawer({
  open,
  onClose,
  title,
  subtitle,
  record,
  fields = [],
  lineTitle = 'Detail Item',
  lineRows = [],
  lineColumns = [],
  width = 720,
  children,
}) {
  return (
    <Drawer
      title={
        <div>
          <div>{title || 'Detail Dokumen'}</div>
          {subtitle && <Text type="secondary" style={{ fontSize: 12 }}>{subtitle}</Text>}
        </div>
      }
      width={width}
      open={open}
      onClose={onClose}
      destroyOnClose
    >
      <Descriptions
        bordered
        size="small"
        column={1}
        labelStyle={{ width: 160, fontWeight: 600 }}
        style={{ marginBottom: 18 }}
      >
        {fields.map(field => (
          <Descriptions.Item key={field.key} label={field.label}>
            {renderValue(record?.[field.key], field.render)}
          </Descriptions.Item>
        ))}
      </Descriptions>

      {lineColumns.length > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <Text strong>{lineTitle}</Text>
            <Tag color="magenta">{lineRows.length} baris</Tag>
          </div>
          <Table
            rowKey={(row, index) => `${row.no_barang || row.no_spk || row.no_faktur || 'row'}-${index}`}
            columns={lineColumns}
            dataSource={lineRows}
            pagination={false}
            size="small"
            scroll={{ x: 760 }}
          />
        </>
      )}
      {children}
    </Drawer>
  )
}
