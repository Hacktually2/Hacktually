# Auth — identity, projects, branches, access

Separate from the forecasting backend in `backend/` on purpose: different
process, different database file, different schema. That service owns datasets,
models and recommendations. This one owns **who may look at them**. Nothing here
imports from `backend/`, nothing there imports from here, and the only artefact
they share is the CSV an owner uploads.

If you are working on forecasting, you do not need to read past this line.

## The model

| | |
| --- | --- |
| **Owner** | Pays for and owns a project. Uploads the dataset, confirms what its columns mean, registers managers, decides every access request. Sees every branch. |
| **Manager** | Runs one or more branches. Sees only the branches an owner approved for them — not the project, not the other branches. |
| **Branch** | The unit of access. Either seeded (the demo network) or produced by splitting an uploaded file on the column the owner confirmed as the branch ID. |

A branch may **claim a forecasting project** via `forecast_project_id` — a
foreign key into the other backend, and the only thing this layer knows about
it. That claim is what turns a dashboard URL into an access question:
`/projects/prj-nus/dashboard` is not a route this layer owns, but a branch has
staked a claim on `prj-nus`, so only that branch's people may open it. A
forecasting project no branch claims is left alone, deliberately — a dataset
pushed straight into forecasting is not governed here.

A project carries an unguessable **invite token**. The link `/join/<token>`
identifies a project; it grants nothing. A manager who opens it can *ask* for
the branches they run, and the owner approves or rejects each one.

## Running the demo

```bash
npm run dev
```

Three accounts and one branch network are seeded on first run. The accounts are
listed on the sign-in screen:

| Email | Password | Role |
| --- | --- | --- |
| `sari.wijaya@gmail.com` | `owner1234` | owner |
| `budi.santoso@gmail.com` | `manager1234` | manager |
| `rina.pratiwi@gmail.com` | `manager1234` | manager |

### The seeded network

`PT ABC Distribution · Jaringan Cabang Nasional`, owned by Sari, three branches,
each claiming a dashboard that already exists in the forecasting fixtures:

| Branch | Location | Dashboard | Status |
| --- | --- | --- | --- |
| `CAB-JKT-01` | Jakarta Pusat | `prj-abc` | ready |
| `PBR-BDG-01` | Bandung | `prj-nus` | needs review |
| `CAB-SBY-01` | Surabaya | `prj-sgr` | processing |

Invite link: `/join/demo-abc-distribution-network` (fixed, so it survives a
restart).

### The walkthrough

1. Sign in as **Sari**. `/projects` shows the network plus all three branch
   dashboards. Every branch opens.
2. Sign in as **Budi** in another browser profile. Same page, no branches — the
   dashboards are not listed, and typing `/projects/prj-abc/dashboard` gives a
   404.
3. As Budi, open the invite link, tick a branch, add a note, request.
4. As Sari → **Team & access** → approve. Approving grants the branch in the
   same transaction.
5. Reload as Budi: exactly that branch's dashboard appears, and the branch
   switcher inside it offers only what he holds. The other two stay invisible.

Or skip the request and register `budi.santoso@gmail.com` directly against
branches from the team screen — a new account gets a one-time password shown
once on Sari's screen.

### The upload flow

Still there, for a project that does not exist yet:

```bash
python3 scripts/generate_dataset.py   # ~139k rows, 8 branches, 14 MB
```

Sign in as Sari → **New project** → upload
`data/generated/penjualan_abc_distribution.csv`. The review screen asks *"Is
this the branch ID column?"*, *"Is this the branch location column?"* and *"Is
this the product column?"*, each pre-answered from your own column names with
real values from the file beside it. Confirm → 8 branches, none of them claiming
a forecasting project yet.

Delete `data/auth.db*` to start over — it is rebuilt and reseeded on the next
request.

## Layout

```
auth/
├── db.ts        SQLite schema, passwords, every query, demo seed
├── session.ts   signed cookie, getSession/requireSession/requireOwner/
│                requireProjectAccess/requireForecastAccess
├── dataset.ts   CSV profiling, column guessing, the branch split
├── actions.ts   every write the app accepts (Server Actions)
└── check.ts     `npm run check:auth` — 21 assertions, throwaway database
```

Storage is `node:sqlite`, a Node builtin, so the whole layer adds no dependency.
Importing any of it from a Client Component fails the build, which is the
boundary we want: server-only by construction rather than by convention.

**The separation is enforced, not promised.** `eslint.config.mjs` restricts
`auth/**` to node builtins, `next`, `react` and its own siblings — an import
from `@/app`, `@/components`, `@/lib` or anywhere above the directory fails
`npm run lint`. The app depends on auth; auth depends on nothing in the app.
That is what stops a separate service quietly growing back into the codebase it
was separated from.

## Security notes

- Passwords are scrypt with a per-user salt. A sign-in against an unknown
  address still does the hashing work, so response time does not reveal which
  accounts exist.
- The session cookie is `payload.HMAC-SHA256`, httpOnly, 8 hours. A tampered
  cookie is rejected. The key comes from `AUTH_SECRET`, or is generated on first
  run and kept in the database — never in source.
- The cookie asserts identity only. Every request re-reads the user and their
  grants from the database, so a revoked branch takes effect immediately rather
  than at next sign-in.
- Server Actions are reachable by direct POST, so each one re-checks the caller.
  No action trusts an id that arrived in the form: projects resolve through
  `requireOwner`, uploads through the caller's own user id, branches through the
  project they belong to.
- Refusal is a 404, not a 403. Telling someone a project exists but is not
  theirs is already more than they are entitled to know.
- Lists and guards share one rule. `visibleForecastProjects` is the set form of
  what `requireForecastAccess` enforces, so the branch switcher cannot offer a
  branch that would 404 — two copies of that rule would drift, and the drift
  would look like a branch that is listed but unopenable.

## Known limits

- **A manager invited by an owner gets a generated password shown once**, on the
  owner's screen. There is no mail server. Wire one and this becomes a real
  invite email.
- **A 404 under `/projects/*` is served with a 200 status.** The workspace
  layout flushes the shell before the page's guard runs, which locks the status
  in. The body is the 404 page and no data leaks; it predates this work and
  applies to `/projects/[projectId]/review` too. Fix by moving the guard into
  the layout if it starts mattering.
- **A 404 still carries the page's `<title>`**, because Next resolves static
  metadata independently of the component that refused. No branch data is in it
  — it is the route's own static string.
- **Splitting reads the whole upload into memory, twice.** Fine to about 100 MB.
  Stream it with `readline` if uploads outgrow that.
- The branch split is the auth layer's only contact with the data. It does not
  clean, canonicalise or forecast anything — `backend/` does that, separately,
  from the same file.
