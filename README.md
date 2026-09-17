# DemandX — Adaptive Demand Forecasting

Demand forecasting and inventory decision support for Indonesian distributors and
manufacturers. You upload a sales export; you get back a ranked list of what to order,
per branch, with the arithmetic behind every number.

The point is the middle bit. Most forecasting tools assume clean, canonically-named data.
Real mid-market exports are a mess of Indonesian column names from five different ERPs, so
the pipeline profiles whatever you give it, proposes what each column means, **asks you to
confirm**, and only then forecasts:

```
CSV/JSON → profile + map (you confirm) → canonical model → clean → enrich
  → segment (ADI/CV²) → backtest candidates → select per series → forecast
  → decide (order qty / production qty) → value simulation in rupiah
```

Three things make it more than a notebook with a chart on top:

- **Nothing is a black box.** Every recommended quantity decomposes into a sum a buyer can
  check. Every model choice shows the backtest scores of the models it beat.
- **Branch-level access.** One company, many branches. An owner uploads once; branch
  managers see only the branches they have been granted, and request the rest.
- **Missing is not zero.** A number the data cannot support is withheld with a reason, never
  rendered as `0`.

Full design in [architecture.md](architecture.md) · schedule in [PLAN.md](PLAN.md) · current
integration state in [migration-report.md](migration-report.md).

---

## Starting it

You need **Node 24+** (the auth layer uses the built-in `node:sqlite`, which needs no flag
from Node 24) and **Python 3.11+**.

Three processes, in this order. The frontend runs without the backend — it falls back to
fixtures and says so on screen — but nothing will be live.

### 1. Forecasting backend → port 8000

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

.venv/bin/python -m uvicorn app.main:app --reload --port 8000
```

**No flag needed, and no GPU needed.** The foundation model (TimesFM) now runs on a remote
inference service and switches itself off unless `GPU_INFERENCE_URL` and
`GPU_INFERENCE_API_KEY` are set. Without them the pipeline still runs end to end on
baselines plus the calendar wrapper, and `/health` reports exactly what did not load and
why. Set them in `.env` to turn it on — the backend reads `backend/.env` then `<repo>/.env`,
and real environment variables win over both.

Check: <http://localhost:8000/health> · docs at <http://localhost:8000/docs>

### 2. Frontend → port 3000

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. No configuration needed: `BACKEND_API_URL` defaults to
`http://localhost:8000`, and the auth database creates and seeds itself on first request.

### 3. A dataset to upload

```bash
python3 scripts/generate_dataset.py
```

Writes `data/generated/penjualan_abc_distribution.csv` — 138,789 rows, 8 branches, 40 SKUs,
18 months, with Lebaran seasonality and a stock ledger. Deterministic, stdlib only.

---

## Buying it (the logged-out flow)

`/#pricing` → **Choose Jaringan** → `/checkout?plan=jaringan` → **Continue** → `/signup` →
you are an owner, signed in, on `/projects`.

| Plan | Price | Branches |
| --- | --- | --- |
| Cabang | Rp 9.000.000 / month | 1 |
| Jaringan | Rp 18.000.000 / month | up to 10 |
| Nasional | Rp 40.000.000 / month | up to 40 |
| Korporat | Custom, annual | unlimited, own tenancy |

`Korporat` is contact-only and has no checkout link — `/checkout?plan=korporat` is a 404,
asserted in `check:auth`.

**No payment is taken and no card is collected.** There is no processor wired up and no card
field anywhere in the flow — the checkout page says so on the screen where it happens. When
Midtrans or Xendit is added, its webhook replaces `completeCheckout` and nothing else in the
flow changes.

Two things worth knowing about the MVP shortcuts:

- **No email confirmation.** The address is taken on trust, so a typo locks someone out of
  their own project and a deliberate misspelling squats someone else's address. Wire a
  confirmation link before real customers.
- **Sign-up is gated, not open.** It creates an **owner**, so checkout issues a short-lived
  signed pass and `/signup` refuses without one — otherwise the URL alone would grant the
  role that decides who sees which branch. `npm run check:auth` asserts that forged,
  stripped, expired and contact-only-plan passes are all refused.

## Adding managers without selling them a plan

An owner generates a **company token** on **Team & access**, sends the join link, and the
manager creates their own account with it:

```
/join-company?token=…  →  manager account in the owner's company  →  /projects
```

What the token does and does not do:

| | |
| --- | --- |
| Creates | A **manager** account, in the owner's company. The role is not a form field — a token can never mint an owner, so it is not a way to skip checkout. |
| Grants | Company membership only. The new manager sees the owner's project *names*, so they know which branches to ask for. Not one row of data. |
| Expires | 14 days. A token forgotten in a WhatsApp thread stops working. |
| Rotates | **Replace** writes a new token over the old row — that is the revocation, with no second list to keep in step. **Turn off** deletes it entirely. |
| Keeps | Managers who already joined keep their accounts and their branches when you rotate. |

An invalid token and an expired one give the same message, so the page cannot be used to
test whether a token was ever real.

## Signing in

Three accounts are seeded on first run and listed on the sign-in screen, with a button that
fills them in:

| Email | Password | Role |
| --- | --- | --- |
| `sari.wijaya@gmail.com` | `owner1234` | **owner** — uploads data, invites managers, decides access |
| `budi.santoso@gmail.com` | `manager1234` | manager |
| `rina.pratiwi@gmail.com` | `manager1234` | manager |

**Start as Sari.** Until an owner uploads something, the managers have nothing to sign in to.

### The five-minute walkthrough

1. **Sari → New project →** upload `penjualan_abc_distribution.csv`.
2. The review screen asks *"Is this the branch ID column?"*, *"Is this the branch location
   column?"* and *"Is this the product column?"* — each pre-answered from your own column
   names, with real values from the file beside it. Confirm → the file splits into 8
   branches.
3. Next it asks about the **canonical** mapping (date, quantity, product, location…).
   Confirm → cleaning and profiling run, then a forecast job is queued and the processing
   screen follows it live.
4. **Dashboard.** Overview, Demand & Sales, Supply Chain — all from the live service.
5. **Team & access →** copy the **project link** (`/projects/<id>/team`) and send it to a
   manager, or register `budi.santoso@gmail.com` against one branch directly. A new
   account's password is shown once, on your screen.

   The project link works for any signed-in account. A manager who holds nothing there sees
   the branch list and a request form; they do **not** see the dashboard, the invite token,
   the manager roster, agent access, or a single row of data.
6. Sign in as **Budi** in another browser profile. He sees only his branch; typing another
   branch's URL gives a 404. Open the project link to request more, then approve it as Sari.

There is also a seeded demo network (`PT ABC Distribution`, three branches wired to the
fixture dashboards) so the access flow is demoable with the backend switched off.

---

## Layout, and who owns what

```
app/            Next.js routes — marketing, login, project flow, dashboards
components/     UI: app shell, charts (hand-rolled SVG), dashboard surfaces
lib/backend/    the ONLY place the app calls the forecasting service
lib/assistant/  the in-app "Ask the data" assistant
auth/           identity, projects, branches, access — its own SQLite database
scripts/        dataset generator
backend/        the forecasting service (FastAPI + Polars + SQLite)
data/           generated CSVs and both SQLite files (gitignored)
```

Two owners, two lanes. `backend/` is the forecasting service and is owned separately —
see [backend/README.md](backend/README.md). Everything else is the frontend and auth layer,
documented in [auth/README.md](auth/README.md).

The boundary is enforced, not just agreed: `eslint.config.mjs` restricts `auth/**` to node
builtins, `next`, `react` and its own siblings, so an import from `@/app` or `@/lib` fails
`npm run lint`. The app depends on auth; auth depends on nothing in the app.

## Checks

```bash
npm run check:auth       # 31 assertions — passwords, access, branch splitting
npm run check:fixtures   # 13 assertions — fixture invariants
npm run lint
npm run build

# backend, with the service running on :8000
backend/.venv/bin/python backend/scripts/check_contract.py   # 25 API invariants
```

No test framework, deliberately: all three are `assert`-based scripts that exit non-zero.
`check_contract.py` is the one that matters most — it asserts the response contract the
frontend renders, including that a branch-scoped request leaks no other branch.

## Optional

Everything below is off by default and nothing breaks without it.

| Variable | What it turns on |
| --- | --- |
| `ANTHROPIC_API_KEY` | The **Ask the data** assistant. Without it the panel opens and says it is not configured. |
| `SLACK_WEBHOOK_URL` | Actually sending the procurement alert. Without it the endpoint returns the message it would have sent, and the UI shows it. |
| `AUTH_SECRET` | Signs session cookies. Generated on first run and stored in `data/auth.db` if unset. Set it in production. |
| `GPU_INFERENCE_URL` + `GPU_INFERENCE_API_KEY` | The TimesFM foundation model, on a remote GPU. Without them the router drops it and uses baselines. |
| `DEMO_LATENCY_MS` | Artificial latency, so loading skeletons are visible. |

Copy [.env.example](.env.example) to `.env` for the full list.

**Connecting an agent (MCP):** the backend ships an MCP server exposing nine tools over the
same service layer. Sign in as an owner → **Team & access → Agent access** for a
copy-pasteable Claude Desktop / Cursor config. Note the warning there: a connected agent is
**not** branch-scoped and reads every dataset.

---

## If something is wrong

**Confirm-mapping returns 500, `table series_profiles has no column named category`.**
Your `data/app.db` predates a schema change and there is no migration. Delete it:

```bash
rm -f data/app.db*
```

**Every screen shows an amber "Demo data" badge.** The frontend cannot reach the backend, so
it fell back to fixtures. Check port 8000 is up. The badge names the reason; the dev server
log has the failing path.

**A screen shows a grey "Demo data · endpoint not implemented" badge.** That one is honest —
the backend has no such endpoint yet. See [migration-report.md](migration-report.md) for
which, and what is still missing.

**Want to start completely over.** Both databases are disposable and gitignored:

```bash
rm -f data/auth.db* data/app.db*
```

The demo accounts and the PT ABC network **reseed on the next request** — deleting the file
is not enough to get an empty instance. To keep it empty, set `AUTH_SKIP_SEED=1` in `.env`
before the next request. With it set, the sign-in screen stops advertising demo credentials
too, so it never offers a login that would be refused.

**Port already in use.** A previous `next dev` or `uvicorn` is still running:

```bash
lsof -ti:3000,8000 | xargs kill -9
```

**`npm run build` fails with `database is locked`.** Stop the dev server first; build workers
and dev both write the auth database.

**Stray files appear with ` 2` / ` 3` in the name** — `data/auth 2.db`,
`.next/types/routes.d 2.ts`. This repo sits under `~/Documents`, which iCloud Drive syncs,
and iCloud resolves conflicts on rapidly-rewritten files (SQLite WAL, build caches) by
duplicating them. The duplicates then break the TypeScript build with `Duplicate identifier`
errors. Harmless to delete:

```bash
# Look first. This pattern can match real files — it has.
find . -name "* [0-9].*" -not -path "./node_modules/*" -not -path "./.git/*"

# Then remove the build cache, which is always safe to regenerate.
rm -rf .next
```

Delete the listed duplicates by hand, and check `git status` afterwards: anything tracked
that went missing comes back with `git checkout -- <path>`.

Moving the repo outside a synced folder avoids it entirely. Worth doing if you hit it twice.
