import { AlertTriangle, Check, Database, Send, Shield } from "@/components/ui/icons";
import { Panel } from "@/components/ui/panel";
import { CopyBlock } from "./copy-link";

/**
 * Connecting an agent to this workspace.
 *
 * The MCP server in `backend/app/integrations/mcp_server.py` speaks stdio, not
 * HTTP, so a browser cannot talk to it — only a local client can. This screen is
 * therefore not a console; it is the instructions for pointing Claude Desktop,
 * Cursor or Claude Code at the server, plus an honest account of what an agent
 * can do once connected.
 *
 * Everything below is read from their file. Nothing here invents a tool.
 */

/** The nine tools, exactly as the server registers them. */
const TOOLS = [
  { name: "list_datasets", what: "Uploaded datasets, newest first, with health and readiness." },
  { name: "ingest_csv", what: "Reads a CSV the agent can see on disk and profiles its schema." },
  { name: "confirm_mapping", what: "Confirms the detected column mapping, optionally correcting fields." },
  { name: "get_data_health", what: "What was found, what was fixed, what cannot be forecast yet." },
  { name: "run_forecast", what: "Segments, backtests, selects a model per series, forecasts, decides." },
  { name: "get_stockout_risk", what: "Items at risk, soonest first. The action list." },
  { name: "get_reorder_recommendation", what: "One item's order quantity, with the arithmetic behind it." },
  { name: "explain_forecast", what: "Why this model was chosen, with every candidate's backtest score." },
  { name: "get_business_value", what: "What the recommendations are worth against current practice." },
];

const WRITE_TOOL = {
  name: "send_procurement_alert",
  what: "Sends a stockout alert to the procurement channel.",
};

export function AgentAccess({ repoRoot }: { repoRoot: string }) {
  const config = `{
  "mcpServers": {
    "adaptive-forecasting": {
      "command": "${repoRoot}/backend/.venv/bin/python",
      "args": ["-m", "app.integrations.mcp_server"],
      "cwd": "${repoRoot}/backend"
    }
  }
}`;

  return (
    <div className="grid animate-enter gap-5 [--enter-delay:80ms] xl:grid-cols-[1.5fr_1fr] xl:items-start">
      <div className="space-y-5">
        <Panel
          title="Connect an agent"
          description="Paste this into Claude Desktop, Cursor or Claude Code. The server runs locally and talks to the same forecasting service this dashboard does."
        >
          <CopyBlock label="MCP server configuration" value={config} />
          <p className="mt-4 text-body-sm leading-relaxed text-ink-secondary">
            The server needs the MCP SDK, which is not in{" "}
            <code className="font-mono text-ink">backend/requirements.txt</code>. Install it
            once into the backend environment:
          </p>
          <CopyBlock
            label="One-time install"
            value={`${repoRoot}/backend/.venv/bin/pip install "mcp[cli]"`}
          />
        </Panel>

        <Panel
          title="What an agent can do"
          description="Nine tools, all reading through the same service layer as this dashboard — an agent and a screen can never disagree about a number."
          padded={false}
        >
          <ul className="divide-y divide-border-subtle">
            {TOOLS.map((tool) => (
              <li key={tool.name} className="flex items-start gap-3 px-5 py-2.5">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-xs bg-surface-sunken text-ink-tertiary">
                  <Database size={12} />
                </span>
                <div className="min-w-0">
                  <code className="text-body-sm font-semibold text-ink">{tool.name}</code>
                  <p className="mt-0.5 text-meta text-ink-secondary">{tool.what}</p>
                </div>
                <span className="ml-auto shrink-0 rounded-full border border-border-subtle px-2 py-0.5 text-meta font-medium text-ink-tertiary">
                  Read
                </span>
              </li>
            ))}
            <li className="flex items-start gap-3 bg-status-watch-surface/40 px-5 py-2.5">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-xs bg-status-watch/15 text-status-watch">
                <Send size={12} />
              </span>
              <div className="min-w-0">
                <code className="text-body-sm font-semibold text-ink">{WRITE_TOOL.name}</code>
                <p className="mt-0.5 text-meta text-ink-secondary">{WRITE_TOOL.what}</p>
              </div>
              <span className="ml-auto shrink-0 rounded-full border border-status-watch/30 px-2 py-0.5 text-meta font-medium text-status-watch">
                Write
              </span>
            </li>
          </ul>
        </Panel>
      </div>

      <div className="space-y-5">
        <Panel title="An agent recommends. You decide." tinted>
          <p className="flex items-start gap-2.5 text-body-sm leading-relaxed text-ink-secondary">
            <Check size={16} className="mt-0.5 shrink-0 text-status-healthy" />
            The one write refuses to run on its own. An agent must first call it for a
            preview, show you the exact message, and only then send. You can do the same thing
            from Supply Chain, where the alert lists every item before it goes.
          </p>
        </Panel>

        <Panel title="What a connected agent can see">
          <p className="flex items-start gap-2.5 text-body-sm leading-relaxed text-status-watch">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>
              <strong className="font-semibold">Every branch, not just yours.</strong> The MCP
              server has no sign-in and no branch scoping, so an agent you connect reads every
              dataset on the service — including branches you have not granted to anyone.
            </span>
          </p>
          <p className="mt-3 border-t border-border-subtle pt-3 text-body-sm leading-relaxed text-ink-secondary">
            Branch access governs this dashboard, not that server. Until the forecasting
            service can scope a read to a location, treat a connected agent as having the same
            reach as you do — and do not hand the config to someone you would not give every
            branch to.
          </p>
        </Panel>

        <div className="flex gap-3 rounded-md border border-border-subtle bg-surface-card px-4 py-3.5">
          <Shield size={17} className="mt-0.5 shrink-0 text-brand-blue-ink" />
          <p className="text-body-sm leading-relaxed text-ink-secondary">
            The assistant inside this app is scoped: it only reads the project you are on. An
            agent connected over MCP is not.
          </p>
        </div>
      </div>
    </div>
  );
}

