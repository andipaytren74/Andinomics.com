# Andinomics — Smart Financial Dashboard

Dashboard keuangan pribadi berbasis **HTML5, CSS3, dan Vanilla JavaScript**, dengan visualisasi cash flow menggunakan **Chart.js**.

![Tema](https://img.shields.io/badge/theme-dark--green--orange-183326)

## ✨ Fitur

- Ringkasan saldo, pemasukan, pengeluaran, dan jumlah transaksi — update otomatis
- Form tambah & edit transaksi dengan validasi input
- Riwayat transaksi dengan pencarian real-time
- Hapus transaksi (dengan konfirmasi)
- Grafik cash flow (pemasukan vs pengeluaran) menggunakan Chart.js
- Sepenuhnya responsif (desktop, tablet, mobile)
- Aksesibel: label form, `aria-live`, fokus keyboard, kontras warna

## 🗂️ Struktur Proyek

```
/
├── index.html          # Struktur halaman (semantic HTML5)
├── style.css            # Seluruh styling + design tokens
├── script.js             # Logika aplikasi (IIFE, modular)
├── assets/
│   ├── logo/             # Tempat logo/brand mark (saat ini pakai ikon inline)
│   ├── images/
│   └── icons/
├── README.md
├── CHANGELOG.md
├── PROJECT_REVIEW.md
└── ARCHITECTURE.md
```

Lihat `ARCHITECTURE.md` untuk penjelasan alur aplikasi secara detail.

## 🚀 Menjalankan Secara Lokal

Karena tidak ada proses build (murni HTML/CSS/JS), cukup buka `index.html` langsung di browser, atau jalankan local server sederhana agar font/ikon CDN termuat dengan baik:

```bash
python3 -m http.server 8080
# lalu buka http://localhost:8080
```

## 🌐 Deploy ke GitHub Pages

1. Push seluruh isi folder ini ke branch `main` repo GitHub.
2. Masuk ke **Settings → Pages**.
3. Pilih source: `Deploy from a branch` → branch `main` → folder `/root`.
4. Situs akan tersedia di `https://<username>.github.io/<repo>/`.

Tidak ada langkah build tambahan yang diperlukan.

## 🎨 Tema Warna

| Token | Hex | Kegunaan |
|---|---|---|
| `--bg` | `#0F2418` | Background utama |
| `--card` | `#183326` | Permukaan kartu |
| `--border` | `#28503A` | Garis pembatas |
| `--orange` | `#FF7A00` | Aksen utama (primary) |
| `--blue` | `#3478F6` | Aksen sekunder |
| `--success` | `#2ECC71` | Status positif / pemasukan |
| `--danger` | `#FF5D5D` | Status negatif / pengeluaran |
| `--text` | `#F8FAFC` | Teks utama |

## 📌 Catatan

Data transaksi saat ini disimpan **di memori (in-memory array)** dan akan hilang saat halaman di-refresh. Arsitektur sudah disiapkan agar penambahan `localStorage` di masa depan tidak memerlukan refactor besar — lihat bagian *Technical Debt* di `PROJECT_REVIEW.md`.
