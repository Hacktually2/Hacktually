User: ok so im getting into hackathon. my track is b2b demand forecasting. possibly we'll use n train ai. help me make research framework to get into startup pipeline hackathon and win it/step by step and validation first. use the internet, researches, tips, business praxtixes, etc

Claude: I'll research this properly — current forecasting tech, how startup-pipeline hackathons actually judge, and validation methods — then build you the framework. Before the framework, one thing worth flagging: I couldn't find a company called "n train ai," so I'm reading that as "and train AI." If it's a specific sponsor tool, tell me and I'll adjust the tech section.

---

## The strategic premise

Two facts should shape everything you do:

**1. The rubric decides, not the code.** Judging criteria drive more outcome variance than technical merit — a rubric weighting "innovation" at 40% rewards a clever angle on a simple problem, while one weighting "business viability" demands a pitch deck as much as a demo. Most teams skim it once. Get it before you pick your idea. If it's not published, email the organizers.

**2. In demand forecasting specifically, accuracy is not the product.** The sharpest framing I found: if the forecast doesn't change a buying, stocking, staffing, or production decision, it's reporting, not forecasting. Every team in your track will show a MAPE number. The team that shows *rupiah saved because a purchase order changed* wins. Build backwards from the decision.

---

## Phase 0 — Recon (do this week)

- Get the rubric, prize structure, and what "startup pipeline" actually means (equity? accelerator seat? just a demo day slot?). That determines whether judges want a *company* or a *hack*.
- Research the judges. VC judges score market size and wedge. Corporate/supply-chain judges score whether it survives contact with their ERP. Engineer judges score the eval methodology.
- Find out what sponsor tech gives bonus points. Free credits are usually a scoring lever in disguise.

---

## Phase 1 — Market validation (the "validation first" part)

CB Insights' post-mortem of 483 failed startups found 42–43% died from building something with no market need — the single most common cause of failure, and a reliable read takes 10–20 interviews, not three. You won't get 15 before the hackathon, but 5–8 real conversations will put you ahead of literally every other team.

**Pick a narrow ICP, not "B2B."** Candidates in your market, roughly in order of accessibility from Jakarta:
- Mid-size FMCG distributors (sub-distributors, 50–500 outlets) — ineffective demand forecasting creates stock imbalances across distribution points, producing excess inventory and stockouts simultaneously
- D2C/marketplace brands selling across Shopee + Tokopedia + offline — each platform has different demand DNA, and one forecast cannot serve three channels
- Restaurant/F&B supply groups (perishables, so error costs are brutal and immediate)

**Interview rules.** Ask about specific past behavior ("the last time this happened, what did you do?") instead of hypothetical opinions ("would you use this?"), because hypotheticals produce false validation.

Your question spine:
1. Walk me through how you decided last month's purchase order. Who touched the spreadsheet?
2. Tell me about the last time you were badly out of stock. What did it cost? What did you do after?
3. How much stock is sitting there right now that you regret buying?
4. What have you already tried — Excel template, ERP module, a consultant? Why did you stop?
5. Who signs off on new software, and what's the number where they stop needing to think about it?

That last one matters because in B2B the person experiencing the pain rarely controls the budget — the person experiencing the problem, the person deciding the purchase, and the person using it daily may be three different people, and you need all three.

**Kill criteria — decide these now, before you're emotionally invested.** If 5 interviews don't produce at least 3 people who can quantify the pain in money and name a current workaround they hate, change the wedge. A validated 'good' idea beats an unvalidated 'great' idea.

---

## Phase 2 — Technical validation

**Data.** Use a public dataset with real structure, and pick it for intermittency since B2B order patterns are lumpy. M5 is the benchmark — the item/department/store/state hierarchy forces you to think about how forecasts aggregate, and there's a large library of published baselines to compare against. The main gotcha: promotional and calendar effects sit in supplemental files that most teams process too late. Favorita is messier and more realistic when you need promo-aware forecasting. If you can get even one real distributor's CSV from an interview, that beats both — and it's a proof point in the pitch.

**Models.** Zero-shot foundation models let you skip training entirely, which is the right trade in a 24–48h build. Chronos-2 (Oct 2025) supports univariate, multivariate, and covariate-informed forecasting, beats tuned statistical models out of the box, and runs 300+ forecasts per second on a single GPU; TimesFM is battle-tested in Google's production environments. Fine-tune only if you have a specific reason and time to spare.

**Evaluation — this is where you separate from the field.**
- Use **rolling-origin backtesting**, not a single split. The forecast origin shifts forward by a fixed step and the model is refit, repeating until the test set is used up — but watch the trap: the rolling setup lets test data pass into the next step's training set, so it's naturally susceptible to leakage where future information reaches the model.
- Always beat a **seasonal naive baseline**. Report WAPE or MASE *and* bias. A forecast can post respectable accuracy while running systematically high or low, and that pattern matters far more than a single error metric — consistent over-forecasting inflates inventory and markdown risk, chronic under-forecasting drives repeat stockouts.
- Handle **censored demand**. When stockouts occur, observed sales understate true demand and bias both forecasts and replenishment decisions. Even acknowledging this out loud in your pitch signals you're not a Kaggle tourist.
- Run a **decision-consistent backtest**: rolling-origin simulations where each candidate model feeds the same replenishment policy, and outcomes — fill rate, average inventory, lost sales — become the comparison metrics. This is your money slide.

---

## Phase 3 — Build scope

Budget roughly the first 15% of time for validation and defining the target user, the next 65% for heads-down MVP work, and the rest for the pitch and rehearsal.

Cut to one wedge. A defensible demo is: *upload your sales CSV → see next 8 weeks per SKU with uncertainty bands → get a ranked reorder list with quantities → see the rupiah delta vs. what you would have ordered.* That last screen is the whole pitch.

Skip: auth, multi-tenancy, settings pages, a chatbot. <cite name="17-1" index="17-1">Always have a pre-recorded video of your working app in case the WiFi drops or an API fails during judging.</cite>

---

## Phase 4 — The pitch

One common mistake: teams spend two or three minutes on a startup pitch rather than showcasing the hack, dedicating only the last minute to the thing they built. Demo the project first. Write the 90-second demo script before writing any code — if you can't describe the problem, the trigger, the "aha" moment, and the close in one page, you don't yet know what you're building.

Numbers worth having ready:
- IHL Group puts global inventory distortion — out-of-stocks plus overstocks combined — above $1.7 trillion.
- Traditional approaches stall around 60–75% accuracy on complex B2B demand; ML pushes 80–92%. McKinsey and APICS research points to 20–30% lower inventory and double-digit fill-rate improvement when implemented well.
- Over 60% of order fulfillment failures in Southeast Asian SMEs trace back to inaccurate inventory data, not actual stock shortages.

Anticipate the killer question: *"Why won't the incumbent ERP just add this?"* Your answer should be the wedge — Indonesian demand calendars (Ramadan/Lebaran, payday cycles, regional holidays), distributor-specific data shapes, or a workflow the ERP vendor won't touch. Also be ready on data readiness: when data quality drops below roughly 85%, failure rates jump sharply and projects stall before the business sees value. Turn that into a feature — a data-health check as onboarding step one.

---

## Phase 5 — Getting into the pipeline

The hackathon prize and the accelerator seat are judged differently. For the pipeline, they're underwriting *you continuing*. So bring: a named design partner from your interviews who'll say yes on record, a 90-day pilot plan (the standard shape is 25–50 SKUs over 90 days, with early signals at 60 days: accuracy up 10–15 points, inventory down 15–20% on pilot items), and clear team roles. Follow up with every judge and mentor within 24 hours.

---

Two things would sharpen this a lot: which hackathon and what the timeline is, and whether "n train ai" is a specific sponsor tool. Send those and I'll turn this into a working doc with a day-by-day schedule and an interview script you can actually take into calls.

User: ok so our track is

PT Aplikanusa Lintasarta
Demand Forecasting - Manufaktur & Ritel
Mengembangkan solusi prediksi permintaan berbasis data untuk membantu sektor manufaktur dan retail memperkirakan kebutuhan pasar, mengoptimalkan persediaan, serta meningkatkan efisiensi operasional.

i dont really know why this company provides demand forecasting lol. market analysis and more structured research pls. also scalable (usable by more companies) demand forecasting vs specific???

Claude: ## Part 1: Why Lintasarta is running this track

This is the most useful thing to understand, because it tells you what "winning" means to them.

Lintasarta is not a software company. Founded in 1988, it's the ICT arm of Indosat Ooredoo Hutchison, and it has spent the last two years repositioning itself as the "AI Factory" of the IOH group, built on what they call the 4Cs — connectivity, cloud, cybersecurity, collaboration — and it's the only NVIDIA Cloud Partner in Indonesia. They sell GPU capacity (Deka GPU, GPU Merdeka), managed LLM inference (Deka LLM, OpenAI-compatible, hosted in Indonesia and billed in Rupiah so customer data stays in national jurisdiction), and sovereign cloud — including a partnership with Accenture on a sovereign AI cloud platform.

Then, on 27 January 2026, they launched **LAMPU** (Lintasarta AI Marketspace Universe) — a one-stop marketspace bundling SaaS, compute, APIs, data services, cybersecurity, connectivity, and prediction/analytics models, all running on Lintasarta's own infrastructure. The critical line from the launch: LAMPU opens access for technology partners, startups and software providers to bring their solutions to a wider market, via API connectors, cloud-native integration and direct-deployment, with pay-as-you-go, subscription and enterprise licensing models.

So the answer to "why does a telco care about demand forecasting":

1. **They have an empty shelf.** A marketplace launched eight months ago needs products on it. Demand forecasting is the single most commercially obvious enterprise AI use case.
2. **They have the customers already.** Lintasarta serves roughly 2,300–2,400 corporate clients across finance, resources, government, manufacturing, services and trading/distribution. Manufacturing and retail distribution are existing accounts where they currently sell pipes and racks, not intelligence — which is low-margin and commoditising.
3. **Forecasting is a compute-consuming workload.** Every forecast you run is GPU-seconds on Deka. You're a demand driver for their core business.
4. **Sovereignty is the differentiator they're selling.** A manufacturer won't put sales data in a US cloud if a local, compliant alternative exists. Your product is the reason to choose theirs.

**What this means for you, concretely:**

- Build on Deka GPU / Deka LLM / Deka Notebook if credits are offered. It's not just rubric points — it proves you understand their business model.
- Design your solution as something that could be **listed on LAMPU**. Multi-tenant, API-first, metered consumption. Say the word "LAMPU" in your pitch. Almost no other team will.
- Lead with data sovereignty in your pitch. Indonesian data, Indonesian infrastructure, Rupiah billing.
- Assume at least one judge is a Lintasarta commercial person asking: *can I sell this to my existing manufacturing accounts next quarter?* Optimise for that question.

---

## Part 2: Market analysis

**The macro numbers are genuinely strong for this track.** Indonesia's 2025 GDP was IDR 23,821.1 trillion (~USD 1.4 trillion). Manufacturing was the largest sector at 19.07% of GDP — its highest share in recent years — followed by wholesale and retail trade at 13.17%. Your track sits on top of roughly a third of the national economy.

**Countable buyers.** BPS's manufacturing directory counted around 30,000 medium and large manufacturing establishments; Statista pegs manufacturing value added at ~USD 216.6 billion across ~25,000 enterprises and 6 million workers. That's a real, addressable, enumerable market — not a hand-wave.

**Rough sizing you can defend on a slide:**
- *TAM*: ~30,000 medium/large manufacturers + organised retail/distribution chains.
- *SAM*: firms with digitised sales history (ERP or at least a POS/distributor app). Realistically a minority — call it 15–25%, and say so honestly. Judges trust teams who discount their own TAM.
- *SOM*: Lintasarta's existing ~2,300 corporate accounts, of which manufacturing + trading/distribution is a named segment. **This is your unfair advantage and you should say it out loud: "our go-to-market is your customer list."**

**The pain is documented locally.** Ineffective demand forecasting creates stock imbalances across distribution points, producing excess inventory and stockouts simultaneously — and over 60% of order fulfilment failures in Southeast Asian SMEs trace to inaccurate inventory data rather than actual shortages. Globally, inventory distortion (out-of-stocks plus overstocks together) sits above USD 1.7 trillion.

**Competitive landscape** — know these names before a judge says them:
- *SAP IBP, Oracle, Blue Yonder* — enterprise incumbents. Expensive, long implementations, generic seasonality. Your wedge: local calendars, faster time-to-value, Rupiah pricing.
- *Local ERP/DMS vendors* (SimpliDOTS, HashMicro, Jubelio, Mekari) — they own the workflow but forecasting is a weak bolt-on module. Your real risk: they add it. Your answer: partner or be better at the one thing.
- *Spreadsheets* — your actual main competitor. Never mock it; explain why it fails at scale.

---

## Part 3: Scalable vs specific — the real answer

Short version: **vertical wedge on a horizontal spine.** But let me give you the reasoning, because you'll be asked.

**The market evidence favours vertical.** Vertical SaaS with AI is growing up to three times faster than horizontal competitors, charging higher premiums, with better retention. Vertical startups took 53% of venture deal volume across 4,395 financings in 2025, with manufacturing among the leading sectors. And horizontal unit economics break in a specific way worth memorising: a flat subscription with unlimited AI usage means inference costs scale with customers, which pushes gross margin negative.

The best framing I found: pick a sub-niche inside a large, profitable market, map **one recurring workflow**, and build for that workflow. The example given — a hospitality SaaS at $650K ARR that does hotel *pricing*, not "hotel management."

**But your sponsor needs horizontal.** LAMPU is a catalogue. A product that only works for one customer can't be listed, metered, and resold. Lintasarta's economics require repeatability.

**The resolution — three layers:**

| Layer | Design | Why |
|---|---|---|
| **Engine (horizontal)** | Foundation model (Chronos-2 / TimesFM) + hierarchy reconciliation + rolling-origin backtest harness + probabilistic output. Same code for every tenant. | Scales. Runs on Deka. Marketplace-listable. Zero retraining per customer. |
| **Context (semi-vertical, config)** | Indonesian demand calendar as a shared asset: Ramadan/Lebaran with its shifting lunar date, THR payout timing, payday cycles, regional holidays, school terms, monsoon. Plus industry templates (F&B manufacturing, pharma distribution, fashion retail). | This is your **actual moat**. SAP does not model Lebaran shift-by-year well. It's config, not code — so it's horizontal in delivery but vertical in value. |
| **Decision (vertical, per use case)** | The output the user acts on: for a manufacturer, a production plan; for a distributor, a reorder list with quantities and safety stock. | Where the money shows up. Pick **one** to demo. |

**Which sub-vertical to demo?** Score candidates on: data availability now, lead-time length (longer lead time = more forecast value), error cost asymmetry, and access to a real person you can interview this week. F&B manufacturing usually scores highest in Indonesia — it's a large sub-sector, demand is violently seasonal around Ramadan/Lebaran, shelf life makes overstock expensive, and there are more of these firms than anything else near Jakarta.

**How to say it in the pitch (this is the line that wins the "will it scale" question):**

> "One engine, many industries. We're demoing food & beverage manufacturing because the Lebaran demand swing makes it the hardest case. The industry-specific part is a configuration file, not a rewrite — onboarding a new vertical takes days, not a new codebase. That's what makes it listable on LAMPU."

That single answer satisfies the VC judge (focused wedge), the technical judge (clean architecture), and the Lintasarta judge (resellable to 2,300 accounts). Do not say "it works for any industry" — that reads as *we haven't thought about it*. Do not say "it only works for X" — that kills the marketplace story.

---

## Part 4: Watch-outs

- **The Lebaran trap.** A lunar-calendar holiday that moves ~11 days earlier each year destroys naive seasonality. If your demo shows a standard model getting Lebaran wrong and yours getting it right, that's your most memorable 15 seconds.
- **Don't claim a data moat you don't have.** At hackathon stage you have zero proprietary data. What you have is a *path* to one: every tenant's corrections improve the calendar and industry priors. Frame it as future, not present.
- **Pricing question.** Have an answer. Per-SKU-forecast metering aligns with Lintasarta's consumption model and protects gross margin — better than flat-rate.
- **Manufacturing and retail are different problems.** Manufacturing forecasts feed production planning with long lead times and BOM constraints; retail feeds replenishment with short cycles and promo effects. Pick one as primary and explicitly note you understand the difference. Trying to nail both in 48 hours will get you neither.

---

Biggest unknown left: do you have access to any real manufacturer or distributor — a family business, a friend's company, an internship contact — who'd give you 30 minutes and ideally a sales CSV? That single asset changes the whole strategy, because a demo on real Indonesian data beats a demo on M5 by a wide margin. If yes, tell me who and I'll build the interview script and the data-request email. If no, I'll build you the synthetic-Indonesian-calendar dataset plan instead.

User: menurutmu mending kita target usernya big company or middle sized or small companies?

Claude: Jawaban singkatnya: **mid-market**, dan sebaiknya kalian definisikan segmennya pakai kriteria operasional, bukan ukuran omzet. Ini alasannya.

---

## Kenapa bukan enterprise

Godaannya besar karena klien Lintasarta memang korporasi besar — sekitar 2.300–2.400 corporate client. Tapi untuk tim hackathon, enterprise itu jebakan:

1. **Mereka sudah punya solusinya.** Manufaktur besar di Indonesia umumnya sudah pakai SAP IBP, Oracle, atau minimal modul planning di ERP mereka. Pitch kalian berubah dari "kami menyelesaikan masalah" jadi "kami menggantikan sistem yang sudah dibayar mahal" — argumen yang jauh lebih sulit.
2. **Siklus penjualan 12–18 bulan.** Procurement, security review, legal, pilot committee. Untuk startup pipeline yang mengukur traksi dalam 6 bulan, ini mematikan.
3. **Kalian tidak akan dapat datanya.** Tidak ada Kepala Supply Chain yang mengirim data penjualan SKU-level ke tim mahasiswa minggu depan. Jadi demo kalian pasti pakai data publik — dan itu terlihat.
4. **Mereka punya tim data sendiri.** Pertanyaan juri yang membunuh: "kenapa mereka tidak bikin sendiri saja?" Untuk enterprise, jawabannya lemah. Untuk mid-market, jawabannya kuat: mereka tidak punya orangnya.

## Kenapa bukan UMKM/kecil

Ini gagal karena alasan matematis, bukan cuma soal daya beli. Nilai sebuah forecast kira-kira sebanding dengan:

> **lead time × jumlah SKU-lokasi × biaya kesalahan**

Warung atau toko kecil: lead time 1–3 hari (tinggal telepon supplier), SKU sedikit, dan pemiliknya hafal pola penjualannya di luar kepala. Forecast AI tidak mengalahkan intuisi orang yang setiap hari berdiri di tokonya. Tambah lagi: datanya sering belum terdigitalisasi, ability to pay rendah, churn tinggi, dan CAC-nya tidak masuk akal.

Yang paling penting untuk hackathon ini: **UMKM bukan pelanggan Lintasarta.** Kalian akan memenangkan simpati juri sosial, tapi kalah di juri komersial.

---

## Kenapa mid-market menang

Di titik ini semua variabel berbalik mendukung:

- **Excel sudah patah, tapi ERP planning belum ada.** Ini celah waktu yang persis jadi pasar kalian. Ratusan sampai ribuan kombinasi SKU-lokasi tidak bisa lagi ditangani satu orang dengan spreadsheet, tapi belum cukup besar untuk membenarkan implementasi SAP.
- **Lead time sudah panjang.** Impor bahan baku, MOQ dari principal, produksi batch — kesalahan forecast langsung jadi uang mati di gudang.
- **Keputusan cepat.** Biasanya 1–3 orang: owner, direktur operasional, kepala gudang. Bisa closing dalam hitungan minggu, bukan kuartal.
- **Datanya ada dan bisa diakses.** Sudah pakai Accurate, Jubelio, HashMicro, SimpliDOTS, atau minimal Excel yang rapi. Dan realistis: kalian bisa dapat CSV-nya untuk demo.
- **CAC lebih rendah.** Fokus vertikal yang sempit membuat biaya akuisisi turun dan ROI jadi jelas, dibanding tool horizontal yang harus menang di semua segmen.

Dan ini argumen paling penting untuk juri Lintasarta:

> **Marketspace itu dibangun justru untuk segmen yang terlalu kecil dilayani sales langsung.** LAMPU secara eksplisit membuka akses bagi mitra teknologi, startup dan penyedia software untuk menjangkau pasar lebih luas lewat API connector, integrasi cloud-native dan direct-deployment, dengan model pay-as-you-go, subscription, hingga enterprise licensing.

Artinya: kalau kalian target enterprise, kalian bersaing dengan tim sales Lintasarta sendiri. Kalau kalian target mid-market, kalian **mengisi segmen yang selama ini tidak tergarap** — dan itu persis alasan ekonomis LAMPU dibangun. Itu jawaban yang membuat juri komersial mereka duduk tegak.

---

## Definisi ICP yang bisa kalian pakai di slide

Jangan pakai omzet sebagai kriteria utama. Pakai pemicu operasional:

| Kriteria | Ambang |
|---|---|
| SKU aktif × lokasi | 300 – 10.000 kombinasi |
| Lead time pengadaan | ≥ 2 minggu |
| Yang bikin forecast | 1–3 orang, di Excel |
| Sistem yang sudah ada | Ada ERP/POS/DMS, **tapi** tidak ada modul planning yang dipakai |
| Data historis | ≥ 18 bulan penjualan terdigitalisasi |
| Tim data science internal | Tidak ada |

Kalimat untuk pitch: *"Pelanggan kami adalah perusahaan yang datanya sudah cukup untuk diprediksi, tapi orangnya belum cukup untuk memprediksi."*

**Satu catatan penting supaya tidak salah kaprah di depan juri:** menurut PP 7/2021, "usaha menengah" secara legal adalah penjualan tahunan Rp15–50 miliar. Secara komersial, mid-market yang kalian maksud sebenarnya lebih besar dari itu — kira-kira Rp50 miliar sampai Rp1 triliun, yang secara hukum sudah masuk kategori usaha besar. Jadi hindari kata "UMKM" di deck, karena juri akan membayangkan warung. Pakai istilah **"mid-market"** atau **"perusahaan menengah-besar non-enterprise"**, lalu langsung definisikan lewat tabel operasional di atas.

---

## Cara membingkai supaya tetap ada cerita enterprise

Juri korporat suka angka besar. Jadi jangan bilang "kami hanya untuk mid-market". Bilang:

> "Kami masuk lewat mid-market karena di situ nyerinya paling akut, akuisisinya paling murah, dan time-to-value paling cepat. Engine-nya identik dengan yang dibutuhkan enterprise — bedanya cuma volume dan integrasi. Setiap tenant mid-market menambah data kalender dan prior industri kami, dan itu yang nantinya jadi alasan enterprise memilih kami dibanding SAP: kami mengerti musim permintaan Indonesia, mereka tidak."

Land di mid-market, expand ke enterprise. Itu pola go-to-market yang standar dan investor langsung paham.

**Bonus argumen yang jarang dipikirkan tim lain:** perusahaan mid-market yang kalian target sebagian besar adalah *distributor dan supplier dari klien enterprise Lintasarta*. Jadi memperbaiki forecast mereka juga memperbaiki visibilitas rantai pasok klien besar Lintasarta. Itu cerita ekspansi yang sangat kuat.

---

## Risiko yang harus kalian antisipasi

- **Kualitas data.** Mid-market datanya berantakan — nama SKU tidak konsisten, retur tercatat aneh, stok tidak akurat. Di Asia Tenggara, lebih dari 60% kegagalan pemenuhan order pada SME justru berasal dari data inventori yang tidak akurat, bukan stok yang benar-benar habis. **Jadikan ini fitur:** data health check sebagai langkah onboarding pertama. Itu sekaligus jawaban untuk juri teknis.
- **Willingness to pay lebih rendah dari enterprise.** Mitigasi: harga per-SKU-forecast (metered), bukan flat. Cocok dengan model konsumsi LAMPU sekaligus menjaga gross margin.
- **Mereka tidak punya "demand planner".** Jadi UI kalian harus bisa dipakai kepala gudang, bukan data scientist. Outputnya harus daftar "pesan berapa, kapan" — bukan grafik MAPE.

---

Satu pertanyaan yang menentukan langkah berikutnya: dari lingkaran kalian — keluarga, teman, tempat magang — ada tidak satu perusahaan yang cocok dengan tabel ICP di atas? Kalau ada, sebutkan industrinya dan saya bantu susun email permintaan data plus script wawancaranya. Kalau tidak ada, kita ganti strategi ke pendekatan "data sintetis + kalender Indonesia" dan saya susun rencana datanya.

User: emang dia ada history kerjasama sama mid market?

Claude: Pertanyaan bagus — itu klaim yang harus dibuktikan, bukan diasumsikan. Saya cek.

**Jawabannya: ya, ada, dan ini sudah jadi strategi resmi mereka sejak 2021 — bukan cuma retorika hackathon.**

Waktu Lintasarta meluncurkan **Cloudeka** pada September 2021, mereka eksplisit bilang layanan cloud ini menyasar perusahaan besar, UKM dan institusi pemerintahan. Dan di halaman produk mereka sendiri, Lintasarta Cloud secara spesifik disebut menyasar perusahaan besar dan menengah yang ingin fokus pada bisnis inti lewat konsolidasi dan otomatisasi infrastruktur IT.

Jadi ini bukan segmen baru yang saya karang untuk memuluskan argumen — mid-market memang sudah lama masuk target pasar mereka, berdampingan dengan enterprise.

---

## Tapi ada nuansa penting yang perlu kalian tahu

**Portofolio publik mereka condong ke enterprise.** Semua partnership besar yang saya temukan — Accenture untuk sovereign AI cloud, NVIDIA untuk Blackwell/GPU Merdeka, 6Estates untuk LLM finansial — itu semua kelas enterprise/korporasi besar. Tidak ada satupun studi kasus publik yang menyebut nama klien mid-market spesifik yang saya temukan. Wajar — deal besar yang jadi PR material, klien menengah biasanya tidak diumumkan.

**LAMPU justru dibangun untuk mengatasi gap ini.** Bacaan saya: mereka punya *produk* untuk mid-market sejak 2021 (Cloudeka, sekarang Deka GPU/LLM), tapi model go-to-market mereka historisnya adalah **direct enterprise sales** — cocok untuk 2.300 klien korporasi besar, tapi terlalu mahal/lambat untuk menjual satu-satu ke ribuan perusahaan menengah. LAMPU sebagai marketspace self-service (pay-as-you-go, API connector, direct-deployment) adalah jawaban mereka untuk masalah itu — cara menjangkau mid-market **tanpa** butuh sales rep untuk tiap akun.

---

## Kenapa ini justru memperkuat, bukan melemahkan, posisi kalian

Ini artinya kalian punya dua argumen yang bisa dipakai bareng, dan itu lebih kuat dari sekadar satu:

1. **"Mid-market sudah lama jadi target resmi Anda"** — jadi bukan pitch yang aneh atau di luar strategi mereka. Kalian bisa kutip langsung: *"Sejak Cloudeka diluncurkan 2021, Lintasarta secara eksplisit menyasar segmen menengah, bukan hanya korporasi besar."*
2. **"Tapi Anda belum punya *produk AI* untuk menjangkau mereka — cuma infrastruktur"** — Cloudeka/Deka GPU itu infrastruktur (compute, storage, connectivity). Itu levelnya "pipa air", bukan "solusi yang siap pakai". Mid-market Indonesia tidak akan beli GPU-as-a-Service sendirian; mereka butuh *aplikasi* di atasnya. Ini persis kekosongan yang LAMPU coba isi lewat marketplace partner — dan kalian adalah calon partner itu.

Kalimat pitch yang bisa dipakai:

> "Lintasarta sudah bertahun-tahun bilang mid-market itu target mereka, dan sudah punya infrastrukturnya lewat Cloudeka. Yang belum ada adalah aplikasi yang membuat infrastruktur itu relevan buat perusahaan menengah — mereka tidak butuh GPU, mereka butuh tahu berapa yang harus dipesan minggu depan. Kami adalah lapisan itu, dan kami listing di LAMPU supaya distribusinya tidak butuh sales enterprise satu-satu."

Ini jauh lebih kuat daripada sekadar bilang "mid-market itu underserved secara umum" — sekarang kalian bisa tunjuk bukti bahwa itu memang gap **di dalam strategi Lintasarta sendiri**, bukan cuma opini kalian.

---

Mau saya cari lebih jauh — misalnya studi kasus atau berita soal klien Cloudeka/Deka GPU skala menengah yang sudah ada (kalau ada), supaya kalian punya nama konkret untuk disebut di pitch? Atau lanjut ke penyusunan interview script dan rencana data seperti yang saya tawarkan sebelumnya?

User: hmmm analyze their manufacture and retail company partners

Claude: Data konkret ternyata ada — dan hasilnya lebih kuat dari yang saya duga sebelumnya. Saya temukan database teknografis pihak ketiga (Apps Run The World) yang melacak pelanggan riil Lintasarta Cloudeka dari sumber publik — rilis pers, testimoni, studi kasus.

## Nama-nama manufaktur & FMCG yang sudah jadi klien Cloudeka

| Perusahaan | Industri | Karyawan | Revenue |
|---|---|---|---|
| **Wings Group Indonesia** | Consumer Packaged Goods (manufaktur FMCG) | 6.400 | $820 juta |
| **Yakult Indonesia Persada** | Consumer Packaged Goods (manufaktur) | 2.200 | $320 juta |
| Aerofood ACS | Consumer Packaged Goods | 310 | $30 juta |
| (terkunci) CPG | Consumer Packaged Goods | **10** | **$2 juta** |

Ini penting — di antara pelanggan yang terlacak menggunakan Lintasarta Cloudeka untuk hosting aplikasi dan layanan komputasi adalah Wings Group Indonesia, perusahaan Consumer Packaged Goods asal Indonesia dengan 6.400 karyawan dan pendapatan $820 juta, serta Yakult Indonesia Persada, perusahaan CPG dengan 2.200 karyawan dan pendapatan $320 juta. **Wings Group itu bukan perusahaan kecil** — itu salah satu konglomerat FMCG terbesar di Indonesia (Mie Sedaap, Daia, Ale-Ale, dll). Jadi manufaktur besar memang sudah jadi klien nyata, bukan cuma klaim marketing.

## Tapi ini yang paling penting untuk pertanyaan kalian

Perusahaan yang memakai Lintasarta Cloudeka paling terkonsentrasi di industri Consumer Packaged Goods, Banking and Financial Services, dan Leisure and Hospitality, dengan adopsi tersebar di lebih dari 21 industri — **CPG (yang mencakup manufaktur FMCG) adalah industri #1**, bukan sekadar salah satu dari banyak.

Dan angka yang paling menjawab pertanyaan kalian secara langsung:

> Perusahaan pengguna Lintasarta Cloudeka terentang dari bisnis kecil dengan 0-100 karyawan (53,7%), perusahaan menengah dengan 101-1.000 karyawan (39,81%), organisasi besar dengan 1.001-10.000 karyawan (6,48%), hingga enterprise global 10.000+ karyawan (0%).

Baca ulang angka terakhir itu: **0% pelanggan Cloudeka adalah mega-enterprise global.** Gabungkan kolom kecil + menengah: **93,5% pelanggan riil mereka punya di bawah 1.000 karyawan.**

---

## Apa artinya ini untuk strategi kalian

Ini bukan cuma mengonfirmasi jawaban saya sebelumnya — ini **jauh lebih kuat** dari yang saya sarankan:

1. **Base pelanggan riil Cloudeka itu sendiri sudah mayoritas mid-market**, bukan enterprise raksasa seperti yang portofolio PR mereka (Accenture, NVIDIA, IBM) buat kesannya. Deal-deal besar itu yang jadi headline, tapi volume riilnya ada di segmen menengah-kecil.
2. **CPG/manufaktur FMCG adalah industri paling dominan di basis pelanggan mereka.** Track kalian (manufaktur & ritel) itu persis di jantung industri terkuat mereka — bukan tebakan liar.
3. **Wings Group jadi bukti kredibilitas, Yakult jadi bukti pola.** Kalian bisa sebut nama ini di pitch tanpa takut dianggap mengada-ada: *"Basis pelanggan Cloudeka sendiri didominasi CPG — Wings Group dan Yakult sudah jadi klien. Demand forecasting adalah lapisan aplikasi yang logis di atas infrastruktur yang sudah mereka pakai untuk pelanggan CPG ini."*
4. **Rentang yang sangat lebar dalam satu industri** — dari CPG dengan 10 karyawan/$2 juta sampai Wings dengan 6.400 karyawan/$820 juta — menunjukkan Lintasarta memang melayani seluruh spektrum ukuran di sektor ini, bukan cuma satu tier.

## Untuk ritel — ini titik lemah yang perlu diwaspadai

Dari sampel yang saya lihat (10 dari 108 entri), saya **tidak** menemukan nama rantai ritel murni (supermarket, department store) di daftar Cloudeka — konsentrasinya di CPG (yang notabene manufaktur/produsen, bukan retailer), banking, dan hospitality. Ini dua kemungkinan:
- Retailer besar Indonesia (Indomaret, Alfamart, dll) mungkin belum jadi klien Cloudeka — celah pasar yang bisa kalian klaim.
- Atau datanya belum lengkap di sampel yang saya lihat.

**Saran taktis:** condongkan demo kalian ke sisi **manufaktur CPG/FMCG** sebagai primary use case (di situ ada bukti relasi nyata), dan posisikan sisi ritel sebagai *"perluasan alami ke hilir rantai pasok yang sama"* — bukan klaim independen yang belum ada buktinya.

---

## Catatan kejujuran soal sumber

Data ini dari firma riset teknografis pihak ketiga yang mengumpulkan dari sumber publik (siaran pers, testimoni, studi kasus) — bukan pengungkapan resmi Lintasarta sendiri, jadi kemungkinan ada bias sampling atau data yang belum lengkap (baru 108 entri terlacak, mayoritas terkunci di balik paywall). Tapi metodologinya masuk akal dan ini bukti terbaik yang tersedia publik. Kalau juri menantang angka ini, kalian bisa bilang "berdasarkan data teknografis pihak ketiga" — itu tetap jauh lebih kredibel daripada asumsi tanpa sumber.

---

Mau saya susun satu slide "evidence slide" berisi tabel ini plus statistik 93,5% untuk dipakai langsung di pitch deck kalian?

