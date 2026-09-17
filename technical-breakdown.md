# Technical breakdown — alur, alasan, dan apa yang sengaja ditinggal

Per 2026-09-18. Dokumen pendamping [technical-timeline.md](technical-timeline.md):
kalau yang itu menjawab *"model apa dan kenapa"*, yang ini menjawab **"sistemnya
bekerja bagaimana, kenapa dirancang begitu, dan apa yang kami pilih untuk tidak
bangun"**.

Aturan dokumen ini: setiap angka bisa dilacak ke kode atau ke `data/app.db`.
Yang belum terukur ditulis **belum terukur**. Yang gagal ditulis **gagal** —
karena eksperimen yang gagal adalah bagian paling meyakinkan dari cerita ini,
dan satu-satunya bagian yang tidak bisa ditiru tim lain dalam 24 jam.

---

## 1. Satu halaman, untuk dibaca 5 menit sebelum naik

**Apa ini.** Layanan yang menerima export penjualan apa adanya, membersihkannya,
mendiagnosis pola permintaan tiap item, mempertandingkan 6–10 metode peramalan
di histori perusahaan itu sendiri, lalu mengubah pemenangnya menjadi keputusan
pembelian atau produksi dalam rupiah dan unit.

**Yang dibekukan** (tidak berubah walau model berganti):

| Lapisan | Isi |
| --- | --- |
| Model kanonik | `timestamp · series_id · target`, opsional `item_id, location_id, inventory, price, promo, lead_time, moq` |
| Kontrak API | 32 route REST + 10 tool MCP |
| Mesin keputusan | newsvendor service level, safety stock, reorder, mode ritel/manufaktur |
| Aturan seleksi | demand class menentukan siapa bertanding, backtest menentukan siapa menang |

**Yang bisa ditukar** tanpa menyentuh apa pun di atas: model peramalan itu
sendiri. Keduanya duduk di belakang satu adapter interface, dan router
menjatuhkannya dari daftar kalau GPU mati — pipeline turun kualitas, tidak
gagal.

**Angka yang memegang pitch ini:**

- **161 assertion** backend hijau, 7 suite
- **599 series data nyata** (VN2 retail) untuk semua klaim akurasi
- **+5,5%** rata-rata berbobot vs moving average; **+13,9%** di erratic, **+2,0%** di intermittent
- **43% → 0%** forecast mendekati nol di segmen intermittent, setelah metrik seleksi diperbaiki
- **0,09 unit** selisih antara total jaringan dan jumlah cabang

---

## 2. Alur lengkap, 17 tahap

Tiap tahap ditulis dengan **kenapa begitu**, bukan cuma apa yang terjadi. Yang
ditandai 🔴 adalah tahap yang tim lain biasanya tidak punya.

```
CSV / Excel / banyak file
  │
  1  profile        tipe, kardinalitas, sample values per kolom
  2  reshape   🔴   deteksi format wide, unpivot ke long
  3  map       🔴   3 tier: preset ERP → sinonim → heuristik
  4  konfirmasi 🔴  manusia menyetujui sebelum apa pun jalan
  5  PII scan  🔴   NIK, NPWP, 08/+62, email, nama, koordinat
  │
  6  clean          duplikat dalam-file SUM, lintas-file LATEST WINS
  7  lifecycle 🔴   6 state: aktif / dormant musiman / slow / at risk / discontinued / baru
  8  health         skor + daftar series yang belum bisa diramal + alasannya
  │
  9  enrich    🔴   kalender Indonesia sebagai covariate known-future
 10  censoring 🔴   deteksi stockout — dilaporkan, TIDAK dikoreksi
  │
 11  segment        ADI + CV² (Syntetos–Boylan, cutoff 1,32 / 0,49)
 12  route          6–10 kandidat per class, incumbent selalu ikut
 13  backtest       rolling origin, 2 window, train berhenti di batas validasi
 14  select    🔴   metrik mengikuti keputusan, bukan kebiasaan
  │
 15  forecast       batched ke GPU L40S (TiRex-2 + TimesFM-3)
 16  decide         service level dari biaya, safety stock dari error backtest
 17  rollup    🔴   bottom-up, koheren by construction
  │
  └─ REST · MCP · CSV export · notifikasi email · branch insights · value sim
```

### Tahap 1–5: data masuk

**1. Profile.** Tipe, kardinalitas, dan contoh nilai nyata per kolom. Contoh
nilai penting bukan untuk kami, tapi untuk layar konfirmasi: orang tidak bisa
menilai apakah `qty_out` itu kuantitas tanpa melihat isinya.

**2. Reshape.** Sebagian export punya tanggal sebagai **nama kolom**
(`Jan-24, Feb-24, …`). Dideteksi dari header yang berbentuk tanggal, lalu
di-unpivot. Tanpa ini, file semacam itu ditolak dan pengguna menyimpulkan produk
kami tidak bisa membaca datanya.

**3. Map, tiga tier.** Tier 1 preset fingerprint ERP (Accurate, Jubelio,
SimpliDOTS, Moka). Tier 2 sinonim + heuristik. Tier 3 LLM, **hanya pengisi
celah**.

> **Keputusan:** LLM tidak boleh jadi dependensi. Kalau wifi venue mati saat
> demo, tier 1 dan 2 tetap memetakan. Kegagalan di langkah pertama adalah
> kegagalan yang paling mahal.

**4. Konfirmasi manusia.** Mapping ditebak otomatis, **dikonfirmasi manusia**
sebelum apa pun jalan, dengan confidence per field.

> **Keputusan:** ini jawaban untuk *"bagaimana kalau AI-nya mengira revenue itu
> kuantitas?"* — kadang memang begitu, dan itu sebabnya ada layar konfirmasi.
> Sistem yang mengklaim tidak pernah salah memetakan sedang berbohong.

**5. PII scan.** Memindai **nilai**, bukan nama kolom, dengan format Indonesia
sebagai kelas utama: NIK 16 digit, NPWP 15, nomor `08`/`+62`, email, koordinat,
plus nama orang dari nama kolom.

> **Keputusan:** dilaporkan, **tidak pernah dihapus**. Kolom mana yang boleh
> dikirim adalah keputusan perusahaannya, bukan keputusan kami. Severity
> `critical` kalau kolomnya ikut masuk forecast, `warning` kalau cuma ikut
> terunggah.

### Tahap 6–8: pembersihan

**6. Duplikat, dua aturan berbeda.** Dalam satu file: **SUM** (dua baris
transaksi di hari yang sama itu dua penjualan). Lintas file: **LATEST WINS**
(upload kedua yang tumpang tindih adalah koreksi, bukan tambahan). Dikerjakan
lewat `__source_rank`.

> **Ini bug yang kami tangkap, bukan desain yang kami ramalkan.** Upload yang
> tumpang tindih tadinya dijumlahkan dan menggandakan **+21.019 unit**. Lihat
> bagian 5.

**7. Lifecycle, enam state.** Tiga pertanyaan berurutan: kalender (apakah ini
musiman?) → ritme (apakah ini memang jarang laku?) → kestalean (apakah ini
berhenti?).

> **Keputusan:** urutannya load-bearing. Awalnya cek ritme jalan sebelum cek
> musiman, dan SKU Lebaran dilabeli `slow_mover` — barang yang laku keras tiga
> minggu setahun dianggap barang mati.
>
> `seasonal_dormant` dan `slow_mover` **tetap diramal**. Itu item yang paling
> susah dan paling bernilai; menjatuhkannya adalah cara termudah membuat metrik
> terlihat bagus sambil menghapus masalah yang sebenarnya.

**8. Health report.** Skor, temuan bertingkat, dan daftar series yang **belum
bisa** diramal beserta alasan dan apa yang perlu dilakukan.

> **Keputusan:** daftar kegagalan adalah deliverable onboarding, bukan
> rasa malu yang disembunyikan. Customer mid-market tidak punya data engineer;
> daftar ini yang mereka bawa ke tim mereka.

### Tahap 9–10: pengayaan

**9. Kalender Indonesia sebagai covariate known-future.** Lebaran, Ramadan,
jendela THR, siklus gajian, kalender sekolah. Tabel 2020–2029 (2027+ ditandai
belum dikonfirmasi).

> **Keputusan:** kalender adalah **varian yang bertanding sendiri**
> (`tirex+calendar`), bukan lapisan yang selalu dipakai. Jadi koreksi Lebaran
> cuma menang di series yang efeknya nyata di histori perusahaan itu.
>
> Di VN2 (data Vietnam) dia **kalah**, dan itu benar. Sistem yang memaksa koreksi
> Lebaran ke data Vietnam adalah sistem yang tidak mengukur apa pun.

**10. Censoring — dideteksi, tidak dikoreksi.** Ini keputusan paling
kontraintuitif di seluruh sistem dan yang paling kuat kalau ditanya. Lihat
bagian 4.2.

### Tahap 11–14: pemodelan

**11. Segment.** ADI + CV², cutoff Syntetos–Boylan 1,32 / 0,49 → smooth,
erratic, intermittent, lumpy.

**12. Route.** Demand class menentukan **siapa yang boleh bertanding**:

| Class | Kandidat | n |
| --- | --- | --- |
| smooth / erratic | tirex, tirex+calendar, timesfm, timesfm+calendar, seasonal_naive(+cal), moving_average(+cal) | 8 |
| intermittent / lumpy | tirex, tirex+calendar, timesfm, tsb, croston, moving_average | 6 |

> **Keputusan:** `moving_average` ikut di **semua** class. Itu praktik customer
> sekarang. Backtest yang mengeluarkan incumbent bukan backtest — kita memaksa
> satu pilihan lalu membandingkannya dengan opsi yang kita tolak untuk diuji.
>
> `croston`/`tsb` **hanya** di intermittent/lumpy: menjalankannya di smooth
> menggandakan biaya backtest tanpa hasil.

**13. Backtest.** Rolling origin, `N_WINDOWS = 2`, `MIN_TRAIN = 21`. Aturan
kebocoran: data latih satu fold adalah **tepat** semua yang sebelum slice
validasinya. Covariate untuk slice validasi hanya yang known-future — nilai
kalender, tidak pernah apa pun yang diturunkan dari target yang disembunyikan.

> **Keputusan:** 2 window, bukan 10. 1.000 series × 8 model × 10 fold = 80.000
> run tanpa nilai tambah, dan tidak ada juri yang memberi poin untuk itu.
> Harganya nyata dan sudah kami ukur — lihat bagian 6.

**14. Select — metrik mengikuti keputusan.** Ini kontribusi teknis paling nyata
dari proyek ini. Lihat bagian 4.1.

### Tahap 15–17: keputusan

**15. Forecast final, batched.** Satu panggilan menutup banyak series.

> **Bug yang kami tangkap:** loop per-series adalah cara paling wajar
> menulisnya, dan salah begitu model tinggal di belakang HTTP — tiap kandidat
> tiap window jadi round trip serial sendiri dan thread pool di client tidak
> pernah kebagian kerja. Dikelompokkan ulang per (model, window): **665s → 20,5s**.

**16. Decide.** Service level **diturunkan dari biaya**, bukan diisi manual:

```
service_level = cost_short / (cost_short + cost_over)
safety_stock  = z(service_level) × RMSE_backtest × √periods_in_lead_time
```

> **Keputusan 1:** dua angka abstrak (`cost_short`, `cost_over`), bukan satu
> field per alasan. Versi awal punya `spoilage_cost`, dan itu overfit ke satu
> industri — spoilage, obsolescence, dan markdown semuanya melipat ke
> `cost_over`. Perusahaan yang jual besi dan yang jual susu memakai dua angka
> yang sama dengan nilai berbeda.
>
> **Keputusan 2:** safety stock dihitung dari **RMSE backtest**, bukan dari
> sebaran forecast. Menghitungnya dari sebaran forecast menghukum setiap model
> yang menangkap musiman — persis kebalikan dari yang benar. Forecast yang lebih
> baik harus mendapat buffer yang **lebih kecil**. Lihat bagian 5.

**17. Rollup bottom-up.** Forecast cabang dijumlahkan ke jaringan, plus
pemeriksaan koherensi yang dilaporkan lewat API.

> **Keputusan:** bottom-up, bukan top-down atau MinT. Koherensi jadi **properti,
> bukan harapan**: di file demo, total jaringan 822.990,9 vs jumlah cabang
> 822.991,0 — selisih **0,09 unit**, murni penjumlahan float.
>
> Kenapa ini penting lebih dari kedengarannya: forecast top-down menghasilkan
> total kantor pusat yang tidak dikenali cabang mana pun, dan perdebatan
> setelahnya yang membuat orang berhenti memakai tool perencanaan.

### Permukaan keluaran

| Permukaan | Isi | Untuk |
| --- | --- | --- |
| REST | 32 route | aplikasi dan sistem |
| MCP | 10 tool (read bebas, write minta konfirmasi) | agen AI / Claude |
| CSV | 4 export, `sep=;` + BOM UTF-8 | manusia, yang tinggal di Excel |
| Email | digest per cabang, penerima dari pemanggil | manager cabang |
| Branch insights | rate per cabang vs rata-rata jaringan, usulan transfer | owner |
| Value sim | policy sama, dua forecast, hasilnya rupiah | pitch dan justifikasi |

> **Keputusan CSV:** Excel di locale Indonesia membaca `;` sebagai pemisah
> kolom. Kirim CSV koma biasa dan seluruh baris mendarat di kolom A — file
> terlihat rusak, dan pengguna menyimpulkan produknya rusak. Plus BOM, tanpanya
> teks Indonesia dan tanda rupiah jadi mojibake. Dua detail yang terdengar
> sepele dan bukan.

---

## 3. Keputusan arsitektur yang akan diprobe juri

| Keputusan | Alasan | Yang kami tolak |
| --- | --- | --- |
| **Dua foundation model** | Selisih akurasi <1% di semua segmen, jadi yang menentukan adalah **lisensi**. TiRex-2 Apache-2.0 jadi engine produksi; TimesFM-3 bobot riset, jadi benchmark yang mengawasinya | Bertaruh pada satu checkpoint milik satu vendor |
| **Zero training** | Onboarding customer baru = 0 biaya training. Refresh forecast = GPU-second, bukan siklus retraining. Itu yang membuat satu engine melayani seribu perusahaan | Fine-tuning: melanggar lisensi bobot riset, dan leakage-nya fatal kalau dilatih di satu-satunya dataset yang kita punya |
| **Backend tanpa auth** | Identitas dan izin cabang tinggal di auth layer frontend. Dua tempat memutuskan siapa boleh lihat apa adalah dua tempat yang cepat atau lambat berbeda pendapat, dan satu di antaranya salah tanpa bersuara | Menduplikasi tabel user di backend |
| **404, bukan 403** | Mengonfirmasi bahwa sebuah id ada tapi milik perusahaan lain sudah merupakan kebocoran | Pesan error yang sopan dan membocorkan |
| **Satu middleware, bukan 25 route** | Gate membaca path (`ds_` prefix). Menjaga 32 route satu per satu berarti cepat atau lambat mengirim 31 yang benar. Route yang ditambahkan besok terlindungi saat ditambahkan | Decorator per route |
| **SQLite** | Nol setup, dan tidak ada juri yang memberi poin untuk networking database | Postgres |
| **FastAPI BackgroundTasks** | Satu proses, nol infrastruktur | Celery + Redis |
| **Hanya deret angka tanpa label ke GPU** | Nama barang, nama cabang, harga, dan kolom ber-PII tidak pernah keluar dari service | Mengirim frame apa adanya |
| **Disk cache respons GPU** | Demo kedua jadi 7× lebih cepat. Diukur: 112s cache dingin → 15,3s hangat untuk 117 series | Selalu memanggil ulang |

---

## 4. Dua keputusan yang perlu penjelasan penuh

### 4.1 Metrik seleksi harus metrik keputusan

**Gejalanya.** Untuk series intermittent, titik forecast foundation model runtuh
mendekati nol. Kasus nyata: item dengan rata-rata 30 hari terakhir **55,8
unit/hari** diramal **0,14 unit/hari**. Rantainya:

```
forecast ≈ 0 → stok tidak pernah habis → days_until_stockout = None
             → risk = healthy → recommended_qty = 0
```

Sistem bilang *"aman, tidak perlu pesan"* untuk barang yang pasti kehabisan.

**Ini bukan bug di kode kami.** Service mengembalikan `forecast` dan
`quantiles`; kami pakai `forecast`, titik milik model itu sendiri. Untuk
permintaan yang 84% nol, titik yang meminimalkan error memang mendekati median,
yaitu nol. Modelnya benar; pertanyaan yang kami ajukan ke modelnya yang salah.

**Kenapa backtest tidak menangkapnya.** Kami menilai intermittent dengan MASE,
dan **meramal nol untuk series yang 84% nol memberi MASE bagus** — error absolut
per-hari memang kecil. Padahal keputusan stok tidak peduli hari mana barang
laku; dia cuma peduli **total selama lead time**.

**Perbaikannya dan hasil ukurnya.** Metrik utama untuk sparse diganti ke error
permintaan kumulatif. VN2, satu backtest dinilai dua kali:

| | MASE | Kumulatif |
| --- | --- | --- |
| intermittent (320) forecast ≈ nol | **43%** | **0%** |
| intermittent error total | 0,606 | **0,460** (−24,2%) |
| intermittent MASE (harganya) | 0,881 | 0,886 (+0,5%) |
| lumpy (191) forecast ≈ nol | **48%** | **1%** |
| lumpy error total | 0,624 | **0,514** (−17,6%) |

**511 dari 599 item yang dulu diusulkan "tidak perlu pesan" padahal laku,
sekarang dapat usulan yang benar.**

**Kelemahannya, disebut bukan disembunyikan.** Metrik kumulatif secara matematis
`abs(bias)`, jadi sendirian dia memilih model **terdatar**. Toleransi seri 0,02
membatasi masalah itu, tidak menghilangkannya. Di VN2 model terdatar tetap
menang di kelas sparse.

**Konsekuensi untuk pitch:** dengan metrik yang benar, foundation model menang di
**88 dari 599 series (15%)**, bukan 100%. Itu posisi lebih kuat — sistem yang
berani bilang *"Excel sudah cukup untuk 511 item ini, dan ini 88 yang tidak"*
lebih dipercaya daripada yang mengklaim unggul di semuanya.

### 4.2 Censoring dideteksi tapi tidak dikoreksi

Saat SKU kehabisan stok, penjualan tercatat **lebih rendah** dari permintaan
sebenarnya. Latih di penjualan, model belajar meramal rendah tepat untuk barang
yang sudah merugikan.

Kami mencoba mengoreksinya. Sweep terhadap ground truth in-stock VN2:

| multiple | precision | recall |
| --- | --- | --- |
| 1,5 | 19,8% | 28,2% |
| 2,0 | 23,8% | 24,2% |
| 3,0 | 33,8% | 17,9% |
| 4,0 | **42,8%** | 14,0% |

**Tidak ada yang mencapai akurasi yang bisa dipakai, dan tidak akan pernah bisa:
minggu nol karena stok habis dan minggu nol karena tidak ada permintaan
identik** di series penjualan. Informasinya tidak ada di data.

> **Keputusan:** duduk di ujung konservatif dan katakan. Satu false positive
> menaikkan nol yang asli ke median — mengajari model menumpuk barang yang tidak
> ada yang beli. **Koreksi yang salah lebih mahal daripada koreksi yang
> terlewat.**

Dengan kolom inventory, deteksi yang sama jadi **eksak**. Jadi ini bukan masalah
algoritma, ini masalah akuisisi data: **satu kolom itu adalah permintaan paling
berharga yang bisa kami ajukan ke customer.**

---

## 5. Bug yang tertangkap karena mengukur, bukan menalar

Ini bagian yang tidak bisa ditiru dalam 24 jam, dan menurutku bagian paling
meyakinkan dari seluruh pitch. Semua ini ditemukan dengan mengukur sesuatu yang
kami sudah yakin benar.

### Yang mengubah angka di layar

| # | Yang kami temukan | Dampaknya kalau dibiarkan |
| --- | --- | --- |
| 1 | Safety stock dihitung dari **sebaran forecast** | Menghukum setiap model yang menangkap musiman — forecast lebih baik dapat buffer lebih besar. Diperbaiki ke RMSE backtest |
| 2 | Value sim menjumlahkan **modal kerja ke margin** | Tanda terbalik jadi negatif; slide uang menunjukkan kerugian. Diperbaiki ke flow-vs-flow, modal kerja dilaporkan terpisah |
| 3 | Upload tumpang tindih **dijumlahkan** | **+21.019 unit** permintaan hantu. Diperbaiki: `__source_rank`, latest wins |
| 4 | Filter series kosong dianggap **"tanpa filter"** | Satu cabang yang salah taip menerima **seluruh jaringan**. Diperbaiki ke `is not None` |
| 5 | Export mengembalikan **semua cabang** | Manager cabang menekan Export dan mengunduh data seluruh perusahaan. Layarnya sudah di-scope, unduhannya belum |
| 6 | `/datasets` dan `/projects` melist **50 dataset** tanpa peduli pemilik | Setiap perusahaan melihat daftar perusahaan lain |
| 7 | Arah override mapping **terbalik** | Setiap koreksi mapping dari layar review diabaikan **tanpa error** — request sukses, mapping tidak berubah |
| 8 | Band risiko `watch` **tidak pernah bisa muncul** | Butuh coverage >30 dan <28 di setelan default. UI punya state yang belum pernah terpakai |

### Yang mengubah kualitas forecast

| # | Yang kami temukan | Perbaikannya |
| --- | --- | --- |
| 9 | Cek ritme jalan **sebelum** cek musiman | SKU Lebaran dilabeli `slow_mover`. Urutan pertanyaan dibalik |
| 10 | **71%** series WFP dilaporkan forecastable padahal dormant | `lifecycle.py` — enam state, tiga pertanyaan berurutan |
| 11 | Uplift kalender **datar** kalah dari seasonal naive | Dibangun ulang jadi bucket per-jarak ke Lebaran |
| 12 | `stock_hour6_22_cnt` dipetakan ke `inventory` | Semantiknya terbalik. Negative hints untuk inventory |
| 13 | `sale_amount` **ditolak** oleh hint "amount" | Kolom target yang benar dibuang. Positive overrides |
| 14 | Kuantil TiRex dan TimesFM **ter-transpose** | Heuristik bentuk diganti uji monotonisitas |
| 15 | Metrik seleksi tidak sejalan keputusan | Bagian 4.1 — temuan terbesar |

### Yang mengubah apakah demo selesai

| # | Yang kami temukan | Perbaikannya |
| --- | --- | --- |
| 16 | Backtest **665 detik** | Loop per-series mengalahkan thread pool. Dikelompokkan per (model, window) → **20,5s** pada dataset saat itu. (VN2 599 series masih 670s cache dingin / 83s hangat — datasetnya 5× lebih besar, jadi dua angka ini bukan perbandingan langsung) |
| 17 | Value sim meramal ulang **setiap periode** (~14.000 panggilan serial) | `REVIEW_PERIOD = 7` |
| 18 | Tunnel drop sesaat menandai model **unavailable permanen** | Retry + probe expiry |
| 19 | **6 panggilan `/overview` paralel** semuanya timeout | Backend menjawab benar sepanjang waktu; node view kosong karena client. Satu panggilan `/branches` → 3s |
| 20 | Indikator step processing **berjalan mundur** | `JOB_STEPS` menaruh forecast sebelum backtest. Indeks step dipisah dari kata status |

### Yang mengubah apakah kami jujur

| # | Yang kami temukan |
| --- | --- |
| 21 | `mcp_setup.py` **mencetak API key GPU** apa adanya ke terminal — output yang sering ditempel ke chat dan tampil saat share screen |
| 22 | Tidak ada endpoint **penghapusan** data sama sekali |
| 23 | Ada **tes yang tidak bisa gagal** (`skipped OR new_items > 0`). Kami temukan sendiri dan ganti dengan assertion nyata |
| 24 | Dataset demo kami sendiri **34% intermittent** — membidik segmen terlemah kami sendiri, padahal kami yang mengukur bahwa foundation model cuma +2,0% di situ |
| 25 | Item "slow mover" di dataset demo diberi volume **55 unit/hari** — itu barang laris yang datanya bolong, bukan slow mover |

---

## 6. Eksperimen yang kami jalankan

Termasuk yang hasilnya negatif. Yang negatif dicatat di komentar kode supaya
tidak diulang.

| Eksperimen | Hipotesis | Hasil |
| --- | --- | --- |
| **Metrik kumulatif vs MASE** di 599 series | MASE salah menilai sparse | ✅ **Terbukti.** Forecast nol 43%→0%, error total −24,2%, harga MASE +0,5% |
| **Sweep toleransi seri** (0 / 0,01 / 0,02 / 0,05 / 0,10) | MASE sebagai pemecah seri membantu | ❌ **Gagal.** Tidak pernah membantu. <0,05 tidak aktif; ≥0,05 mempromosikan Croston dan mengembalikan forecast nol 1%→7% |
| **Koreksi censored demand** | Bisa memulihkan permintaan asli dari penjualan | ❌ **Gagal.** Precision maksimum 42,8% di recall 14%. Informasinya tidak ada di data |
| **Koreksi censoring dengan label ground-truth** | Kalau labelnya sempurna, koreksinya membantu | ❌ **Gagal bahkan dengan label sempurna.** Jadi report-only, dan itu keputusan produk bukan keterbatasan teknis |
| **Uplift kalender datar** | Faktor uplift tunggal cukup | ❌ **Gagal.** Kalah dari seasonal naive. Dibangun ulang jadi bucket per-jarak |
| **Kalender di VN2** | Covariate kalender membantu di mana pun | ❌ **Gagal, dan benar.** Data Vietnam; Lebaran tidak berlaku. Router menolaknya sendiri |
| **TimesFM vs TiRex head-to-head** | Salah satu jelas lebih baik | ➖ **Imbang.** Selisih <1% di semua segmen. Jadi lisensi yang memutuskan, bukan skor |
| **Croston/TSB di intermittent** | Buku teks benar | ❌ **Gagal.** Di bawah moving average (−2,1% dan −5,6%). Pembenaran keberadaan router |
| **Backtest tersampel (mock mode)** | Sampel representatif cukup untuk keputusan yang sama | ✅ **Terbukti.** Seleksi memang sudah per-segmen; 22 dari 117 diukur, keputusan identik |
| **Subset-matched per demand class** | Perbandingan agregat menyesatkan | ✅ **Terbukti.** Rentangnya +2,0% sampai +13,9%, bukan satu angka |

---

## 7. Yang sengaja tidak dibangun — scope MVP 24 jam

Bedakan tiga hal: **sengaja dibuang**, **diblokir oleh data**, dan **belum
selesai**. Juri menghargai yang pertama dan memaafkan yang kedua; yang ketiga
harus disebut sebelum ditemukan.

### Sengaja dibuang, dan akan tetap dibuang

| Tidak dibangun | Alasan |
| --- | --- |
| **Fine-tuning / retraining** | Membatalkan cerita zero-training yang membuat engine ini horizontal. Lisensi bobot riset membuatnya dead end. Dan leakage-nya fatal: fine-tune di satu-satunya dataset kami lalu melaporkan backtest di dataset itu adalah satu kesalahan yang mendiskreditkan semua angka lain |
| **Postgres** | SQLite cukup, nol setup |
| **Celery / Redis** | `BackgroundTasks` cukup untuk satu proses |
| **Docker sebelum jam 22** | Pajak infrastruktur di jalur kritis |
| **Konektor ERP nyata** | Endpoint REST adalah buktinya. Konektor sungguhan itu sebulan, bukan semalam |
| **WhatsApp Business API** | Adapter interface-nya identik dengan email. Yang dikirim sekarang email; WhatsApp placeholder yang jujur |
| **Koreksi censored demand** | Sudah diukur, tidak bisa. Bagian 4.2 |
| **Top-down / MinT reconciliation** | Bottom-up sudah koheren by construction. MinT memecahkan masalah yang tidak kami punya |

### Diblokir oleh data, bukan oleh waktu

| Tidak bisa | Kenapa | Yang membukanya |
| --- | --- | --- |
| **Per-series model selection** | Aturan kami sendiri melarangnya di bawah 3 validation point. Di VN2 **599 dari 599** series memakai segment default | Riwayat 18 bulan. Harganya sudah kami ukur: **17 poin persen** di intermittent |
| **Validasi kalender Lebaran** | Belum ada satu pun dataset ritel Indonesia yang melewati dua Lebaran | Satu design partner |
| **Deteksi stockout eksak** | Butuh kolom inventory atau in-stock | Satu kolom dari customer |
| **Band risiko `watch`** | Butuh `2 × lead_time > horizon`; default 14 vs 30 | `lead_time_days: 21` — tapi itu asumsi bisnis, keputusan customer |

### Belum selesai, dan harus disebut

| Belum ada | Biaya perkiraan |
| --- | --- |
| Safety stock dari **kuantil model**, bukan RMSE backtest | 1–2 jam. Kuantilnya sudah kami simpan — ini yang paling murah dan paling defensible di daftar |
| **Harga/promo sebagai driver** | Kolomnya diterima dan dipetakan, tidak masuk model. Untuk ritel, elastisitas harga sering mengalahkan musiman |
| **Cold start item baru** | Tanpa riwayat, tidak ada output. Padahal item baru yang paling sering salah pesan |
| `POST /simulate` di backend | Panel what-if jalan di atas fixture frontend |
| **Audit log, enkripsi at-rest, rate limiting, rotasi key** | Jangan diklaim |
| `recommended_qty` sebagai integer | Pembulatan terakhir masih di frontend |

---

## 8. Judge Q&A — pertanyaan yang paling mungkin menjatuhkan

**"Ini cuma wrapper TimesFM kan?"**

Dari 17 tahap di pipeline, foundation model mengisi **satu**. Dan hasil ukurnya:
model memberi +5,5% atas moving average. Angka rupiah tidak mungkin keluar dari
+5,5% sendirian — itu keluar dari mapping, pembersihan, segmentasi, aturan
seleksi, dan mesin keputusan. Kalau ini wrapper, wrapper-nya 16 tahap.

**"Per-series selection dengan 2 validation window itu sound?"**

Tidak, dan itu sebabnya kami tidak melakukannya. Di bawah 3 titik kami pakai
segment default. Di VN2 itu 599 dari 599 series — jadi klaim yang jujur adalah
*"per-segment selection, dengan per-series siap aktif begitu riwayat memadai"*.
Kami ukur harganya: 17 poin persen di intermittent. Itu trade-off yang kami
pilih sadar, dan hilang sendiri saat customer punya riwayat 18 bulan.

**"Kenapa tidak langsung pakai Croston untuk intermittent?"**

Karena kami mengukurnya dan Croston **lebih buruk** dari moving average di data
nyata (−5,6% MASE). Kalau kami hardcode berdasarkan buku teks, 320 dari 599
series dapat hasil lebih jelek dari Excel. Itu persis jenis kesalahan yang
router ini ada untuk mencegah — dan kami juga tidak hardcode moving average,
walaupun dia yang menang.

**"Angka rupiahnya dari data sintetis?"**

Ya, dan kami sebut itu di dokumen. Pipeline, kompetisi model, dan aturan
keputusannya nyata dan terukur di 599 series data nyata. Yang sintetis adalah
kalender Lebaran dan posisi inventory di file demo. Yang kami minta dari design
partner pertama adalah satu hal: riwayat 18 bulan dengan kolom stok.

**"Foundation model cuma menang 15%?"**

Benar, setelah kami memperbaiki metrik seleksinya. Sebelum itu dia menang 100%
dan itu artefak — MASE memberi nilai bagus ke forecast yang mendekati nol.
Kami lebih suka angka 15% yang benar daripada 100% yang tidak. Dan 15% itu tetap
511 item yang cukup dilayani Excel dan 88 yang tidak — kami menunjukkan yang
mana, dan itu yang dibeli.

**"Bisa dijual secara komersial dengan lisensi model itu?"**

Ya, dan kami tidak menyerahkannya pada keberuntungan. Engine produksinya TiRex-2
yang Apache-2.0 dan menerima covariate yang sama. TimesFM-3 jalan di sebelahnya
sebagai benchmark, dan bobotnya research-only — persis sebabnya dia tidak pernah
kami jadikan dependensi.

**"Bagaimana data customer dilindungi?"**

Yang keluar dari service ke GPU cuma **deret angka tanpa label** — nama barang,
nama cabang, harga, dan kolom yang ditandai data pribadi tidak dikirim. Isolasi
tenant menjawab 404 bukan 403. Penghapusan mencapai file unggahan asli, bukan
cuma baris database. Yang **belum** kami punya dan tidak kami klaim: enkripsi
at-rest, audit trail, rate limiting.

**"Apa yang paling kalian tidak yakini?"**

Kalender Lebaran. Itu moat yang kami klaim, dan buktinya baru ada di data yang
efeknya kami tanam sendiri. Sampai ada satu dataset Indonesia yang melewati dua
Lebaran, itu hipotesis berdasar — bukan hasil.

---

## 9. Angka yang boleh dan tidak boleh disebut

| ✅ Boleh | ❌ Jangan |
| --- | --- |
| +5,5% vs moving average di 599 series nyata (sebut rentang +2,0% sampai +13,9%) | "TimesFM menang di 100% series" |
| 43% → 0% forecast mendekati nol setelah metrik diperbaiki | "11,4% WAPE" tanpa menyebut itu data sintetis |
| Selisih koherensi 0,09 unit | Enkripsi at-rest, audit trail |
| Croston/TSB di bawah Excel di data ini | Koreksi censored demand |
| Deteksi data pribadi, isolasi tenant, penghapusan sampai file asli | Validasi kalender Lebaran sebagai hasil |
| 161 assertion, 7 suite | Dampak rupiah tervalidasi |
| Zero training untuk customer baru | Customer atau design partner yang sudah ada |

---

## 10. Reproduce

```bash
# Akurasi per demand class, subset-matched (bagian 3 technical-timeline.md)
./backend/.venv/Scripts/python.exe -c "..."     # lihat §7 technical-timeline.md

# Eksperimen metrik + sweep toleransi (bagian 4.1)
py -3.11 backend/scripts/experiment_metric.py

# Seluruh suite backend — 161 assertion
cd backend && for t in check_contract smoke_test test_branches \
  test_economics test_lifecycle test_overrides test_security; do
  ./.venv/Scripts/python.exe scripts/$t.py | tail -1; done

# Dataset demo 6 cabang
py -3.11 backend/scripts/make_network_demo.py

# Status engine
curl -s localhost:8000/health
```
