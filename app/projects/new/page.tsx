import type { Metadata } from "next";
import { DEFAULT_PROJECT_ID } from "@/app/dummy-data";
import { Panel, PageHeader } from "@/components/ui/panel";
import { Check, Info } from "@/components/ui/icons";
import { UploadPanel } from "./upload-panel";

export const metadata: Metadata = { title: "New project" };

const EXPECTED = [
  { field: "Date", note: "Transaction or order date", required: true },
  { field: "Product", note: "SKU or product code", required: true },
  { field: "Quantity", note: "Units sold or shipped", required: true },
  { field: "Location", note: "Branch, warehouse or store", required: false },
  { field: "Price", note: "Unit price, enables revenue forecast", required: false },
  { field: "Inventory", note: "Closing stock, enables reorder advice", required: false },
];

const PRESETS = ["Accurate Online", "Jubelio", "HashMicro", "SimpliDOTS", "Moka"];

export default function NewProjectPage() {
  return (
    <main className="layout-shell flex-1 py-10">
      <PageHeader
        title="Upload dataset"
        description="Start a new analysis context. The system profiles the file and asks you to confirm what it found before anything runs."
      />

      <div className="mt-8 grid animate-enter gap-5 [--enter-delay:80ms] lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <Panel>
          <UploadPanel targetProjectId={DEFAULT_PROJECT_ID} />
        </Panel>

        <div className="space-y-5">
          <Panel title="Expected fields" description="Three are required. The rest unlock more of the product.">
            <ul className="space-y-2.5">
              {EXPECTED.map((item) => (
                <li key={item.field} className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-body-sm font-semibold text-ink">{item.field}</p>
                    <p className="text-meta text-ink-tertiary">{item.note}</p>
                  </div>
                  <span
                    className={`mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-meta font-medium ${
                      item.required
                        ? "border-brand-deep/20 bg-brand-pale-soft text-brand-deep"
                        : "border-border-subtle text-ink-tertiary"
                    }`}
                  >
                    {item.required ? "Required" : "Optional"}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Recognised exports">
            <p className="text-body-sm text-ink-secondary">
              Column meanings are matched against known export formats first, so these need no
              manual mapping.
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <li
                  key={p}
                  className="flex items-center gap-1.5 rounded-full border border-border-subtle px-2.5 py-1 text-meta font-medium text-ink-secondary"
                >
                  <Check size={13} className="text-brand-blue-ink" />
                  {p}
                </li>
              ))}
            </ul>
          </Panel>

          <div className="flex gap-3 rounded-md border border-border-subtle bg-surface-card px-4 py-3.5">
            <Info size={17} className="mt-0.5 shrink-0 text-brand-blue-ink" />
            <p className="text-body-sm leading-relaxed text-ink-secondary">
              At least 18 months of history gives the most reliable seasonality, including the
              Lebaran shift. Shorter histories still forecast, with wider intervals.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
