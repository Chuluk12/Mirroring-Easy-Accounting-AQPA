# Easy Dashboard — Update: Modul Pembelian & Penjualan

## File yang Diupdate / Ditambahkan

### Backend (stockdashboard/)
| File | Status | Keterangan |
|------|--------|------------|
| `server.py` | **UPDATE** | Tambah endpoint `/api/pembelian`, `/api/penjualan`, permission guard semua endpoint |
| `auth.py`   | **UPDATE** | Tambah role purchasing & marketing, fungsi `get_all_roles()`, fix UNIQUE constraint roles |

### Frontend (easy-dashboard/src/)
| File | Status | Keterangan |
|------|--------|------------|
| `App.jsx` | **UPDATE** | Tambah route `/pembelian`, `/penjualan`, `/users` + PrivateRoute dengan cek modul |
| `components/MainLayout.jsx` | **UPDATE** | Sidebar group menu dinamis per permission, role badge di header |
| `pages/Pembelian.jsx` | **BARU** | Tabel daftar pembelian: filter tanggal, search, summary card |
| `pages/Penjualan.jsx` | **BARU** | Tabel daftar penjualan: filter tanggal, search, summary card |
| `pages/Users.jsx` | **BARU** | Manajemen user & permission: tambah/hapus user, preview akses per role |
| `context/AuthContext.jsx` | Tidak berubah | — |

---

## Cara Apply

### 1. Backend
```
Salin server.py → stockdashboard/server.py  (timpa yang lama)
Salin auth.py   → stockdashboard/auth.py    (timpa yang lama)
```

> ⚠️ Karena ada perubahan schema tabel `roles` (tambah UNIQUE constraint),
> **hapus `users.db` lama** agar dibuat ulang otomatis saat server start.
> User admin akan dibuat kembali dengan password `admin123`.

Restart server:
```bash
python server.py
```

### 2. Frontend
```
Salin App.jsx                     → easy-dashboard/src/App.jsx
Salin MainLayout.jsx              → easy-dashboard/src/components/MainLayout.jsx
Salin Pembelian.jsx               → easy-dashboard/src/pages/Pembelian.jsx
Salin Penjualan.jsx               → easy-dashboard/src/pages/Penjualan.jsx
Salin Users.jsx                   → easy-dashboard/src/pages/Users.jsx
Salin context/AuthContext.jsx     → easy-dashboard/src/context/AuthContext.jsx
```

Pastikan `dayjs` sudah terinstall (digunakan di Pembelian & Penjualan):
```bash
cd easy-dashboard
npm install dayjs
npm run dev
```

---

## Permission Matrix

| Modul              | admin | inventory | purchasing | marketing |
|--------------------|:-----:|:---------:|:----------:|:---------:|
| Dashboard          | ✅    | ✅        | ✅         | ✅        |
| Stok Barang        | ✅    | ✅        | ✅         | ✅        |
| Barang Baru        | ✅    | ✅        | ❌         | ❌        |
| Riwayat Persediaan | ✅    | ✅        | ❌         | ❌        |
| Daftar Penjualan   | ✅    | ❌        | ❌         | ✅        |
| Daftar Pembelian   | ✅    | ❌        | ✅         | ❌        |
| User & Permission  | ✅    | ❌        | ❌         | ❌        |

---

## Field yang Ditampilkan

### Pembelian (dari tabel PO + PODET + PERSONDATA)
`No PO` · `Tgl Pembelian` · `Tgl Ekspetasi` · `No Pemasok` · `Nama Pemasok`
· `Deskripsi PO` · `No Barang` · `Deskripsi Barang` · `Qty` · `UoM`
· `Harga Satuan` · `PPN (kode + rate)` · `Nominal PPN` · `Amount`

### Penjualan (dari tabel ARINV + ARINVDET + PERSONDATA)
`No Faktur` · `Tgl Penjualan` · `No Pelanggan` · `Nama Pelanggan` · `No PO`
· `Deskripsi` · `No Barang` · `Deskripsi Barang` · `Qty` · `UoM`
· `Harga Satuan` · `PPN (kode + rate)` · `Nominal PPN` · `Amount`

---

## Default Login
| Username | Password | Role |
|----------|----------|------|
| admin    | admin123 | admin |
