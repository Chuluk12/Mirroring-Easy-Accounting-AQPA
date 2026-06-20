import DaftarPembelian from '../Pembelian/DaftarPembelian'

export default function LIWPurMkt() {
  return (
    <DaftarPembelian
      title="LIW PUR MKT"
      permissionModule="pembelian"
      filename="LIW_PUR_MKT"
      sheetName="LIW PUR MKT"
      excludeInternalSo
      showSummary={false}
      showSalesReferenceFields
      hiddenColumnKeys={[
        'no_pemasok',
        'harga_satuan_penjualan',
        'price',
        'ppn',
        'ppn_kode',
        'ppn_amount',
        'amount',
      ]}
      useLiwColumnOrder
    />
  )
}
