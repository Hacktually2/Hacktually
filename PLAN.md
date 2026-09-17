# Adaptive Forecasting — Revised Build Plan

As of 2026-09-17

## TL;DR

The architecture is the right shape, but it is an engineering plan competing in a contest where 40% of the score is innovation plus business impact. Everything in it is correct; nothing in it is ours. Four additions fix that for about six hours of work across three people.

**Add:** Indonesian demand calendar as a known-future covariate, censored demand handling, a rupiah value simulation, a manufaktur decision mode.

**Cut:** cleaning rules 8 to 4, models 4 to 2-3 per segment, the separate JSON adapter, Docker until hour 22.

TimesFM-3 was verified this morning. Covariates are real and documented, and the non-commercial licence has a clean answer. Read the next section before anyone writes forecasting code.

### Next 60 minutes

1. Forecasting owner: `pip install timesfm[torch]`, run the covariate snippet below on one series, confirm quantiles come back on the L40S. Nothing else matters until this works.
2. Backend owner: freeze the API contract and commit it. Everyone codes against it from that moment.
3. Frontend owner: build the Indonesian calendar CSV. Pure data entry, zero risk, and it is the only thing in this build that is genuinely ours.

The one rule: an ugly end-to-end path, CSV in and reorder list out, must exist by hour 8. Not hour 18. Everything after that is an upgrade to a system that already runs.

## TimesFM-3: verified

Covariates are real, natively supported, and documented. The calendar plan works. The licence restriction is also real, and it has a better answer than the one we were going to give.

| Question | Answer |
| --- | --- |
| Covariates | Native. Past-only and past-and-future, no fine-tuning |
| Checkpoint | `google/timesfm-3.0-pytorch` |
| Install | `pip install timesfm[torch]` |
| Context length | Up to 16k |
| Intervals | 9 quantiles, 0.1 to 0.9, via `return_quantiles=True` |
| Batching | `per_core_batch_size` on `ModelConfig` |
| Weights licence | `timesfm-non-commercial-license-v1.0`, non-commercial and non-production |
| Source code licence | Apache-2.0 |
| Weights up to 2.5 | Apache-2.0 |

Sources: <https://github.com/google-research/timesfm/> and <https://www.marktechpost.com/2026/08/31/google-ai-releases-timesfm-3-a-330m-parameter-zero-shot-foundation-model-for-multivariate-time-series-forecasting/>

### The API, with covariates

This is the shape to build the adapter around. Note `past_future_covariates` takes `context_len + horizon` values, because the model needs the future values too. That is exactly where the Indonesian calendar goes.

```python
from timesfm3 import TimesFM3Evaluator, ModelConfig

config = ModelConfig(
    checkpoint_path="google/timesfm-3.0-pytorch",
    per_core_batch_size=16,
    device="cuda",
)
forecaster = TimesFM3Evaluator(config)

outputs = list(
    forecaster.predict_batch(
        contexts=[target],                        # (num_variates, context_len)
        horizon=24,
        past_only_covariates=[past_only_cov],     # (1, context_len)
        past_future_covariates=[calendar_cov],    # (2, context_len + horizon)
        return_quantiles=True,
        use_symmetric_averaging=False,
    )
)
```

Two consequences worth acting on. The quantiles give us the `lower` and `upper` columns in our schema for free, so nobody should write interval logic. And `predict_batch` means batching is the supported path: never call this per series in a Python loop, or the demo stalls on stage.

### The licence answer

Weights up to version 2.5 are Apache-2.0. So when a judge asks whether this can be sold:

> The prototype runs TimesFM-3 under its research licence. Our forecasting layer is an adapter interface, so production swaps to TimesFM-2.5 under Apache-2.0, or a commercially licensed foundation model, without touching ingestion, validation or the decision engine. We designed for that from the start because betting a company on one vendor's checkpoint licence is not an architecture.

That is a stronger answer than vague model-agnosticism, because it names the specific fallback.

## Revised architecture

Same spine, three new stages, and a decision layer that branches by industry instead of assuming everyone is a distributor.

```
CSV or JSON (one endpoint)
   -> Profile + map (rules first, LLM assist)
   -> Canonical model: timestamp, series_id, target
   -> Clean: 4 rules + data health
   -> Enrich: ID calendar + censored demand        [NEW]
   -> Segment: ADI + CV^2
   -> Route 2-3 candidates
   -> Backtest: 2 windows
   -> Final forecast (batched)
   -> Decision mode
        ritel      -> reorder qty
        manufaktur -> production plan              [NEW]
   -> Value simulation in rupiah                   [NEW]
   -> Dashboard | REST | MCP
```

### What changed

| Stage | Before | Now | Why |
| --- | --- | --- | --- |
| Enrichment | absent | Indonesian calendar as known-future covariate | The only defensible moat, and the answer to "why not SAP" |
| Enrichment | absent | Censored demand masking | Stockout periods teach the model to under-forecast the items that already hurt |
| Value | WAPE comparison | Rupiah simulation under one policy | Judges forget 16.3% vs 24.8%; they remember Rp 640 juta |
| Decision | reorder only | Two modes, ritel and manufaktur | The track names both sectors; we were answering half of it |
| Cleaning | 8 transforms | 4 transforms, rest are report flags | Three hours bought back |
| Models | 4 per series | 2-3 per segment | Fewer failure modes, same story |
| Selection | per series always | per segment when history is short | Selecting on 2 windows per series is overfitting, and a judge will say so |
| Ingestion | CSV and JSON adapters | one endpoint, a flag | "CSV is a transport" is a pitch line, not a subsystem |
| Deploy | Docker Compose | uvicorn + next dev, Docker at hour 22 | Infra tax on the critical path |

### Canonical model, unchanged

```
timestamp | series_id | target
optional: item_id, location_id, inventory, price, promo, lead_time, moq
series_id = item_id + "__" + location_id, or item_id alone
```

### Selection rule, stated precisely

This is the part a technical judge will probe, so it needs to be a rule we can recite:

- Fewer than 3 validation points per series: pick the winner **per demand segment**, apply it to every series in that segment.
- 3 or more: pick **per series**, but only when the winner beats the segment default by a margin wider than the spread across folds.
- Intermittent and lumpy series: score on MASE, not WAPE. WAPE denominators approach zero on sparse demand and the ranking becomes noise.
- Always report bias alongside error. A model can post respectable accuracy while running systematically high, and that costs more than the error rate does.

## The four additions

Roughly six hours total. They are what separates us from every other team running a foundation model over a CSV.

### 0. ERP presets (~30 min, do this before hour 8)

Mid-market Indonesia does not run a thousand systems. It runs Accurate, Jubelio, HashMicro, SimpliDOTS, Moka and Excel. So the sharper claim is not "we adapt to any schema" — it is presets for the systems most of this market already uses, plus a generic adapter for everything else.

A dict of known header fingerprints mapped to canonical fields. Three reasons it beats the general adapter alone: it demos as market knowledge rather than a model call, it needs no LLM and no network so it cannot fail on stage, and it is a more specific moat claim than a generic capability anyone can assert.

The generic adapter becomes the fallback and the scale story, which is a better role for it.

### 1. Indonesian demand calendar (~2h)

Lebaran moves about 11 days earlier each year. That destroys naive seasonality, and it also degrades foundation models trained mostly on Western series. A model that has never seen an Indonesian sales calendar cannot know that demand triples three weeks before a date that moves annually.

Build a CSV with one row per date and these columns: `is_ramadan`, `days_to_lebaran`, `is_thr_window`, `is_payday_week`, `is_regional_holiday`, `is_school_term`. Feed it as `past_future_covariates`, since every value is known in advance for the whole horizon.

Demo beat, about 15 seconds: one SKU, forecast without the calendar misses the Lebaran ramp, forecast with it tracks the spike. Two lines on one chart.

This is also the complete answer to "why won't SAP just add this," which is the question most likely to end a pitch.

### 2. Censored demand (~1h)

When a SKU stocks out, recorded sales understate real demand. Train on sales and the model learns to under-forecast exactly the items that already caused lost revenue. Almost no hackathon team handles this.

Detect periods where inventory reaches zero or sales sit flat at a ceiling, mask them from fitting, and mark them in the health report as `demand_censored`. Say it out loud in the pitch: we forecast demand, not sales, and those differ precisely when it matters most.

### 3. Value simulation (~2h, the money slide)

Stop comparing WAPE. Run the same replenishment policy under both forecasts across the backtest windows and count what actually happens.

| | Current practice (moving avg) | Our recommendation |
| --- | --- | --- |
| Fill rate | 87% | 96% |
| Stockout events | 41 | 9 |
| Avg inventory value | Rp 2.4 M | Rp 1.8 M |
| Lost sales (units) | 3,200 | 610 |

Then one line underneath: working capital freed, over N SKUs and M months. Numbers above are the shape, not our results; fill them from the real run.

This is one slide that scores against three criteria at once: innovation, because decision-consistent backtesting is uncommon; business impact, because it is denominated in rupiah; and presentation, because it is the only number anyone will still remember at dinner.

### 4. Manufaktur mode (~1h)

The track brief says manufaktur and ritel. A reorder list answers half of it, and a Lintasarta manufacturing judge will read the demo as a retail tool.

Same forecast, branch the output:

```
ritel      -> recommended purchase order qty
manufaktur -> required production qty -> raw material requirement (x BOM factor)
```

One formula, one UI toggle, one sentence on stage: same forecast, different decision layer, because a manufacturer plans production and a distributor plans replenishment.

## Fitting the mid-market target

The core fits well for a non-obvious reason: **the schema adapter gets more valuable as the customer gets smaller.** An enterprise has a data team to normalize exports, which is why SAP can demand a clean feed. A mid-market company with 1-3 people forecasting in Excel has nobody to do that, and that is exactly why they have never adopted a planning tool. Our hardest engineering piece is aimed at our segment's actual blocker.

Worth saying on stage: mid-market is not a compromise. 93.5% of Cloudeka's real customers are under 1,000 employees. We are not asking Lintasarta to chase a new segment, we are describing the one they already have.

Three corrections to keep it from drifting enterprise-shaped:

**Parameter entry must be category-level.** The decision engine needs inventory, lead time, MOQ and service level, and we never invent them. But typing those per SKU across 428 series is unusable and that is where a trial dies. Defaults per category with bulk apply, per-SKU override only where it matters. Infer lead time from purchase-order history when it is in the upload.

**The dashboard is the product, the wizard is onboarding.** Upload, mapping, health, forecast, recommendations happens once. The recurring surface is one page: these 12 things need ordering this week, this much each. Land there. Charts are secondary to the list.

**Time to first value is a mid-market selling point.** "CSV to first reorder list in under 10 minutes" — the demo proves it live. Enterprise does not care about this; mid-market buys on it. Have the number on a slide, along with a real rupiah price for roughly 400 series forecast weekly.

### Why MCP is a mid-market feature, not an enterprise one

Mid-market software fails on adoption, not features. Excel wins because it is where people already are. Owners and ops staff in this segment already use ChatGPT and Claude personally, so "you do not visit our dashboard, your AI already has this capability" is the adoption answer — and it is an argument only a mid-market pitch can make. Enterprise buyers do not care, they will mandate a login.

One seam to be honest about. Results flowing to an agent is exactly what MCP is for. Ingestion splits by client: an agent with filesystem access (Claude Code) can call `ingest_csv(path=...)` and our server reads the file, but a browser session cannot hand a file to a remote MCP server. So the claim is "ingest from the agent where the agent can see files, everywhere else ingest once and the agent works by reference."

Never return full series into an agent's context. 428 series times 30 days is ~12,800 rows and it will blow the window. Top-N with an id to drill into.

`explain_forecast(series_id)` is worth 20 minutes. When a judge asks the agent why TSB won for a given SKU and it answers with the backtest numbers, that lands harder than any chart.

Budget testing time separately from build time. Writing an MCP server is an hour; getting a real client to connect, discover tools and not silently fail reliably takes longer. Upside: use Claude Desktop or Claude Code as the client for Beat 3 and we delete the chat UI entirely.

## What we are not building

Each of these was in the plan. Each is defensible in production and worthless in the next 24 hours.

| Cut | Reason |
| --- | --- |
| `/ingest/json` as its own adapter | One endpoint plus a content-type flag. The point is made in the pitch, not the code |
| Cleaning rules 5-8 | Anomaly flags, sparsity flags and forecastability warnings become lines in the health report, not transforms |
| Croston and TSB on smooth series | They only compete on intermittent and lumpy. Running them everywhere quadruples the backtest for nothing |
| Docker Compose before hour 22 | uvicorn and next dev. Containers only if we are alive and ahead |
| Postgres | SQLite. Zero setup, and nobody scores database networking |
| Auth, multi-tenancy, settings pages | A demo API key in an env var is enough |
| ERP connectors | The REST endpoint is the proof. A real connector is a month, not an evening |

One thing we keep that looks cuttable: **MCP**. It is one to two hours wrapping endpoints that already exist, it gives the demo its ending, and agent interop is the single most current-sounding thing we can show a judge selling AI infrastructure. The rule is that its tools return real rows from SQLite. A mocked MCP response that a judge probes is worse than no MCP at all.

### Slack, and why it is slightly wrong

Our ICP is mid-market Indonesian manufacturers and distributors. They run procurement on WhatsApp and email, not Slack. A Lintasarta commercial judge sells to these accounts and will notice.

We are not building WhatsApp Business API today. We just say the line: Slack for this demo, and the adapter interface is identical for WhatsApp Business API, which is what our market actually uses.

## Schedule, gates and kill switches

The original plan put frontend integration at hour 18, which means nothing is demoable until hour 20. That is the standard way hackathon teams lose. This version front-loads a working ugly path and then improves it.

| Hour | Target | Gate |
| --- | --- | --- |
| 0-2 | TimesFM smoke test on L40S, repo, API contract frozen and committed | Model returns quantiles, or we are baseline-only and say so |
| 2-8 | Vertical slice: CSV, rule-based mapping, clean, seasonal naive, reorder list, UI showing it | **Hour 8: end-to-end demoable, or cut hard** |
| 8-12 | TimesFM adapter with batching, ADI and CV^2, segment routing | |
| 12-15 | Backtest, selection rule, **calendar covariate** | **Hour 15: TimesFM beats naive, or the narrative becomes validated routing** |
| 15-18 | Decision engine both modes, censored demand, **value simulation** | |
| 18-20 | LLM mapping enrichment, confidence UI, polish | |
| 20-22 | MCP and Slack | Cut without discussion if behind |
| 22-24 | **Record backup video**, freeze code, rehearse three times | Non-negotiable |

### Kill-switch ladder

When we fall behind, cut in this order and do not debate it in the moment:

1. Slack
2. MCP
3. LLM schema mapping (rules-only, and the confirmation screen covers us)
4. Manufaktur mode (mention it as a slide instead)
5. Censored demand
6. Per-series selection (fall back to per-segment everywhere)

Nothing below this line is ever cut: CSV in, mapping confirmed, cleaned, forecast, reorder list, rupiah number.

### Division of labour

The original split put schema, cleaning, ADI, four models and backtesting on one person, which is roughly 60% of the critical path on one human. Rebalanced:

| | Owns | Also |
| --- | --- | --- |
| Person 1 | TimesFM adapter, batching, baselines, backtest, selection rule | The calendar covariate wiring |
| Person 2 | FastAPI, profiler, mapper, cleaning, decision engine both modes, value simulation | MCP and Slack at hour 20 |
| Person 3 | All five screens, calendar CSV, demo script, deck, backup recording | Starts the pitch at hour 4, not hour 22 |

Person 3 begins building against the frozen contract with mock data from hour 2. They should never be blocked waiting for a real endpoint.

### Two failure modes to pre-empt now

**Venue wifi.** If schema mapping calls an external LLM and the network dies, we fail at step one in front of judges. Rule-based mapping is the primary path, the LLM is enrichment only, and the demo file's mapping is cached to disk.

**Demo-day recompute.** Precompute the full demo run and store results in SQLite. The live demo reads stored artifacts. If anything breaks on stage, the recorded video plays.

### Repo note

AGENTS.md warns that Next 16.3.2 in this repo has breaking changes against what models were trained on. Whoever builds the frontend reads `node_modules/next/dist/docs/` before writing routing code, or we lose an hour to an API that moved.

## No fine-tuning, no retraining

Decided. If someone raises it at 3am, this is the answer.

- It breaks the pitch. Zero-training is the feature that makes the engine horizontal and LAMPU-listable. Fine-tuning invites "so you retrain for every customer?" and kills the scalability answer.
- The licence makes it a dead end. A fine-tune of TimesFM-3 weights is a derivative of non-commercial weights, so the swap-to-2.5 production story does not survive it.
- Leakage risk is fatal. Fine-tuning on our only dataset then reporting backtest numbers on it is the one mistake that discredits everything else we say.
- It costs 6-10 hours, competes for the inference GPU, and is invisible in a demo.

What is NOT training and is fine: Croston/TSB alpha fitting per series over a small grid, scored on the backtest windows; and calendar uplift factors estimated from history (mean demand in the 3 weeks pre-Lebaran vs baseline, per category).

That second one is also **Plan B for demo Beat 2**. If the TimesFM covariate path disappoints, apply the uplift factor to the forecast and show the same two-line chart. The Lebaran moment survives either way.

The line to use on stage:

> Onboarding a new customer costs zero training. Refreshing a forecast costs GPU-seconds, not a retraining cycle. That is why one engine can serve a thousand companies with different data.

## Demo script, 90 seconds

Six screens in 90 seconds is 15 seconds each and reads as panic. Three beats only.

**Beat 1, 0-20s. Any schema.** Three visibly different CSVs, one after another, same pipeline, same canonical output. Make one mapping return at 62% confidence and correct it live. Calibrated uncertainty reads as more trustworthy than false certainty, and it pre-empts the "what if it mistakes revenue for quantity" question before anyone asks it.

**Beat 2, 20-60s. The money.** Lebaran miss versus hit on one chart, then the rupiah table. This is the pitch. Spend the time here.

**Beat 3, 60-90s. It lives where they work.** Ask the agent which products need attention this week. It calls our MCP tools, returns real rows, sends the recommendation to procurement. Stop talking.

Do not continue into the other features. The instinct to show the data health screen, the segmentation donut and the model selection breakdown is what turns a tight demo into a tour.

### Open with

> Any enterprise data in, a validated forecast that understands Indonesian demand seasons, and a decision the warehouse can act on, delivered inside the tools they already use.

### Close with

> Lintasarta already sells the sovereign infrastructure. We are the application layer that turns it into an outcome a manufacturer will pay for, and it is listable on LAMPU tomorrow.

## Judge Q&A

Rehearse these out loud. The answer that arrives in two seconds scores differently from the same answer that arrives in ten.

**How do you know TimesFM is the best model for this company?**

We do not assume it is. The system diagnoses each demand series, benchmarks candidate methods on the company's own history with rolling validation, and selects on measured performance. On this dataset TimesFM won about 60% of series; the rest went to TSB, Croston or seasonal naive.

**Is per-series model selection statistically sound with two validation windows?**

No, and that is why we do not do it blindly. Below three validation points we select per demand segment and apply the winner across it. Per-series selection only happens when the margin exceeds the spread across folds. Selecting a model on two observations is fitting noise.

**Why won't SAP or Blue Yonder just add this?**

They model seasonality on fixed calendars. Lebaran moves about 11 days earlier every year, THR lands on a schedule no global vendor encodes, and payday cycles drive Indonesian retail demand in a pattern trained-on-Western-data models have never seen. Our calendar layer is configuration, not code, so a new market is days of data entry rather than a rewrite.

**What if the AI maps revenue to quantity?**

It sometimes will, which is why mapping is inferred automatically but confirmed by a human before anything runs. Confidence is shown per field. You saw us correct one live.

**Can this be sold commercially given the model licence?**

The prototype runs TimesFM-3 under its research licence. Our forecasting layer is an adapter, so production swaps to TimesFM-2.5 under Apache-2.0 or a commercially licensed model without touching ingestion, validation or decisions. We designed for that from the start.

**Why mid-market rather than your enterprise accounts?**

Enterprise already owns SAP IBP, so we would be a replacement rather than a solution, on an 18-month sales cycle. Mid-market has the pain, the data and a three-person decision. It is also the segment a marketspace exists to reach, because direct sales cannot economically serve it. Our customers are companies whose data is good enough to forecast but whose team is too small to do it.

**What is the pricing model?**

Metered per SKU-forecast rather than flat subscription. Flat pricing with unlimited inference means cost scales with usage while revenue does not, which pushes gross margin negative. Metering also matches how LAMPU bills.

**How is this different from every other forecasting demo here?**

Most will show accuracy. We show a decision and what it is worth in rupiah, on data that was messy when it arrived, in a system that knows when Lebaran is.

### If asked to upload their own file

Say yes. Manual mapping is always available as a fallback, so the worst case is a slower path rather than a failure. If it works, that is worth more than the rest of the demo combined.
