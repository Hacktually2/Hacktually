import type { Metadata } from "next";
import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import { ForecastChart } from "@/components/charts/forecast-chart";
import { Reveal, RevealNoScriptFallback } from "@/components/marketing/reveal";
import { SiteFooter, SiteHeader } from "@/components/marketing/site-chrome";
import { ButtonLink } from "@/components/ui/button";
import { ArrowRight, Check, Database, Layers, Shield } from "@/components/ui/icons";
import { getSession } from "@/lib/session";
import { formatByUnit, formatPercent } from "@/lib/format";
import { DEMAND } from "./dummy-data/demand";
import { OVERVIEW } from "./dummy-data/overview";

export const metadata: Metadata = {
  title: "DemandX · Demand forecasting for manufaktur & ritel",
  description:
    "Upload the CSV your ERP already produces. Get a validated forecast and a ranked list of what to reorder.",
};

export default async function LandingPage() {
  const session = await getSession();

  return (
    <>
      <RevealNoScriptFallback />
      <SiteHeader session={session} />
      <main className="flex-1">
        <Hero signedIn={Boolean(session)} />
        <Proof />
        <Platform />
        <Workflow />
        <Calendar />
        <Deployment />
        <ClosingCta signedIn={Boolean(session)} />
      </main>
      <SiteFooter />
    </>
  );
}

/* ------------------------------------------------------------------- hero */

/**
 * A headline line that rises out of a clipping mask. The mask is the outer
 * span; only the inner one moves.
 */
function Line({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return (
    <span className="block overflow-hidden pb-[0.1em]">
      <span
        className="animate-enter-line block"
        style={{ "--enter-delay": `${delay}ms` } as CSSProperties}
      >
        {children}
      </span>
    </span>
  );
}

/** Formats that map without manual work. Stands in for a customer logo row. */
const READS = ["Accurate", "Jubelio", "HashMicro", "SimpliDOTS", "Moka"];

function Hero({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="relative isolate overflow-hidden">
      {/* Two background layers: a photograph for atmosphere and a grid for
          structure. Both sit behind the content and neither is decorative
          enough to compete with it. */}
      <div className="pointer-events-none absolute inset-0 -z-20 overflow-hidden" aria-hidden="true">
        {/* Not `priority`: at 9% opacity behind a headline, this is texture.
            Preloading it would make it compete with the font and the text for
            the first bytes, to fix something nobody can see arrive late.
            `sizes` caps the requested width because the source is only 1056px
            wide, and the low quality is free at this opacity. */}
        <Image
          src="/herobuildings.webp"
          alt=""
          fill
          sizes="(max-width: 768px) 100vw, 1100px"
          quality={40}
          className="hero-photo object-cover object-center"
        />
      </div>
      <div className="hero-grid pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />

      <div className="layout-shell pt-16 pb-14 md:pt-24">
        <div className="max-w-3xl">
          <p className="animate-enter inline-flex items-center rounded-full border border-brand-blue/25 bg-brand-blue-soft px-3 py-1 text-meta font-semibold tracking-[0.1em] text-brand-blue-ink uppercase">
            Demand forecasting · Manufaktur &amp; Ritel
          </p>

          <h1 className="mt-5 text-display leading-[1.05] font-bold tracking-tight text-brand-deep md:text-display-lg">
            <Line delay={120}>From sales history</Line>
            <Line delay={210}>to this week&rsquo;s orders.</Line>
          </h1>

          <p className="mt-6 max-w-xl animate-enter text-section leading-relaxed text-ink-secondary [--enter-delay:360ms]">
            Upload the CSV your ERP already produces. Get a validated forecast and a ranked list
            of what to reorder.
          </p>

          <div className="mt-8 flex animate-enter flex-wrap items-center gap-3 [--enter-delay:430ms]">
            <ButtonLink href={signedIn ? "/projects" : "/login"} size="lg">
              {signedIn ? "Go to workspace" : "Request a demo"}
              <ArrowRight size={18} />
            </ButtonLink>
            {!signedIn && (
              <ButtonLink href="/login" variant="secondary" size="lg">
                Sign in
              </ButtonLink>
            )}
          </div>

          <div className="mt-10 flex animate-enter flex-wrap items-center gap-x-4 gap-y-2 border-t border-border-subtle pt-5 [--enter-delay:500ms]">
            <span className="text-meta font-medium text-ink-tertiary">Reads exports from</span>
            {READS.map((name) => (
              <span key={name} className="text-body-sm font-semibold text-brand-deep/70">
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* The product itself, not an illustration of it. */}
      <div className="layout-shell pb-16">
        <div className="surface-elevated animate-enter-panel overflow-hidden p-0 [--enter-delay:560ms]">
          <div className="flex items-center justify-between gap-4 border-b border-border-subtle px-5 py-3">
            <div>
              <p className="text-body-sm font-semibold text-brand-deep">
                Overview · PT ABC Distribution
              </p>
              <p className="text-meta text-ink-tertiary">
                Demonstration dataset · 428 series · last processed 17 Sep 2026
              </p>
            </div>
            <span className="hidden rounded-full border border-border-subtle px-2.5 py-1 text-meta text-ink-tertiary sm:inline">
              Read-only preview
            </span>
          </div>

          <div className="grid gap-px bg-border-subtle sm:grid-cols-2 lg:grid-cols-4">
            {OVERVIEW.kpis.map((kpi) => (
              <div key={kpi.key} className="bg-surface-card px-5 py-4">
                <p className="text-meta font-medium text-ink-tertiary">{kpi.label}</p>
                {kpi.value === null ? (
                  <p className="mt-1 text-section font-semibold text-ink-disabled">Unavailable</p>
                ) : (
                  <p className="mt-1 text-metric font-bold text-brand-deep" data-numeric>
                    {formatByUnit(kpi.value, kpi.unit)}
                  </p>
                )}
                <p className="mt-0.5 text-meta text-ink-tertiary">{kpi.context}</p>
              </div>
            ))}
          </div>

          <div className="border-t border-border-subtle p-5">
            <ForecastChart series={OVERVIEW.demand_chart} height={260} interactive={false} />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ proof */

function Proof() {
  const stats = [
    {
      value: formatPercent(DEMAND.accuracy.wape_percent),
      label: "WAPE on the demo dataset",
      detail: `A seasonal naive baseline scores ${formatPercent(
        DEMAND.accuracy.baseline_wape_percent
      )}.`,
    },
    {
      value: "2",
      label: "Rolling validation windows",
      detail: "Every forecast is backtested before you see it.",
    },
    {
      value: "4",
      label: "Demand patterns",
      detail: "Each one routes to a different set of models.",
    },
    {
      value: "21",
      label: "Months of history read",
      detail: "Covering two Lebaran peaks, eleven days apart.",
    },
  ];

  return (
    <section className="border-y border-border-subtle bg-surface-card">
      <div className="layout-shell grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s, i) => (
          <Reveal key={s.label} delay={i * 70}>
            <p className="text-metric font-bold text-brand-deep" data-numeric>
              {s.value}
            </p>
            <p className="mt-1 text-body font-semibold text-ink">{s.label}</p>
            <p className="mt-1 text-body-sm text-ink-secondary">{s.detail}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- platform */

function Platform() {
  const capabilities = [
    {
      Icon: Database,
      title: "Start with data you trust",
      body: "Columns are matched against known ERP exports first. You confirm every mapping before a forecast runs.",
      points: [
        "Five Indonesian ERP presets",
        "Health report that says what to fix",
        "Censored demand flagged where stock hit zero",
      ],
    },
    {
      Icon: Layers,
      title: "Forecast, then prove it",
      body: "Models compete on your own history. The winner is picked by backtest, and its error sits next to the result.",
      points: [
        "ADI and CV² segmentation",
        "WAPE for smooth demand, MASE for sparse",
        "Bias reported beside accuracy",
      ],
    },
    {
      Icon: Shield,
      title: "Turn it into an order",
      body: "Lead-time demand, safety stock and minimum order quantity become one number you can check line by line.",
      points: [
        "Purchase quantities for ritel, production for manufaktur",
        "Parameters set per category",
        "A ranked action list",
      ],
    },
  ];

  return (
    <section id="platform" className="layout-shell scroll-mt-20 py-20">
      <Reveal>
        <SectionHeading
          eyebrow="Platform"
          title="Three problems, in order"
          description="Most forecasting projects die on data nobody trusts. This one is built in the order the work actually happens."
        />
      </Reveal>

      <div className="mt-10 grid gap-5 lg:grid-cols-3">
        {capabilities.map((c, i) => (
          <Reveal key={c.title} delay={i * 110} as="article" className="h-full">
            <article className="surface-card flex h-full flex-col p-6">
              <c.Icon size={22} className="text-brand-blue-ink" />
              <h3 className="mt-4 text-section font-semibold text-brand-deep">{c.title}</h3>
              <p className="mt-2 text-body leading-relaxed text-ink-secondary">{c.body}</p>
              <ul className="mt-4 space-y-2 border-t border-border-subtle pt-4">
                {c.points.map((p) => (
                  <li key={p} className="flex gap-2.5 text-body-sm text-ink-secondary">
                    <span
                      className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-blue"
                      aria-hidden="true"
                    />
                    {p}
                  </li>
                ))}
              </ul>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- workflow */

function Workflow() {
  const steps = [
    { n: "01", title: "Upload", body: "Drop a CSV, or post rows to the ingest endpoint." },
    { n: "02", title: "Confirm", body: "Check the detected columns and the health report." },
    { n: "03", title: "Forecast", body: "Series are classified and models compete." },
    { n: "04", title: "Investigate", body: "Read the forecast, its interval and its accuracy." },
    { n: "05", title: "Act", body: "Work the ranked list of what needs ordering." },
  ];

  return (
    <section
      id="workflow"
      className="scroll-mt-20 border-y border-border-subtle bg-surface-card py-20"
    >
      <div className="layout-shell">
        <Reveal>
          <SectionHeading
            eyebrow="How it works"
            title="From export to order in one pass"
            description="Onboarding runs in sequence. After that the dashboard is yours to move around freely."
          />
        </Reveal>

        <ol className="mt-10 grid gap-px overflow-hidden rounded-md bg-border-subtle md:grid-cols-5">
          {steps.map((s, i) => (
            <Reveal key={s.n} delay={i * 80} as="li" className="bg-surface-card">
              <div className="p-5">
                <p className="text-meta font-bold tracking-wider text-brand-blue-ink">{s.n}</p>
                <h3 className="mt-2 text-body font-semibold text-brand-deep">{s.title}</h3>
                <p className="mt-1 text-body-sm leading-relaxed text-ink-secondary">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- calendar */

function Calendar() {
  const points = [
    {
      t: "Known-future covariates",
      d: "Ramadan, THR payouts and payday cycles are known in advance, so the model takes them as future inputs.",
    },
    {
      t: "A signed distance",
      d: "Days to Lebaran runs negative after the holiday. The ramp up and the collapse are different shapes.",
    },
    {
      t: "Censored demand",
      d: "Where stock hit zero, recorded sales understate real demand. Those periods are masked from fitting.",
    },
  ];

  return (
    <section id="calendar" className="layout-shell scroll-mt-20 py-20">
      <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
        <div>
          <Reveal>
            <SectionHeading
              eyebrow="Indonesian demand"
              title="Lebaran does not sit still"
              description="It moves about eleven days earlier each year. Fixed-calendar seasonality cannot follow it, so imported tools miss the biggest demand event of the year."
              align="left"
            />
          </Reveal>

          <dl className="mt-8 space-y-5">
            {points.map((item, i) => (
              <Reveal key={item.t} delay={120 + i * 90}>
                <dt className="text-body font-semibold text-brand-deep">{item.t}</dt>
                <dd className="mt-1 text-body leading-relaxed text-ink-secondary">{item.d}</dd>
              </Reveal>
            ))}
          </dl>
        </div>

        <Reveal delay={100}>
          <div className="surface-card p-5">
            <p className="text-body-sm font-semibold text-brand-deep">
              Weekly demand, 18 months of history
            </p>
            <p className="mt-0.5 mb-4 text-meta text-ink-tertiary">
              Two Lebaran peaks, eleven days apart, then the post-holiday collapse.
            </p>
            <ForecastChart series={DEMAND.chart} height={280} interactive={false} />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- deployment */

function Deployment() {
  const rows = [
    ["Data residency", "Deploys to Indonesian cloud infrastructure, billed in Rupiah"],
    ["Ingestion", "CSV upload, JSON API, and ERP or POS connectors"],
    ["Access", "REST API, plus an MCP server for agent workflows"],
    ["Model layer", "Swappable behind one adapter interface"],
    ["Audit trail", "Every mapping decision and forecast run is recorded"],
  ];

  return (
    <section
      id="deployment"
      className="scroll-mt-20 border-y border-border-subtle bg-surface-card py-20"
    >
      <div className="layout-shell grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
        <Reveal>
          <SectionHeading
            eyebrow="Deployment"
            title="Answers procurement will ask for"
            description="The questions that decide a trial are rarely about accuracy."
            align="left"
          />
        </Reveal>

        <Reveal delay={120}>
          <dl className="overflow-hidden rounded-md border border-border-subtle">
            {rows.map(([term, detail], i) => (
              <div
                key={term}
                className={`grid gap-1 px-5 py-4 sm:grid-cols-[200px_1fr] sm:gap-6 ${
                  i > 0 ? "border-t border-border-subtle" : ""
                }`}
              >
                <dt className="text-body-sm font-semibold text-brand-deep">{term}</dt>
                <dd className="text-body text-ink-secondary">{detail}</dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- cta */

/**
 * The page ends on an inverted band. Deep blue is the grounding brand colour
 * (design.md §6.1), and using it once, at the close, gives the page a definite
 * ending without letting dark surfaces anywhere near the workspace.
 */
const REASSURANCES = [
  "Deploys to Indonesian cloud infrastructure",
  "Works from a CSV export",
  "Eighteen months of history is enough",
];

function ClosingCta({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="layout-shell py-20">
      <Reveal>
        <div className="relative isolate overflow-hidden rounded-xl bg-surface-brand px-8 py-14 md:px-14 md:py-20">
          {/* One soft light source, well under the threshold where it would
              read as a glowing blob (design.md §15). */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-48 left-1/2 -z-10 size-176 -translate-x-1/2 rounded-full opacity-25 blur-3xl"
            style={{
              background:
                "radial-gradient(circle, var(--color-accent-lavender), transparent 65%)",
            }}
          />

          {/* Centred, because a closing statement addressed to no particular
              side of the page reads as the end of the argument. */}
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-page leading-[1.12] font-bold tracking-tight text-ink-on-brand md:text-display">
              <span className="reveal-line">
                <span>Bring one export.</span>
              </span>
              <span className="reveal-line [--enter-delay:90ms]">
                <span>See a forecast the same afternoon.</span>
              </span>
            </h2>

            <p className="mx-auto mt-5 max-w-xl text-section leading-relaxed text-ink-on-deep">
              The health report tells you what to fix before anyone trusts a number.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <ButtonLink
                href={signedIn ? "/projects" : "/login"}
                variant="inverse"
                size="lg"
              >
                {signedIn ? "Go to workspace" : "Request a demo"}
                <ArrowRight size={18} />
              </ButtonLink>
              <ButtonLink href="/#workflow" variant="inverseGhost" size="lg">
                See how it works
              </ButtonLink>
            </div>

            <ul className="mt-12 flex flex-wrap justify-center gap-x-8 gap-y-3 border-t border-ink-on-brand/15 pt-6">
              {REASSURANCES.map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-2 text-body-sm text-ink-on-deep"
                >
                  <Check size={15} className="shrink-0 opacity-80" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/* ----------------------------------------------------------------- shared */

function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
}: {
  eyebrow: string;
  title: string;
  description: string;
  align?: "center" | "left";
}) {
  return (
    <div className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-xl"}>
      <p className="text-meta font-semibold tracking-[0.12em] text-brand-blue-ink uppercase">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-page font-bold tracking-tight text-brand-deep md:text-display">
        <span className="reveal-line">
          <span>{title}</span>
        </span>
      </h2>
      <p className="mt-3 text-body leading-relaxed text-ink-secondary md:text-section">
        {description}
      </p>
    </div>
  );
}
