# Backend handoff

Untuk yang pegang frontend. Dokumen ini menjawab tiga hal: apa yang berubah dan
**bisa merusak kodemu sekarang**, gap `migration-report.md` mana yang sudah
tertutup, dan apa yang masih perlu dikerjakan di sisi masing-masing.

Referensi: `frontend-backend-integration.md` (kontrak) dan
`migration-report.md` (daftar gap B1–B15).

---

## 1. Baca ini dulu — 5 endpoint berubah bentuk

Backend sekarang mengembalikan **bentuk final yang ada di `app/dummy-data/types.ts`**,
bukan bentuk internal engine. Jadi lima adapter di `lib/backend/adapters.ts`
sekarang membaca field yang sudah tidak ada.

| Endpoint | Dulu (yang diharapkan adapter) | Sekarang | Adapter yang perlu dihapus |
| --- | --- | --- | --- |
| `GET /datasets/{id}/mapping` | `BackendMappingResponse` | `MappingResponse` | `toMappingResponse` |
| `GET /datasets/{id}/health` | `BackendHealth` (`frequency`, `history_start`) | `HealthReport` (`detected_frequency`, `history_span_months`) | `toHealthReport` |
| `GET /jobs/{id}` | `BackendJob` (`stage` prosa) | `JobState` (`status` enum + `steps[]`) | `toJobState` |
| `GET /recommendations/{id}` | `{ recommendations: [...] }` | `SupplyChainResponse` (`rows`, `headline`, `summary`, `filters`) | `toSupplyChainResponse`, `toInventoryRow` |
| `GET /value/{id}` | `BackendValue` (`baseline`/`proposed`/`delta`) | `ValueSimulation` flat | `toValueSimulation` |

**Gejalanya bukan crash.** `fromBackend` menangkap semua error, termasuk
`TypeError` dari adapter. Jadi lima layar itu diam-diam kembali ke fixture dengan
badge *"Demo data · The forecasting service failed."*, dan penyebabnya cuma
muncul di `console.warn`. Kalau sedang capek, ini gampang terlewat.

Contoh paling jelas, `app/dummy-data/index.ts:211`:

```ts
const { recommendations } = await backend.getRecommendations(datasetId, 200);
// `recommendations` sekarang undefined -> toSupplyChainResponse(undefined) -> throw
```

### Kenapa diubah ke arah ini

Karena adapter-mu **terpaksa** melanggar aturanmu sendiri di kontrak §1
("frontend computes no business values"). `toInventoryRow` harus melakukan:

```ts
const risk = RISK[recommendation.stockout_risk] ?? "watch";   // 3 band -> 4 band
const currentStock = explanationValue(recommendation, /current stock/i);  // regex prosa
```

Itu frontend yang memutuskan risiko, dan mengorek angka dari label tampilan.
Sekarang risiko diputuskan **satu kali** di `backend/app/services/view_models.py`
(`classify_risk`), dan Overview, Supply Chain, serta Branch semuanya membacanya.
Ada 25 tes lintas-endpoint (`backend/scripts/check_contract.py`) yang memastikan
hitungan di Overview dan baris di Supply Chain tidak bisa berbeda.

### Yang perlu kamu lakukan

Hapus lima adapter itu, panggil endpoint langsung, tipe balikannya sudah sama
dengan `types.ts`. Persis seperti yang kontrakmu sendiri bilang:

```ts
export async function getSupplyChain(datasetId: string): Promise<SupplyChainResponse> {
  return request(`/api/v1/recommendations/${datasetId}`);
}
```

Yang **tidak** berubah dan adapternya tetap dipakai:
`toProject` (`/datasets` masih bentuk lama), `toForecastSeries`
(`/forecasts/{id}/{series}` belum berubah), `/ingest`, `/usage`, `/alerts/slack`.

### Satu lagi: `?limit=` di recommendations sudah tidak ada

Sekarang parameternya `risk`, `location`, `category`. `limit` diabaikan.
`risk=attention` berarti `critical` atau `at_risk` — itu yang ditautkan dari KPI
Overview, sesuai kontrak §8.

---

## 2. Bug yang kamu temukan tanpa sadar — override mapping

Kodemu benar, backend yang salah. `mapping-review.tsx:95` mengirim
`{ source_column: canonical_key }` sesuai kontrak §4. Backend membaca arah
sebaliknya, jadi **setiap koreksi mapping dari review screen diabaikan tanpa
error** — request sukses, mapping tidak berubah.

Sudah diperbaiki. Sekarang:

- arah kontrak `{ "qty_out": "target" }` — dipakai
- `"ignore"` menghapus kolom dari mapping
- satu kolom hanya boleh mengisi satu field; kolom yang dipindah otomatis lepas dari peran lamanya
- kolom yang tidak ada di file mana pun **ditolak** (`422`), tidak lagi diam-diam diabaikan
- arah lama `{ "target": "qty_out" }` masih diterima untuk MCP dan pemanggil internal

Arahnya ditentukan dari kolom yang benar-benar ada di file, bukan dari namanya,
karena di sebagian dataset `price` itu nama kolom **dan** nama field kanonik.
Tes: `backend/scripts/test_overrides.py` (10 assertions).

Catatan: response `POST /datasets/{id}/mapping` juga berubah. `confirmed`
sekarang **daftar source** yang berhasil dikonfirmasi (karena satu dataset bisa
punya banyak file), plus `needs_attention`, dan `health` dalam bentuk
`HealthReport` yang baru.

---

## 3. Gap B1–B15: statusnya sekarang

| Gap | Status | Catatan |
| --- | --- | --- |
| **B1** historical actuals 🔴 | ⚠️ sebagian | Chart agregat di `/overview` dan `/demand` **sudah** membawa history + forecast, sudah di-stitch di titik sambung, `cutoff_index` benar. Per-series (`/forecasts/{id}/{series}`) **belum** — masih forecast saja |
| **B2** sample values, unmapped_columns | ✅ | `sample_values`, `unmapped_columns`, `resolved_by` ada. `resolved_by` masih ditebak dari teks `reason`, jadi anggap indikatif |
| **B3** findings title/detail/action | ⚠️ sebagian | `{id, severity, title, detail, action}` ada, tapi `detail` masih menduplikasi `title`. Belum benar-benar dua level |
| **B4** risk vocabulary | ⚠️ sebagian | `healthy \| watch \| at_risk \| critical`, ambangnya relatif ke lead time. **Tapi `watch` tidak pernah muncul di setelan default** — lihat §9 |
| **B5** inventory position | ✅ | `current_stock`, `lead_time_demand`, `safety_stock`, `forecast_demand`, `coverage_days`, `lead_time_days`, `moq` sebagai field bernama. Tidak perlu regex lagi |
| **B6** display names | ❌ | Masih `item_name = item_id`. `category` sudah ada. `nama_produk`/`nama_cabang` di CSV-mu masih tidak terpakai |
| **B7** project concept | ✅ | `GET /projects` dan `/projects/{id}`. **Tapi** `organisation` kuambil dari nama file — kamu bilang itu milik auth layer-mu, jadi **abaikan field itu** dan pakai punyamu |
| **B8** job stage enum | ✅ | `status` enum + `steps[]` dengan `key` yang stabil antar-poll. **Urutan `steps[]` berubah** — lihat §9 |
| **B9** overview | ✅ | `OverviewResponse` lengkap. `KpiMetric.value` `null` + `unavailable_reason` untuk yang tidak bisa dihitung (mis. inventory value tanpa unit cost) |
| **B10** demand | ✅ | `DemandResponse` lengkap, filter server-side, `active_filters` dikembalikan |
| **B11** branch scoping 🔴 | ✅ | `?location=` di `/overview`, `/demand`, `/recommendations`, `/forecasts`, `/branches`. Nama parameternya `location` (sesuai kontrak §7), bukan `location_id` |
| **B12** activity log | ❌ | Belum ada |
| **B13** append/merge dry run | ⚠️ sebagian | `POST /datasets/{id}/append` ada dan jalan. `dry_run` + `MergePreview` **belum** |
| **B14** planning parameters | ✅ | `GET/PUT /datasets/{id}/params` — path-nya `params`, bukan `parameters`. Lihat §5 soal service level |
| **B15** scenario simulation | ⚠️ sebagian | UI-nya jalan dan **sudah digating owner-only**, tapi mesinnya masih `app/dummy-data/simulation.ts` di atas fixture. Endpoint `POST /api/v1/simulate/{id}` belum ada. Lihat §9 |

### Catatan kecil dari §5 migration-report

- `history_start` naive datetime → tidak lagi di response; sekarang
  `history_span_months`
- `wape` fraksi vs persen → view baru mengirim `wape_percent` (11.4).
  `/forecasts/{id}` yang lama masih fraksi
- `recommended_qty` float → dibulatkan 1 desimal, dan kelipatan MOQ kalau MOQ diisi.
  **Belum** integer, jadi pembulatan terakhir masih di kamu
- `/value/{id}` 404 sebelum forecast → pesannya dipertahankan
- CORS `localhost:3000` → **dihapus**, lihat §8
- Auth backend → **shared key opt-in**, lihat §8

---

## 4. Keputusan arsitektur yang memengaruhi frontend

### Satu dataset per perusahaan. Cabang itu cakupan, bukan dataset terpisah

Ini yang paling penting untuk alur owner/manager. Jangan bikin satu dataset per
cabang. Alasannya:

1. **Rekomendasi transfer antar-cabang** hanya bisa muncul kalau semua cabang
   ada dalam satu dataset. Kalau dipisah, sistem tidak bisa melihat Surabaya
   kelebihan barang yang Medan hampir habis.
2. **Seleksi model butuh volume.** Default per segmen dihitung dari semua series
   dalam satu dataset. Cabang dengan 30 SKU statistiknya terlalu lemah.
3. **Overview owner jadi gratis** — tinggal request tanpa `?location=`.
4. Forecast jalan sekali, bukan 40 kali.

Jadi "project" seorang manager = `dataset_id` + `location_id`.

### Backend tidak punya auth, dan itu memang desainnya

`?location=` menyaring di server, jadi row cabang lain **tidak ikut terkirim**.
Tapi backend tidak tahu siapa yang bertanya. Dua hal yang harus kamu jaga:

- **`location` harus berasal dari permission manager, bukan dari URL.** Kalau
  diambil dari query param yang dikontrol browser, manager A tinggal mengedit
  URL untuk melihat cabang B.
- **Upload cabang harus divalidasi.** `POST /datasets/{id}/append` mengembalikan
  `locations` — daftar cabang yang benar-benar ada di file itu. Backend
  **tidak** memeriksa apakah pengunggah berhak atas cabang tersebut. Jadi
  manager Jakarta bisa mengunggah data Surabaya kalau server action tidak
  menolaknya.

### Penerima notifikasi tidak disimpan di backend

`POST /notifications/branch-digest` menerima `recipients` dari pemanggil. Backend
sengaja tidak menyimpan siapa manager cabang mana — kalau disimpan, siapa pun
yang bisa menjangkau backend bisa mengarahkan data cabang ke alamat mana saja.
Jadi halaman team-mu yang mengirimkan daftar penerimanya.

### Upload yang tumpang tindih: yang terbaru menang

Dulu kalau owner upload file besar lalu manager upload update cabangnya,
periode yang sama **dijumlahkan**. Terukur: satu manager re-upload 30 hari
menambah 21.019 unit palsu. Sekarang:

- beberapa transaksi di hari yang sama **dalam satu file** → dijumlahkan
- hari yang sama di **dua file** → upload terbaru menang

`CleaningReport.superseded_rows` menghitung baris yang diganti. Ini relevan buat
`MergePreview` (B13) nanti: "updated" vs "added" mengikuti aturan ini.

---

## 5. Endpoint baru di luar kontrak

```
POST   /api/v1/datasets/{id}/append?branch_label=     upload per cabang
GET    /api/v1/datasets/{id}/sources                  daftar file per dataset
GET    /api/v1/datasets/{id}/hierarchy                rollup cabang -> network
GET    /api/v1/datasets/{id}/params                   + PUT untuk set
GET    /api/v1/branches/{id}?location=                insight per cabang + transfer
GET    /api/v1/branches/{id}/list                     kode cabang di data
POST   /api/v1/branches/{id}/reconcile                cocokkan daftar cabang/email
GET    /api/v1/branches/{id}/{loc}/summary            pratinjau digest manager
POST   /api/v1/notifications/branch-digest            kirim digest (ada dry_run)
DELETE /api/v1/notifications/{id}/log                 reset anti-spam
GET    /api/v1/export/{id}/{kind}                     CSV: recommendations,
                                                      purchase-orders, forecasts,
                                                      data-health
```

### Branch insights (`/branches/{id}`)

Perbandingan antar-cabang pakai **rasio**, bukan hitungan mentah. Cabang dengan
33 SKU otomatis punya lebih banyak item berisiko daripada yang 27 SKU; kalau
diranking pakai hitungan mentah, cabang terbesar selalu terlihat terburuk.
Setiap cabang membawa `flags[]` yang membandingkan rate-nya dengan rata-rata
network.

**Profitabilitas sengaja tidak dihitung.** Biaya operasional cabang (sewa, gaji)
tidak ada di ekspor penjualan. Yang dilaporkan: stockout exposure, dead stock,
tren permintaan, dan seberapa susah data cabang itu diramal.

`transfers[]` berisi kandidat pemindahan stok antar-cabang. Setiap saran membawa
`caveat`: waktu dan biaya kirim antar-cabang tidak ada di data, jadi harus
dikonfirmasi orang. Sudah diuji supaya tidak mengambil stok dari cabang yang
sendirinya kekurangan, tidak mengirim melebihi stok lebih cabang asal, dan tidak
mengirim melebihi kebutuhan cabang tujuan.

### Params — service level sekarang diturunkan, bukan diisi

Jawaban untuk B14, tapi berubah bentuk dari yang kamu minta. Service level tidak
lagi ditanyakan langsung. Yang ditanyakan: **berapa rugi kalau kurang 1 unit, dan
berapa rugi kalau lebih 1 unit.**

```
cost_short / (cost_short + cost_over)

sayur    (500 vs 8.000)     ->  5,9%   -> pesan DI BAWAH ekspektasi permintaan
formula  (25.000 vs 300)    -> 98,8%   -> pesan di atas ekspektasi
```

Urutan resolusinya: `service_level` diisi manual → dari `cost_short`/`cost_over`
→ dari margin dan biaya simpan → 95% dan ditandai sebagai asumsi.

Sengaja dua field, bukan satu field per alasan. Pembusukan, keusangan, diskon,
kedaluwarsa semuanya cuma alasan kenapa stok sisa itu mahal, dan tiap industri
punya daftarnya sendiri.

**Untuk UI params:** input per kategori dengan bulk apply
(`{scope: "category", scope_value: "Minuman", values: {...}}`), override per SKU
hanya di mana perlu. Setiap rekomendasi membawa `missing_params` — field yang
jatuh ke default bawaan, jadi bisa ditandai di layar sebagai asumsi.

### Export CSV

Delimiter default `;` karena Excel di locale Indonesia membacanya begitu — CSV
koma bikin semua data numpuk di kolom A dan file-nya terlihat rusak. Ada baris
`sep=;` di awal (dibaca Excel, diabaikan tool lain) dan BOM UTF-8. Untuk pandas
pakai `?delimiter=,`.

Response-nya harus di-stream lewat server proxy, jangan ditautkan langsung dari
browser — alamat backend tidak boleh sampai ke browser.

---

## 6. TODO

### Kamu — P0

1. **Hapus 5 adapter di §1**, panggil endpoint langsung. Tanpa ini lima layar
   masih fixture.
2. **`location` dari permission, bukan URL.** Ini batas keamanan.
3. **Validasi cabang saat upload manager.** Cocokkan `locations` di response
   `append` dengan cabang yang dia pegang, tolak kalau tidak cocok.

### Kamu — P1

4. Layar yang sekarang `notBuilt` sudah bisa live: **Overview** (B9),
   **Demand & Sales** (B10), **Planning parameters** (B14).
5. **Alur owner/manager.** Untuk jalur CSV cabang→email: parse di frontend,
   panggil `POST /branches/{id}/reconcile`, tampilkan pratinjau
   (`exact` / `needs_confirmation` / `not_in_data` / `in_data_but_not_listed`),
   owner konfirmasi, baru buat invite lewat sistemmu. Jangan beri akses dari
   hasil fuzzy match tanpa konfirmasi — satu typo email = data cabang bocor.
6. **Notifikasi.** Panggil `/notifications/branch-digest` dengan penerima dari
   auth DB-mu. `dry_run: true` untuk pratinjau. Trigger paling sederhana:
   setelah forecast selesai, plus tombol "kirim sekarang".
7. **Tombol export** ke `/export/{id}/{kind}`, di-stream lewat server.

### Kamu — P2

8. Tampilkan caveat yang sudah disediakan backend, jangan disembunyikan:
   `censoring.method == "inferred"` (minta data stok), `lifecycle`, `dead_stock`,
   dan `caveat` di setiap transfer.
9. `organisation` dari auth layer-mu, bukan dari field backend.

### Backend — masih terbuka

- **B1 per-series history** — chart agregat sudah ada, per-SKU belum. Ini yang
  bikin sparkline dan chart per-produk masih kosong
- **B6 display names** — `item_name`, `location_name` dari `nama_produk`/`nama_cabang`
- **B13** `dry_run` + `MergePreview`
- **B12** activity log, **B15** scenario simulation
- **B3** `detail` yang benar-benar beda dari `title`
- Auth backend (shared secret), hapus CORS, `recommended_qty` integer

Kalau ada yang mau didahulukan dari daftar itu, bilang saja.

---

## 7. Cara jalanin dan mengecek

Instruksi di `migration-report.md` §6 sudah agak basi dalam dua hal: pakai path
Unix, dan `DISABLE_TIMESFM=1` **sudah tidak ada** — TimesFM sekarang tidak
dijalankan lokal.

```bash
# Windows
cd backend
py -3.11 -m venv .venv
./.venv/Scripts/python.exe -m pip install -r requirements.txt
./.venv/Scripts/python.exe -m uvicorn app.main:app --port 8000

# macOS / Linux
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m uvicorn app.main:app --port 8000
```

Model forecasting sekarang di GPU remote, dikonfigurasi lewat
`GPU_INFERENCE_URL` dan `GPU_INFERENCE_API_KEY` (lihat `backend/.env.example`).
**Tanpa itu backend tetap jalan penuh**, hanya memakai baseline statistik plus
koreksi kalender. Jadi kamu tidak perlu GPU untuk mengembangkan frontend.

Cek koneksi GPU: `py -3.11 backend/scripts/check_gpu.py`

Data demo:

```bash
py -3.11 scripts/generate_dataset.py            # punyamu, 8 cabang, 270 series
py -3.11 backend/scripts/make_demo_data.py      # 3 skema berbeda + per-cabang
```

Dataset-mu terpetakan otomatis tanpa preset: `tanggal_transaksi`, `qty_terjual`,
`kode_produk`, `kode_cabang`, `stok_akhir`, `harga_satuan`, `kategori` — 7 field,
health 95, 270 series. `nama_produk` dan `nama_cabang` belum terpakai (B6).

Tes backend:

```bash
cd backend
./.venv/Scripts/python.exe scripts/check_contract.py    # 25 invariant lintas-endpoint
./.venv/Scripts/python.exe scripts/smoke_test.py        # 39, pipeline end-to-end
./.venv/Scripts/python.exe scripts/test_branches.py     # 27, cabang + transfer + digest
./.venv/Scripts/python.exe scripts/test_overrides.py    # 10, arah override mapping
./.venv/Scripts/python.exe scripts/test_economics.py    # 17, service level dari biaya
./.venv/Scripts/python.exe scripts/test_lifecycle.py    #  8, SKU musiman vs mati
```

`check_contract.py` itu padanan `npm run check:fixtures` untuk sisi backend —
termasuk tes bahwa `?location=` tidak membocorkan cabang lain, dan bahwa cabang
yang salah ketik mengembalikan kosong, bukan seluruh network.

---

## 8. Keamanan dan kerahasiaan data

Semua opt-in. **Tanpa konfigurasi apa pun, tidak ada yang berubah** dari yang
sekarang kamu pakai — 6 tes memastikan itu, supaya tidak ada alasan untuk tidak
menyalakannya nanti.

### Shared key, bukan authentication

Identitas dan izin cabang tetap milik auth layer-mu. Backend cuma menolak apa
pun yang bukan server aplikasi ini.

```
BACKEND_API_KEY=...          # kosong = TERBUKA, dan log memperingatkan tiap boot
BACKEND_REQUIRE_TENANT=1
```

Kalau di-set, setiap request butuh dua header:

```
X-API-Key: <BACKEND_API_KEY>
X-Tenant-Id: <id perusahaan>
```

Tambahkan keduanya di `lib/backend/client.ts`. `/health` tetap terbuka untuk
monitoring.

### Isolasi tenant

Dataset distempel tenant yang mengunggahnya. Request dengan tenant berbeda
dapat **404, bukan 403** — mengonfirmasi bahwa sebuah id itu ada tapi milik
orang lain sudah merupakan kebocoran.

Pengecekannya ada di **satu middleware**, bukan di tiap rute. Dataset id
berawalan `ds_` dan job `job_`, jadi gate-nya membaca path. Rute yang kamu
tambahkan besok otomatis ikut terlindungi. Diuji ke 15 keluarga URL, bukan
sampel.

`GET /datasets` dan `/projects` juga tersaring — nama file saja (`PT_ABC_sales.csv`)
sudah cukup sensitif secara komersial.

### CORS dihapus

Sesuai permintaanmu di §5 migration-report. Semua panggilan sekarang
server-to-server, dan mengizinkan origin browser berarti satu-satunya yang
melindungi data adalah orang tidak tahu alamatnya.

### Deteksi data pribadi saat upload

Ekspor ERP sering membawa kolom yang tidak dibutuhkan forecast. Sistem memindai
**nilai**, bukan nama kolom, dengan format Indonesia sebagai kelas utama: NIK 16
digit, NPWP 15, nomor HP `08`/`+62`, email, koordinat presisi.

Hasilnya masuk ke `health.personal_data` dan jadi finding pertama. Kalau kolomnya
**dipakai forecast**, severity-nya `critical`; kalau cuma ikut terunggah,
`warning`.

**Dilaporkan, tidak pernah dihapus.** Kolom mana yang boleh dikirim itu keputusan
perusahaannya, dan membuang kolom diam-diam lebih buruk daripada menandainya.
Tindakan yang disarankan: map ke `ignore`, atau ekspor ulang tanpa kolom itu.

### Penghapusan data

```
DELETE /api/v1/datasets/{id}
```

Menghapus baris turunan **dan file yang diunggah**. Penghapusan yang menyisakan
CSV asli di `data/uploads` bukan penghapusan. Response menyebut jumlah baris per
tabel dan berapa file yang dibuang.

### Laporan privasi untuk ditunjukkan ke customer

```
GET /api/v1/datasets/{id}/privacy
```

Menjawab "data saya ke mana" dengan spesifik, bukan dengan jaminan:

- **Ke GPU forecasting:** hanya kuantitas permintaan, sebagai deret angka tanpa
  label. Nama dan kode barang, nama cabang, harga, dan kolom apa pun yang
  ditandai data pribadi **tidak dikirim**
- **Ke email/Slack digest:** kode barang, jumlah pesanan, dan sisa hari untuk
  **satu** cabang
- **Tidak pernah keluar:** file unggahan itu sendiri, identitas orang

Layak ditampilkan sebagai satu panel, karena ini yang ditanyakan calon pelanggan
mid-market sebelum mengirim data penjualan.

### Export tadinya bocor

`GET /export/{id}/recommendations` mengembalikan **semua cabang** ke siapa pun
yang punya dataset id. Layarnya sudah di-scope, unduhannya belum. Sekarang ada
`?location=`, dan itu bug di kode backend, bukan di kodemu.

### Secret tidak lagi diprint ke terminal

`mcp_setup.py` sebelumnya mencetak `GPU_INFERENCE_API_KEY` apa adanya — dan
output itu sering ditempel ke chat atau tampil saat share screen. Sekarang
diredaksi di terminal; file config yang ditulis `--write` tetap berisi nilai
aslinya.

### Yang masih belum ada

- **Audit log** siapa melakukan apa. Butuh identitas dari sisimu, dan ini
  sekaligus gap B12
- **Enkripsi at-rest** untuk `data/uploads` dan SQLite. Sekarang mengandalkan
  enkripsi disk host
- **Rate limiting.** Backend tidak punya
- **Rotasi key.** Ganti `BACKEND_API_KEY` berarti restart

Untuk pitch: yang boleh diklaim adalah *deteksi data pribadi*, *isolasi tenant*,
*penghapusan yang mencapai file asli*, dan *hanya deret angka tanpa label yang
keluar ke GPU*. Yang **belum** boleh diklaim: enkripsi at-rest dan audit trail.

---

## 9. Perubahan terbaru — mock mode, node view, gating owner

Empat hal berubah setelah §8. Dua di antaranya menyentuh kode yang sudah kamu
tulis, jadi baca dua yang pertama.

### 9.1 Urutan `steps[]` berubah — ini bisa mengubah tampilan processing screen

Dulu `JOB_STEPS` menaruh *"Generating forecasts"* **sebelum** *"Backtesting and
selecting"*. Itu tidak cocok dengan urutan pipeline sebenarnya: kandidat model
bertanding dulu, pemenangnya dipilih, **baru** pemenang itu meramal.

Akibatnya indikator step **berjalan mundur** di tengah setiap run — dari step 5
ke step 4 — lalu maju lagi. Kalau kamu pernah lihat itu dan menganggapnya bug
polling di sisimu, bukan: itu backend.

Urutan sekarang:

```
upload · profile · clean · classify · validate · forecast · decide
```

`key` setiap step tidak berubah, jadi kalau kamu render `steps[]` apa adanya
dalam urutan array, tidak ada yang perlu kamu sentuh. Yang perlu diubah hanya
kalau kamu **hardcode** urutan atau memetakan `key` ke posisi tetap.

Penyebab aslinya juga diperbaiki: indeks step sekarang diturunkan dari `stage`
yang dilaporkan pipeline (`STAGE_TO_STEP`), bukan dari kata `status`. Enum
`status` tetap **persis sama** — tidak ada nilai baru, karena itu kontrak yang
kamu pakai untuk tipe. Alasan dipisah: `status` tidak punya nilai untuk
"deciding", jadi dua stage terakhir harus berbagi satu kata, sementara indeks
step tidak punya batasan itu dan harus selalu maju.

### 9.2 What-if sekarang owner-only — signature `simulate` berubah

Dulu: `simulate(datasetId, scenario)` dengan `requireSession()` — **manager mana
pun bisa menjalankannya.**

Sekarang: `simulate(projectId, datasetId, scenario)` dengan
`requireForecastOwner(projectId)`.

Dan `ScenarioSimulator` tidak lagi menerima prop `datasetId`. Prop `run`
sekarang `(scenario) => Promise<ScenarioOutcome>`, di-bind di server:

```tsx
run={simulate.bind(null, projectId, project.dataset_id)}
```

Browser jadi tidak pernah tahu dataset mana yang sedang disimulasikan dan tidak
bisa mengarahkannya ke dataset lain.

**Kenapa owner, bukan manager.** Tuas di panel itu lead time supplier, service
level, MOQ, dan kapasitas order. Itu semua syarat komersial tingkat jaringan,
bukan pilihan operasional satu cabang — manager yang menggesernya sedang
merencanakan dengan angka yang bukan dia yang tetapkan, di atas katalog yang dia
cuma lihat sebagian.

Manager tidak mendapat layar kosong. Panelnya diganti penjelasan, karena fitur
yang hilang tanpa keterangan terbaca sebagai rusak. Tapi yang jadi kontrol bukan
UI itu — **`requireForecastOwner` di dalam action**, karena Server Action bisa
dipanggil langsung lewat POST tanpa halaman yang merendernya.

Dua helper baru di `auth/session.ts`, keduanya di-reexport dari `lib/session.ts`:

| Helper | Sifat | Untuk |
| --- | --- | --- |
| `isForecastOwner(id)` | `Promise<boolean>`, tidak throw | halaman yang memutuskan merender atau tidak |
| `requireForecastOwner(id)` | throw `notFound()` | Server Action dan write |

Dataset yang tidak diklaim cabang mana pun menjawab `true` — aturan yang sama
dengan `requireForecastAccess`, dan tidak memberi akses baru karena pemanggil
yang sampai ke dataset tak-berklaim sudah bisa membaca seluruhnya.

### 9.3 Route baru: `/projects/[projectId]/network`

Peta jaringan cabang. **`[projectId]` di sini adalah auth project id**
(`prj_...`), bukan forecast project id — sama seperti `/team`, berbeda dengan
`/dashboard`. Dua namespace berbeda di satu segmen URL; jangan tertukar.

Satu route, dua produk, persis pola `/team`:

- **owner** → semua cabang di project, sebagai node mengelilingi satu pusat
- **manager** → hanya cabang yang dia pegang

`requireProjectAccess` yang menyaring, jadi halamannya tidak pernah memfilter
berdasarkan peran sendiri. Rata-rata jaringan dihitung tapi **hanya diberikan ke
owner** — tidak ada alasan manager butuh angka yang menggambarkan cabang yang
bukan tanggung jawabnya.

Warna node = porsi katalog cabang yang akan habis di dalam horizon, dihitung
dari `inventory.bands` yang backend kirim. Komponennya **tidak pernah**
memutuskan risiko, hanya menjumlahkan. Ambang warnanya (5% / 15% / 30%) adalah
penilaian, dan dicetak di legend supaya tidak tersembunyi.

Node digambar kosong (garis putus-putus) kalau `Sourced.live` false. Itu sengaja:
angka fixture identik untuk setiap cabang, jadi merendernya berarti mewarnai
enam node dengan warna yang sama lalu menyebutnya peta jaringan.

Setiap node bisa di-**tab** dan merespons focus, bukan hover saja — chart yang
butuh mouse adalah chart yang sebagian orang tidak bisa baca.

### 9.4 Mock mode: backtest tersampel

`MOCK_MODE=1`, atau `{"mock": true}` per request di
`POST /datasets/{id}/forecast`.

Bukan angka karangan. Yang terjadi: sebagian representatif dari **setiap demand
class** di-backtest sungguhan, lalu sisanya mewarisi rata-rata terukur
class-nya.

Kenapa ini sah dan bukan akal-akalan: **seleksi model memang sudah bekerja
begitu.** Dengan 2 validation window, aturan di `backtest.py` menolak pilihan
per-series dan menerapkan default per demand class ke semuanya — di data VN2 itu
599 dari 599 series. Jadi run tersampel mencapai **keputusan yang sama** dengan
run penuh; yang hilang cuma tampilan akurasi per item.

Jejaknya dibawa ke mana-mana, karena WAPE karangan yang sampai ke slide lebih
buruk daripada demo yang lambat:

- setiap series estimasi menuliskannya di `reason`-nya sendiri
- `/health` melaporkan `mock_mode`
- `GET /datasets/{id}/health` membawa `validation` + finding `sampled_validation`
- `run_forecast` mengembalikan `validation`

Satu hal yang **tidak** bisa disalin antar series: RMSE itu dalam unit, dan
safety stock dihitung dari situ. Jadi RMSE dibawa sebagai rasio terhadap mean
demand pemiliknya lalu diskalakan ulang ke tiap series. Kalau disalin mentah,
barang slow mover dapat buffer sebesar barang fast mover — dan itu muncul di
layar sebagai usulan pesan ribuan unit.

### 9.5 Temuan: band `watch` tidak pernah muncul di setelan default

`classify_risk` memberi `watch` kalau `coverage_days < lead_time_days * 2`
**dan** tidak habis di dalam horizon. Dengan default `lead_time_days = 14` dan
horizon 30: butuh coverage di atas 30 tapi di bawah 28. Mustahil.

Jadi kosakata risiko punya 4 band tapi cuma 3 yang bisa terjadi. Kalau kamu
sudah bikin state dan warna untuk `watch`, itu **belum pernah** kamu lihat
terpakai.

Perbaikannya sepele — set `lead_time_days` ke 21 atau lebih:

```
PUT /api/v1/datasets/{id}/params   {"lead_time_days": 21}
```

Belum kuubah defaultnya karena 14 hari itu asumsi bisnis, bukan bug, dan
mengubahnya menggeser setiap rekomendasi. Keputusan kalian.

### 9.6 Dataset demo untuk node view

```
py -3.11 backend/scripts/make_network_demo.py
```

Menghasilkan dua file di `data/demo/network/`:

| File | Isi |
| --- | --- |
| `penjualan_jaringan.csv` | 6 cabang · 311 series · 264.661 baris · 22 MB · harian, Jan 2024 – Apr 2026 |
| `cabang_pic.csv` | `kode_cabang, nama_cabang, kota, nama_pic, email_pic, telepon_pic` |

Kesehatan cabangnya **dirancang**, supaya enam node keluar dengan warna yang
berbeda — peta yang semuanya satu warna tidak mengajarkan apa pun, dan peta yang
semuanya merah terbaca seperti import gagal:

Kolom "terukur" itu hasil menjalankan pipeline sungguhan, bukan niat generator.
Keduanya harus sama; kalau beda, generatornya yang salah.

| Cabang | Kota | Item | Rancangan | Terukur | Node |
| --- | --- | --- | --- | --- | --- |
| JKT01 | Jakarta Pusat | 86 | 3% | **3%** | hijau |
| BDG01 | Bandung | 54 | 9% | **9%** | amber |
| SMG01 | Semarang | 41 | 20% | **20%** | oranye |
| SBY01 | Surabaya | 68 | 26% | **26%** | oranye |
| MDN01 | Medan | 37 | 41% | **41%** | merah |
| DPS01 | Denpasar | 25 | 56% | **56%** | merah |

Butuh tiga kali perbaikan supaya dua kolom itu sama, dan dua penyebabnya layak
dicatat karena keduanya bukan soal data demo:

**Item sparse tidak bisa dibuat tampak at-risk, di level inventory mana pun.**
Coverage dinilai dengan menyusuri forecast, dan pada series intermittent titik
forecast runtuh ke nol — TimesFM mengembalikan 0,14 unit/hari untuk item JKT01
yang rata-rata 30 hari terakhirnya 55,8. Stok tidak pernah habis melawan
forecast nol, jadi item itu melapor `healthy` apa pun isinya. Jadi porsi
attention diambil hanya dari pola non-sparse.

**Versi pertama file ini 34% intermittent + lumpy, dan itu kesalahan.**
Foundation model hanya unggul 2,0% atas moving average di demand intermittent —
itu segmen terlemah yang sudah kami ukur sendiri — jadi menaruh sepertiga demo
di atasnya berarti membidik titik terlemah sendiri. Sekarang 12%, dan item
sparse mendapat volume yang realistis (0,5–4 unit/hari, bukan 6–120). Dampaknya
terukur:

| | Sebelum | Sesudah |
| --- | --- | --- |
| Series diramal jauh di bawah demand | 107 dari 311 (34%) | **20 dari 311 (6%)** |
| Total unit/hari yang terlewat | ribuan | **32, se-jaringan** |

20 series sisa itu rata-rata 1,6 unit/hari. Untuk barang selambat itu "tidak
perlu pesan" memang jawaban yang benar, jadi sisanya wajar. Yang tidak wajar
adalah versi sebelumnya, yang bilang "tidak perlu pesan" untuk barang 55
unit/hari.

SKU-nya **sengaja tumpang tindih** antar cabang, supaya rekomendasi transfer
punya barang nyata untuk dipindahkan. Ukuran katalognya berbeda-beda karena luas
node menyandikannya.

Yang ditanam cuma posisi inventory, karena inventory adalah satu-satunya kolom
yang menentukan warna. Demand-nya model sungguhan: ritme mingguan, siklus
gajian, ramp Lebaran yang bergerak mengikuti kalender lunar, dalam empat pola
Syntetos-Boylan.

`cabang_pic.csv` memuat nomor telepon format Indonesia **dengan sengaja** —
upload dan pemindai data pribadi harus menandainya. Itu fiturnya bekerja.

Untuk pitch, sebut ini apa adanya: angka rupiah dan warna cabang berasal dari
data yang kami bangkitkan. Pipeline, kompetisi model, dan aturan keputusannya
nyata; file ini panggung, bukan bukti.
