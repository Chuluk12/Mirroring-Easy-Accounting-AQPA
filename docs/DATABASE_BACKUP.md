# Perlindungan Database AQPA

## Backup manual dan otomatis

Jalankan backup kapan pun diperlukan:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\postgres-backup.ps1
```

Hasil backup berada di `backups/postgres/YYYY-MM-DD`. Setiap backup menggunakan
format custom PostgreSQL, diverifikasi dengan `pg_restore --list`, dan dilengkapi
checksum SHA-256. Retensi default adalah 30 hari.

Untuk membuat jadwal backup setiap hari pukul 01:00, jalankan PowerShell sebagai
Administrator:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\install-postgres-backup-task.ps1
```

Lokasi kedua dapat dikonfigurasi sebagai environment variable Windows:

```powershell
[Environment]::SetEnvironmentVariable(
  "AQPA_BACKUP_OFFSITE_PATH",
  "E:\AQPA-Database-Backup",
  "Machine"
)
```

Gunakan disk/NAS yang berbeda dari disk database. Setelah mengubah environment
variable, pasang ulang Scheduled Task agar proses berikutnya menerima konfigurasi.

## Uji pemulihan

Uji satu backup tanpa menyentuh database utama:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\postgres-restore-test.ps1 `
  -BackupFile ".\backups\postgres\YYYY-MM-DD\easy_dashboard_aqpa-YYYYMMDD-HHMMSS.dump"
```

Skrip membuat `easy_dashboard_aqpa_restore_test`, memulihkan backup, menghitung
tabel, lalu menghapus database test. Gunakan `-KeepTestDatabase` hanya jika hasil
restore ingin diperiksa manual.

## Checklist bulanan

1. Pastikan backup harian terbaru berstatus `SUCCESS` dan ukurannya masuk akal.
2. Pastikan salinan offsite tersedia.
3. Jalankan restore test pada backup terbaru.
4. Uji login dan alur penting apabila memakai `-KeepTestDatabase`.
5. Catat hasil pengujian dan tanggal pelaksanaannya.

## Pemisahan akun

Aplikasi saat ini melakukan migrasi tabel pada startup. Sebelum mengganti
`APP_DB_USER`, siapkan dua akun: akun migrasi/owner untuk perubahan struktur dan
akun runtime dengan hak data terbatas. Jangan mengganti `.env` langsung sebelum
startup migration dipisahkan dari runtime aplikasi.
