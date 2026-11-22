# Starlite — Pemantauan Perjanjian Kerja Sama Mitra

Aplikasi Vendor Management PT Integrasi Jaringan Ekosistem untuk memantau perjanjian jasa kerja sama dengan mitra, dari pengiriman dokumen sampai arsip final.

## Jenis perjanjian

| Kode | Nama | Template | Lembar spreadsheet |
|---|---|---|---|
| `PKS` | Perjanjian Homepass (PKS PJ) | PDF terkunci (`src/templates/pks-jasa.js`), isian kuning ditimpa | `PKS PJ` |
| `MS` | PKS MS & SPK MS (satu paket) | Word bertanda `{{kunci}}` (`templates/pks-ms.docx`, `templates/spk-ms.docx`), Word → PDF lewat jembatan Google, digabung jadi satu PDF | `PKS MS & SPK MS` |

## Alur (sama untuk kedua jenis)

| Tahap | Proses | Aktor | PROGRES di spreadsheet |
|---|---|---|---|
| 0 | Draf dari data info perseroan (isian lain boleh dilengkapi mitra) | Akun Utama | DRAFT DI BUAT / REVIEW DRAFT |
| 1 | Email ke mitra (lampiran + tautan) | Sistem | DONE EMAIL TO MITRA |
| 2 | Mitra melengkapi data (penandatangan: Direktur atau diwakili; MS: rekening, gudang, lead time IKR) dan menyetujui | Mitra | FEEDBACK MITRA / REVIEW DRAFT |
| 3 | Legal mengisi nomor (MS: nomor PKS MS + nomor SPK MS) lewat tautan + PIN | Legal | REVIEW LEGAL IJE |
| 4–5 | Nomor dicetak, dokumen bernomor dikirim ke mitra untuk TTD basah | Sistem | NO PKS RILIS → PROSES SIGN MITRA |
| 6 | Scan TTD basah mitra (diperiksa) atau hasil fitur Signing | Mitra / Admin TTD | DONE SIGN MITRA → PROSES SIGN IJE |
| 7 | Scan final TTD basah kedua pihak (atau hasil Signing), arsip ke Drive, salinan ke mitra | Admin TTD / Akun Utama | DONE SIGN IJE → DONE |

Menu Perjanjian hanya untuk Akun Utama. Legal dan **Admin TTD** (pengejar tanda tangan, halaman `/admin-ttd.html`) masuk dengan email terdaftar + PIN 4 angka; daftarnya dikelola di Pengaturan.

## Data: spreadsheet + dokumen

- Data setiap perjanjian ditulis ke **VM Starlite Sheet** (lembar di atas, kunci baris kolom `NO ID` = kode perjanjian). Hanya kolom yang diisi aplikasi yang diubah; kolom lain tetap.
- Setiap perubahan menandai baris "antre", dikirim di latar belakang setelah permintaan selesai, dan dicoba ulang oleh cron 15 menit bila gagal. Status per perjanjian terlihat di halaman detail dan Pengaturan.
- Dokumen (draf, bernomor, scan) disimpan di Cloudflare; hanya dokumen final yang disalin ke Google Drive.

## Arsitektur

- **Cloudflare Workers** (`src/`) — API (Hono) + aset statis (`public/`) + cron 15 menit (pengingat, balasan email).
- **D1 `starlite-pks`** — seluruh data Starlite (tabel `pks_*`). Migrasi di `migrations/`.
- **D1 `starlite-vm`** — hanya **dibaca**, khusus tabel `mitra` (info perseroan). Kode menolak perintah selain `SELECT` ke database ini.
- **Apps Script Web App** (`apps-script/Starlite.gs`) — jembatan ke Google di akun `vendor.management@weave.co.id`: berkas ke Google Drive (`{Mitra}/{Kode}/{01 Master … 05 Final}` di bawah folder induk) dan email lewat Gmail; balasan mitra dibaca per thread.
- **Login** — email + password di tabel `pks_pengguna` (D1 `starlite-pks`), hash PBKDF2-SHA256, sesi cookie HttpOnly (token di-hash di `pks_sesi`), kunci akun 15 menit setelah 5 kali gagal. Tanpa Cloudflare Access.

Integritas: setiap berkas dicatat SHA-256; metadata dokumen dan audit log dikunci trigger database; berkas yang berubah di luar aplikasi ditandai "tidak sesuai".

## Menjalankan lokal

```bash
npm install
cp .dev.vars.example .dev.vars
./scripts/reset-local.sh      # DB lokal + data uji (tidak menyentuh Cloudflare)
npx wrangler dev              # http://127.0.0.1:8787
node scripts/demo.mjs         # opsional: data demo semua tahap
```

Mode dev: email disimulasikan dan berkas disimpan di tabel `pks_blob` (maks 1,9 MB). Semua pengguna uji berpassword `Uji-Starlite-2026`.

## Pengujian

```bash
npm test                      # unit + jembatan Apps Script (16)
node test/e2e.mjs             # alur penuh API + keamanan + login (77), butuh wrangler dev
node test/ui.mjs              # UI di Chrome nyata (27), butuh wrangler dev + Chrome
```

## Deploy

1. **Paket Workers berbayar disarankan** ($5/bulan). Penempelan TTD pada PDF butuh waktu CPU melebihi batas paket gratis.
2. **Apps Script** (login sebagai `vendor.management@weave.co.id`):
   1. script.google.com → Project baru → tempel isi `apps-script/Starlite.gs` (satu file saja). Pilih fungsi `izinkan` → Run → setujui izin Gmail dan Drive.
   2. Project Settings → Script properties → tambah `KEY` = kunci acak panjang (mis. 40 karakter).
   3. Deploy → New deployment → Web app: *Execute as* **Me**, *Who has access* **Anyone**. Salin URL `/exec`.
   4. Pastikan akun itu Editor di folder Drive induk (`DRIVE_ROOT_FOLDER`).
   5. Setiap mengubah kode `.gs`: jalankan `izinkan` sekali (bila ada izin baru, mis. Spreadsheet), lalu Deploy → Manage deployments → Edit → Version baru (URL tetap).
   6. Akun itu harus Editor di VM Starlite Sheet (properti opsional `SHEET_ID`).
3. Secret Worker:
   ```bash
   npx wrangler secret put APPS_SCRIPT_URL      # URL /exec
   npx wrangler secret put APPS_SCRIPT_KEY      # sama dengan properti KEY
   npx wrangler secret put ADMIN_PASSWORD_AWAL  # password masuk pertama admin (wajib diganti saat masuk)
   ```
4. Migrasi `starlite-pks` dijalankan lewat Console D1 (jangan pakai `migrations apply`): berkas `migrations/000N_*.sql` diterapkan berurutan, **sebelum** kode yang memakainya di-deploy.
5. Isi `APP_URL` di `wrangler.toml`, lalu `npx wrangler deploy` (atau push ke `main` → Cloudflare Workers Builds: root `pks`, watch path `pks/**`, perintah `npx wrangler deploy`).
6. Masuk dengan email admin + `ADMIN_PASSWORD_AWAL`, ganti password, lalu tambah pengguna di Pengaturan (password sementara tampil sekali). Disarankan menambah aturan *Rate limiting* Cloudflare untuk `/api/login`.

## Pengguna

Admin awal tersimpan di migrasi 0001 sebagai `vendormanagement@pmosurge.co.id`; ganti ke email yang dipakai: `UPDATE pks_pengguna SET email='<email-baru>' WHERE email='vendormanagement@pmosurge.co.id';` (jalankan sebelum masuk pertama). Tambahkan VM, Legal, Manajemen, dan penandatangan di menu Pengaturan.

## Antarmuka: satu aplikasi (dashboard VM)

Antarmuka internal Perjanjian ada di dalam dashboard Vendor Management (`https://vendormanagementstarlite-cyber.github.io/VM_SpesialistDashbord/`), menu **Perjanjian** dengan submenu Overview, Perjanjian, dan Pengaturan. Hanya Akun Utama yang melihat menu ini; API tetap hanya menerima akun Admin.

- Sumber tampilan tetap `public/app.js`, `public/ttd.js`, `public/app.css`. `node scripts/bundle-dashboard.mjs` menyusunnya menjadi `dist/pks-dashboard.js` (tampil di Shadow DOM agar gaya tidak bentrok dengan dashboard).
- `node scripts/pasang-dashboard.mjs <path>/index.html` memasang bundel + penghubung menu (`scripts/dashboard-glue.js`) ke index.html dashboard, lalu index.html di-commit ke repo dashboard.
- Rute memakai awalan `#/pks/…` (contoh tautan email: `…/VM_SpesialistDashbord/#/pks/perjanjian/<id>`). `UI_URL` di `wrangler.toml` menunjuk ke dashboard; `CORS_ORIGIN` hanya mengizinkan dashboard.
- Aplikasi terpisah lama (GitHub Pages repo ini dan halaman utama Worker) hanya mengarahkan ke dashboard (`public/index.html` + `public/pindah.js`).
- Portal mitra (`/portal.html`) dan portal Legal (`/legal.html`) tetap di Worker karena dibuka pihak luar lewat tautan email.
- Uji di dashboard: `test/dashboard.mjs` (petunjuk di kepala berkas).

## Template dokumen

Format perjanjian memakai `templates/pks-jasa.docx` (Perjanjian Pengadaan Jasa, 29 halaman). Hanya isian kuning yang dapat diisi (9 isian pada form; nomor surat dicetak otomatis oleh Legal) dan tanda tangan (halaman 19). Selebihnya terkunci.

Bila template Word berubah: `python3 scripts/build-template.py` (butuh LibreOffice dan pdfplumber) membangun ulang `src/templates/pks-jasa.js` (PDF + posisi isian). Sesuaikan `POSISI_TTD` di `src/lib/template.js` bila blok tanda tangan pindah halaman.

## Alur (5 langkah)

1. **Draf** — VM pilih mitra dan isi bagian kuning; dokumen dibuat dari template.
2. **Review mitra** — email berisi PDF dan tautan. Mitra mengubah bagian kuning, memberi catatan, atau menekan Setuju di aplikasi. Setuju → otomatis ke Legal.
3. **Nomor surat** — Legal mengetik nomor → tercetak di dokumen dan otomatis dikirim ke mitra untuk TTD.
4. **TTD mitra** — mitra unggah TTD; VM setujui atau minta ulang.
5. **TTD PT IJE** — dokumen final dikunci, diarsipkan, dan dikirim ke mitra.

Status internal tetap 0–7 di database (kompatibel data lama); `LANGKAH` di `src/lib/flow.js` memetakan ke 5 langkah.
