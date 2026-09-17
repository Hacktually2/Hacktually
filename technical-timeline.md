# Pilihan model, hasil ukur, dan technical timeline

Per 2026-09-18. Dokumen untuk prep pitching — isinya cuma angka yang bisa
kubuktikan dari repo ini, plus label jelas di bagian yang masih estimasi.

Semua angka accuracy di dokumen ini keluar dari `data/app.db` tabel
`model_selection`, dataset `ds_f6979759ea85` — **VN2 retail, 599 series, data
nyata**, bukan data sintetis kita. Cara reproduce ada di bagian terakhir.

---

## 1. Bagaimana TimesFM sebenarnya dilatih

Ini pertanyaan yang kamu perlu bisa jawab dalam 10 detik, karena jawabannya
sekaligus menjelaskan kenapa hasil kita seperti di bagian 3.

**Korpus TimesFM 1.0 (yang dipublikasikan, ICML 2024) — ~100 miliar time point:**

| Sumber | Sifatnya | Porsi |
| --- | --- | --- |
| Wikipedia Pageviews | **nyata** — perilaku manusia, hourly→monthly | mayoritas |
| Google Trends | **nyata** — volume pencarian | besar |
| Data sintetis | ARMA, sinusoid musiman, tren linear/eksponensial, step function | pelengkap |
| M4, electricity, traffic, weather | **nyata** — dataset benchmark klasik | kecil |

Jadi jawaban singkatnya: **nyata, tapi bukan data yang mirip data customer
kita.** Korpusnya adalah traffic web, konsumsi listrik, lalu lintas jalan, dan
pencarian Google. Di dalamnya **tidak ada** penjualan SKU level toko, tidak ada
data distributor B2B, tidak ada satu pun series ritel Indonesia.

Detail korpus TimesFM 2.0/2.5/3.0 tidak dirinci sedetail itu di publikasi —
yang diumumkan cuma korpusnya diperbesar. Jadi jangan klaim angka spesifik
untuk versi 3.

TiRex-2 (NX-AI, arsitektur xLSTM, model kecil ~35M parameter) setahuku dilatih
atas campuran korpus nyata + sintetis bergaya KernelSynth. **Ini dari ingatanku,
belum kuverifikasi dari sumber primer** — kalau mau masuk slide, cek dulu.

### Kenapa ini penting untuk pitch

Ini yang membuat kalimat *"zero-shot foundation model"* jadi jujur, bukan hype:

> Modelnya belum pernah melihat data penjualan Indonesia. Yang dia bawa adalah
> kemampuan umum mengenali pola temporal — level, tren, musiman, dan bentuk
> distribusi. Itu cukup untuk jadi titik awal yang kompeten tanpa training, dan
> **tidak** cukup untuk jadi ahli domain. Sisanya kerjaan layer kita.

Dan ini bukan retorika — bagian 3 menunjukkan persis pola itu di angka.

### Satu poin metodologis yang kuat

TimesFM dilatih **di atas** M4, electricity, dan traffic. Jadi setiap benchmark
yang melaporkan kemenangan TimesFM di dataset-dataset itu punya masalah
kontaminasi train-test. Kita tidak memakai satu pun dari dataset tersebut. Kita
mengukur di VN2 — data kompetisi ritel 2024 yang hampir pasti tidak ada di
korpus mana pun. **Angka kita lebih kecil dari angka di paper justru karena
pengukurannya lebih bersih.** Kalau ada juri teknis, ini kartu terbaik kita.

---

## 2. Tujuh kandidat, dan kriteria yang mengeliminasi

Kriteria diurut berdasarkan yang **mengeliminasi**, bukan yang enak didengar:

1. **Bobot bisa di-self-host.** Bukan preferensi — ini syarat. Kita pitching ke
   Lintasarta yang menjual *sovereign cloud*. Produk yang mengirim data
   penjualan customer ke API vendor Amerika membatalkan seluruh value
   proposition tuan rumahnya sendiri.
2. **Lisensi boleh komersial.**
3. **Dukungan covariate known-future.** Tanpa ini kalender Lebaran tidak bisa
   masuk ke model.
4. **Output kuantil**, bukan cuma titik. Keputusan stok butuh distribusi.
5. Muat di satu GPU dan latensi masuk akal untuk ~600 series.

| Model | Self-host | Lisensi | Covariate | Kuantil | Putusan |
| --- | --- | --- | --- | --- | --- |
| **TiRex-2** (NX-AI) | ya | Apache-2.0 | ya | ya | **engine produksi** |
| **TimesFM-3** (Google) | ya | bobot riset saja | ya | ya | **benchmark** |
| TimeGPT (Nixtla) | **tidak** | API komersial | ya | ya | gugur di kriteria 1 |
| Chronos-Bolt (Amazon) | ya | Apache-2.0 | terbatas | ya | cadangan |
| Moirai (Salesforce) | ya | Apache-2.0 | ya | ya | cadangan serius |
| Lag-Llama | ya | Apache-2.0 | tidak | ya | gugur di kriteria 3 |
| TTM / TinyTimeMixers (IBM) | ya | Apache-2.0 | terbatas | terbatas | kandidat fine-tune |

Plus baseline klasik yang **tetap ikut bertanding** di setiap series, bukan
sebagai pembanding di slide: moving average, seasonal naive, Croston, TSB.

Alasan moving average selalu ikut: itu praktik yang dipakai customer sekarang.
Backtest yang mengeluarkan incumbent bukan backtest — kita memaksa satu pilihan
lalu membandingkannya dengan opsi yang kita tolak untuk diuji.

### Kenapa dua foundation model sekaligus, bukan satu

Karena hasil ukurnya (bagian 3) menunjukkan **selisih akurasi TimesFM vs TiRex
di bawah 1% di semua segmen.** Untuk urusan akurasi, pilihannya tidak penting.
Yang penting adalah **lisensinya**, dan itu pilihan arsitektur, bukan pilihan
model. Kalimat pitch-nya:

> Keduanya duduk di belakang satu adapter interface. Yang menentukan engine
> produksi bukan skor, karena skornya imbang — yang menentukan adalah mana yang
> boleh dijual. Itu sebabnya TiRex yang Apache-2.0 jadi engine, dan TimesFM
> jadi benchmark yang mengawasinya.

Alasanmu ("validasi baseline MVP, pretrained, cepat, bisa hosted lokal") benar
semua. Yang kurang cuma satu: itu alasan memilih **kelas model** (foundation
model zero-shot yang self-hostable), belum alasan memilih **model tertentu**.
Tabel di atas yang mengisi bagian itu.

---

## 3. Skor yang lewat gate — dan angka aslinya

### Gate yang kita pasang di PLAN.md

> Hour 15: TimesFM mengalahkan naive, atau narasinya berubah jadi validated routing.

Itu gate hackathon, dan lewat. Tapi untuk pitching gate itu terlalu longgar,
karena **naive bukan pesaing sebenarnya.** Pesaing sebenarnya adalah moving
average di Excel. Jadi ini angka terhadap pembanding yang benar.

### VN2 retail, 599 series data nyata, subset-matched

Metrik: MASE untuk intermittent/lumpy, WAPE untuk smooth/erratic. Lebih kecil
lebih baik. Kolom terakhir = perbaikan relatif terhadap moving average.

| Segmen | n | Model terbaik | Skor | vs moving average |
| --- | --- | --- | --- | --- |
| **intermittent** | 320 | tirex | 0.855 | **+2.0%** |
| **lumpy** | 191 | timesfm | 0.950 | **+8.7%** |
| **smooth** | 52 | timesfm+calendar | 0.522 | **+9.3%** |
| **erratic** | 36 | timesfm | 0.692 | **+13.9%** |

Rata-rata berbobot: **sekitar +5,5%** di seluruh portofolio.

Empat hal di tabel ini yang harus kamu siap dijawab, karena juri teknis akan
menemukannya:

**Croston dan TSB justru lebih buruk dari moving average.** Di intermittent
−2,1% dan −5,6%; di lumpy −7,1% dan −11,1%. Padahal dua metode itu memang
diciptakan untuk demand intermittent. Ini temuan nyata, dan ini yang membenarkan
adanya router: kalau kita percaya buku teks dan langsung memakai Croston untuk
setiap series intermittent, kita akan mengirim hasil yang **lebih jelek dari
Excel** ke 320 dari 599 series.

**Seasonal naive lebih buruk 20% dari moving average di series smooth.** Juga
berlawanan dengan intuisi. Alasannya sama: yang memutuskan adalah data
perusahaan itu, bukan nama metodenya.

**Kalender tidak membantu di dataset ini.** `tirex+calendar` 0,8555 vs `tirex`
0,8546 — praktis nol, malah sedikit lebih buruk. Itu **benar dan wajar**: VN2
adalah data Vietnam, jadi Lebaran tidak berlaku di sana. Yang bisa kita klaim
soal kalender saat ini cuma: efeknya terbukti di data yang efeknya kita tanam
sendiri (+46% di `distributor_generic.csv` sintetis). **Itu bukan bukti.** Ini
gap paling penting di daftar bagian 5.

**Foundation model menang di 100% series.** Dari 599 series, pemenangnya tirex
(53,4%), timesfm (37,9%), timesfm+calendar (8,7%) — baseline tidak menang sama
sekali. Hati-hati memakai ini: kedengarannya hebat, tapi lihat bagian berikut.

### Yang paling penting, dan paling tidak enak

Selisih antara model **terbaik yang tersedia** dan model **yang benar-benar kita
kirim**:

| Segmen | Foundation terbaik menang vs MA | Yang kita kirim menang vs MA |
| --- | --- | --- |
| intermittent | 72% series | **55% series** |
| lumpy | 81% | 76% |
| smooth | 83% | 73% |
| erratic | 86% | 75% |

Di intermittent kita meninggalkan **17 poin persen di meja.** Penyebabnya satu,
dan bisa diverifikasi langsung: dari 599 series, **599-nya** memakai alasan
seleksi yang sama —

```
320  only 2 validation points, using the intermittent segment default
191  only 2 validation points, using the lumpy segment default
 52  only 2 validation points, using the smooth segment default
 36  only 2 validation points, using the erratic segment default
```

Artinya **per-series selection yang kita sebut di pitch belum pernah sekali pun
aktif di data nyata.** Riwayat VN2 cuma cukup untuk 2 validation window, dan
aturan kita sendiri melarang memilih per series di bawah 3 titik — memilih model
berdasar 2 observasi itu fitting noise.

Aturannya benar. Tapi berarti klaim yang jujur saat ini adalah **"per-segment
selection, dengan per-series siap aktif begitu riwayat memadai"**, bukan
"per-series selection". Jangan sebut yang kedua. Kalau ada juri yang bertanya
lebih dalam dan menemukan ini, satu temuan itu bisa meruntuhkan kredibilitas
seluruh angka lain yang kita sebut.

Dan versi jujurnya justru terdengar lebih matang:

> Kami sudah punya per-series selection, dan di dataset ini dia tidak kami
> nyalakan — riwayatnya cuma cukup untuk dua validation window, dan memilih model
> dari dua observasi itu fitting noise. Jadi kami pakai segment default. Kami
> ukur harganya: 17 poin persen di segmen intermittent. Itu bukan bug, itu
> trade-off yang kami pilih sadar, dan dia hilang sendiri begitu customer punya
> riwayat 18 bulan.

---

## 4. Flow kita sekarang

```
CSV / Excel / banyak file sekaligus
  │
  ├─ profile: tipe, kardinalitas, sample values per kolom
  ├─ reshape: deteksi format wide, unpivot ke long        [schema/reshape.py]
  ├─ map: 3 tier — preset ERP → sinonim → heuristik       [schema/mapper.py]
  │     dikonfirmasi manusia sebelum apa pun jalan
  ├─ PII scan: NIK, NPWP, no HP, email, nama, koordinat   [schema/pii.py]
  │     dilaporkan, tidak pernah dihapus
  │
  ├─ clean: duplikat dalam-file SUM, lintas-file LATEST WINS
  │     lifecycle: aktif / dormant musiman / slow / at risk / discontinued
  │     health report + daftar series yang belum bisa diramal + alasannya
  ├─ enrich: kalender Indonesia (Lebaran, Ramadan, THR, gajian, sekolah)
  │     deteksi censored demand → hanya dilaporkan, tidak dikoreksi
  │
  ├─ segment: ADI + CV² (Syntetos–Boylan, cutoff 1,32 / 0,49)
  ├─ route: 6–8 kandidat per segmen, incumbent selalu ikut
  ├─ backtest: rolling origin, 2 window, train berhenti di batas validasi
  ├─ select: per segmen bila <3 titik validasi, per series bila cukup
  │     MASE untuk sparse, WAPE untuk padat, bias selalu dilaporkan
  ├─ forecast final: batched ke GPU (L40S, TiRex-2 + TimesFM-3)
  │
  ├─ decision: service level dari newsvendor (cost_short vs cost_over)
  │     safety stock = z × RMSE_backtest × √lead time
  │     ritel → qty pesan | manufaktur → qty produksi × BOM
  ├─ hierarchy: rollup bottom-up per cabang → jaringan (koheren by construction)
  ├─ branch insights: rate per cabang vs rata-rata jaringan, usulan transfer
  ├─ value sim: policy yang sama dijalankan di dua forecast, dihitung rupiahnya
  │
  └─ REST · MCP · CSV export · notifikasi email
```

Yang perlu kamu tahu soal ini saat pitching: **tidak ada satu langkah pun di
sini yang dikerjakan foundation model.** Model cuma mengisi satu kotak, yaitu
`forecast final`. Semua sisanya milik kita. Itu jawaban untuk *"ini kan cuma
wrapper TimesFM?"* — dan tabel di bagian 3 adalah buktinya, karena +5,5% dari
model tidak mungkin menghasilkan angka rupiah sendirian.

---

## 5. Kekurangan kita, diurut berdasarkan biaya

Diurut bukan berdasarkan mana yang paling gampang, tapi mana yang paling mahal
kalau dibiarkan.

**1. Kalender Lebaran belum terbukti di data Indonesia nyata.** Ini moat yang
kita klaim. Buktinya cuma di data sintetis yang efeknya kita tanam sendiri. Satu
dataset ritel Indonesia dengan riwayat melewati dua Lebaran akan menyelesaikan
ini, dan sebelum itu ada, klaim kalender harus disebut sebagai hipotesis berdasar
— bukan hasil.

**2. Stockout tidak bisa dideteksi dari data penjualan saja.** Sudah diukur, dan
kesimpulannya keras: precision terbaik 42,8% di recall 14,0%.

| multiple | precision | recall |
| --- | --- | --- |
| 1,5 | 19,8% | 28,2% |
| 2,0 | 23,8% | 24,2% |
| 3,0 | 33,8% | 17,9% |
| 4,0 | **42,8%** | 14,0% |

Dan tidak akan pernah bisa: minggu nol karena stok habis dan minggu nol karena
tidak ada permintaan **identik** di series penjualan. Informasinya tidak ada di
data. Kita duduk di ujung konservatif dan mengatakannya, karena satu false
positive menaikkan nol yang asli ke median — mengajari model menumpuk barang yang
tidak ada yang beli. Koreksi yang salah lebih mahal daripada koreksi yang
terlewat.

Dengan kolom inventory atau in-stock, deteksi yang sama jadi **eksak**. Jadi ini
bukan masalah algoritma, ini masalah akuisisi data: **satu kolom itu adalah
permintaan paling berharga yang bisa kita ajukan ke customer.**

**3. Intermittent adalah 53% portofolio dan segmen terlemah kita** (+2,0%). Ini
tidak kebetulan — intermittent adalah bagian yang paling jauh dari korpus
pelatihan TimesFM (traffic web dan listrik itu padat dan kontinu). Di sinilah
domain adaptation punya ruang paling besar, dan di sinilah fine-tuning masuk akal
nanti.

**4. Safety stock memakai RMSE backtest, bukan kuantil model itu sendiri.**
Padahal GPU sudah mengembalikan 9 kuantil dan kita sudah menyimpan `lower`/
`upper`. Kita menghitung ulang ketidakpastian dari error historis sementara model
sudah mengirim distribusinya. Ini yang paling murah diperbaiki di daftar ini, dan
paling defensible secara teknis.

**5. Harga dan promo tidak dipakai sebagai driver.** Kolomnya kita terima dan
petakan, tapi tidak masuk model. Untuk ritel, elastisitas harga sering mengalahkan
musiman.

**6. Item baru tidak dapat forecast sama sekali.** Tanpa riwayat, tidak ada
output. Padahal di ritel item baru justru yang paling butuh dan paling sering
salah pesan.

**7. Belum ada audit log, enkripsi at-rest, dan rate limiting.** Sudah tercatat
di `backend-handoff.md` §8. Jangan diklaim.

---

## 6. Technical timeline

Rencanamu — sertifikasi dulu, lalu sebar forecasting gratis untuk feedback,
sambil eksperimen model — urutannya perlu satu koreksi. Sisanya bagus.

### Koreksi: sertifikasi bukan langkah pertama

ISO 27001 itu **Rp 150–400 juta dan 6–12 bulan** (estimasi pasar Indonesia,
bukan angka terverifikasi), dan yang dia buka adalah **procurement enterprise.**
Tapi ICP kita mid-market, dan mid-market Indonesia tidak meminta ISO 27001. Jadi
membayar itu sebelum ada customer berarti membeli kunci untuk pintu yang belum
mau kita masuki.

Yang **wajib** dan bukan sertifikat: **UU PDP No. 27/2022**, berlaku penuh sejak
Oktober 2024. Itu hukum, bukan pilihan. Dan sebagian besar posturnya sudah kita
bangun — deteksi data pribadi, penghapusan yang mencapai file asli, isolasi
tenant, catatan spesifik data apa yang keluar dari service. Yang belum: audit
log, enkripsi at-rest, dan perjanjian pemrosesan data.

Lebih murah lagi: kalau jalurnya lewat marketplace Lintasarta/LAMPU, **Lintasarta
sudah memegang sertifikasi itu.** Terdaftar di sana berarti mewarisi sebagian
kepercayaannya tanpa mengeluarkan Rp 300 juta. Itu argumen kuat untuk
marketplace-first, dan argumen itu juga enak didengar oleh juri Lintasarta.

Security analyst tetap direkrut — tapi sebagai orang yang menutup 3 gap UU PDP
dan menulis dokumen posture, bukan sebagai orang yang mengejar sertifikat.

### Koreksi kedua: pilot jangan gratis

"Sebar gratis untuk dapat feedback" punya satu failure mode yang spesifik: pilot
gratis tidak menghasilkan komitmen yang dibutuhkan supaya mereka mengirim data
**asli** dan membaca hasilnya dengan serius. Yang kita butuh dari pilot bukan
feedback — feedback itu murah dan sering sopan. Yang kita butuh adalah **data**,
khususnya kolom inventory dari kekurangan #2.

Jadi: harga token (Rp 1–2 juta/bulan), atau gratis dengan syarat tertulis —
mereka mengirim riwayat 18 bulan termasuk kolom stok, dan satu jam wawancara per
bulan. Yang ditukar adalah data, bukan uang.

### Timeline

| Fase | Fokus teknis | Gate untuk lanjut |
| --- | --- | --- |
| **Bulan 0–1**<br>pasca-hackathon | Tutup kekurangan #4 (kuantil model untuk safety stock) dan #6 (cold start item baru). Audit log + enkripsi at-rest. Dokumen posture UU PDP. | Ada satu perusahaan Indonesia yang sudah mengirim CSV aslinya |
| **Bulan 1–4**<br>3–5 design partner | **Validasi kalender di data nyata** (#1) — ini satu-satunya yang benar-benar penting di fase ini. Minta kolom inventory, nyalakan deteksi stockout eksak (#2). Ukur ulang tabel bagian 3 di data Indonesia. | Kalender terbukti di ≥2 perusahaan, atau klaim moat-nya diganti |
| **Bulan 4–9**<br>bayar pertama | Per-series selection akhirnya aktif (riwayat sudah cukup). Harga/promo sebagai driver (#5). Benchmark Moirai dan Chronos-Bolt sebagai kandidat engine. Konektor ERP nyata (Accurate, Jubelio). | Retensi 3 bulan di ≥3 akun berbayar |
| **Bulan 9–18**<br>domain adaptation | Fine-tune model kecil untuk segmen intermittent (#3). Lihat hitungan di bawah. | Jumlah series-year sudah melewati ambang di bawah |
| **Bulan 18+** | Reranker seleksi model yang belajar dari seluruh tenant. Ini moat sebenarnya: bukan model yang lebih baik, tapi **tahu model mana untuk series seperti apa** — dan itu butuh banyak tenant, yang tidak bisa disalin. | — |

### Bisa latih model sendiri? Dataset dan budget

Tiga opsi, dan yang pertama harus dicoret sekarang supaya tidak dibahas lagi jam
3 pagi.

**A. Pretrain foundation model dari nol — tidak.** TimesFM 200M di 100 miliar
time point itu skalanya setara pretrain LLM kecil: **ribuan GPU-hour, kasar
USD 5.000–50.000** (estimasi, bukan angka terpublikasi), dan hasilnya hampir
pasti kalah dari checkpoint gratis yang sudah ada. Tidak ada jalan di mana ini
pilihan rasional untuk kita.

**B. Fine-tune model kecil untuk domain kita — ya, tapi digerbangi data.** TTM
(~5M parameter) atau Chronos-Bolt-small bisa di-fine-tune di satu GPU dalam
hitungan jam. Biaya komputasinya **tidak relevan — di bawah USD 200.** Yang
menggerbangi bukan uang, tapi volume:

```
butuh kasar 10.000–50.000 series-year untuk mengalahkan zero-shot
satu customer ≈ 400 series × 2 tahun     = 800 series-year
                                         → 25–60 customer
```

Jadi fine-tuning adalah **fungsi dari jumlah customer, bukan fungsi dari
budget.** Itu sebabnya dia ada di bulan 9–18 dan bukan sekarang, dan itu
jawaban yang bagus kalau ada juri menanyakannya.

Satu bahaya yang harus disebut: fine-tune di dataset satu customer lalu
melaporkan backtest di dataset yang sama adalah satu kesalahan yang bisa
mendiskreditkan semua angka lain yang kita sebut. Kalau fine-tuning jalan,
holdout-nya harus **per customer**, bukan per series.

**C. Latih yang bukan forecaster — ini yang paling undervalued.** Dua model yang
butuh data Indonesia yang cuma akan kita punya, dan dua-duanya jauh lebih murah
dari B:

- **Schema mapper.** Dilatih di ratusan export ERP Indonesia nyata. Forecaster
  itu komoditas — checkpoint-nya gratis untuk semua orang. Mapper yang pernah
  melihat 500 export Accurate dan Jubelio **tidak** bisa disalin, karena
  datanya tidak ada di internet.
- **Uplift kalender per kategori.** Estimasi seberapa besar Lebaran menaikkan
  kategori apa, dari data lintas-tenant. Ini bukan foundation model, ini tabel
  koefisien — dan tetap merupakan aset yang tidak dimiliki SAP.

Kalau kita cuma boleh melatih satu hal, latih mapper. Itu bagian tersulit dari
sistem ini dan satu-satunya bagian yang makin bernilai seiring customer makin
kecil.

---

## 7. Reproduce angka bagian 3

Semua yang di bagian 3 keluar dari SQLite, bukan dari catatan:

```bash
./backend/.venv/Scripts/python.exe -c "
import sqlite3, json, collections, statistics as st
c = sqlite3.connect('data/app.db'); c.row_factory = sqlite3.Row
DS = 'ds_f6979759ea85'   # VN2 retail, 599 series
rows = [dict(r) for r in c.execute('SELECT * FROM model_selection WHERE dataset_id=?', (DS,))]
prof = {r['series_id']: dict(r) for r in c.execute(
    'SELECT series_id, demand_class FROM series_profiles WHERE dataset_id=?', (DS,))}
by_class = collections.defaultdict(list)
for r in rows:
    r['candidates'] = json.loads(r['candidates'] or '{}')
    by_class[prof.get(r['series_id'], {}).get('demand_class', '?')].append(r)
for cls, g in sorted(by_class.items(), key=lambda kv: -len(kv[1])):
    pm = g[0]['primary_metric']
    common = set(g[0]['candidates'])
    for r in g: common &= set(r['candidates'])
    means = {m: st.mean(r['candidates'][m][pm] for r in g) for m in common}
    base = means.get('moving_average')
    print(f'{cls} n={len(g)} metric={pm}')
    for m, v in sorted(means.items(), key=lambda kv: kv[1]):
        print(f'   {m:24s} {v:.4f}  {(base-v)/base*100:+5.1f}% vs MA')
"
```

Cek alasan seleksi (temuan bagian 3 yang paling penting):

```bash
./backend/.venv/Scripts/python.exe -c "
import sqlite3, collections
c = sqlite3.connect('data/app.db')
for k, v in collections.Counter(r[0] for r in c.execute(
    \"SELECT reason FROM model_selection WHERE dataset_id='ds_f6979759ea85'\")).most_common():
    print(f'{v:4d}  {k}')
"
```

Status GPU:

```bash
curl.exe -s https://refried-pox-shininess.ngrok-free.dev/health
# {"timesfm":{"status":"ok","model":"timesfm-3","cuda":true,"gpu":"NVIDIA L40S"},
#  "tirex":{"status":"ok","model":"tirex-2","cuda":true,"gpu":"NVIDIA L40S"}}
```

---

## 8. Tiga angka untuk dihafal

Kalau cuma bisa mengingat tiga hal dari dokumen ini:

1. **+5,5% dibanding moving average di 599 series data nyata** — dan +13,9% di
   erratic, +2,0% di intermittent. Sebut rentangnya, bukan cuma yang bagus.
2. **Croston dan TSB lebih buruk dari Excel di data ini** (−5,6% dan −11,1% di
   intermittent). Itu pembenaran keberadaan router, dan itu temuan yang cuma bisa
   didapat kalau benar-benar mengukur.
3. **Per-series selection belum pernah aktif di data nyata** — 599 dari 599
   series memakai segment default, dan harganya 17 poin persen di intermittent.
   Sebut ini sebelum juri menemukannya.
