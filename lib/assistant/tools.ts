import "server-only";

/**
 * What the in-app assistant may read.
 *
 * These mirror the read tools in `backend/app/integrations/mcp_server.py` and
 * follow its rules, which are the right rules: every tool goes through the same
 * service layer the dashboard reads, so the assistant and the screen can never
 * disagree about a number; and no tool returns a full series, because 200 rows
 * of forecast will fill the model's context and crowd out the question.
 *
 * Two deliberate differences from the MCP server:
 *
 *   1. **No write.** The procurement alert stays a button a person presses. An
 *      agent may recommend a purchase order; a person raises it.
 *   2. **Branch-scoped.** MCP has no sign-in, so a connected agent reads every
 *      branch. This runs inside a session, so it is handed only the locations
 *      the viewer is entitled to and never sees the rest.
 */
import { backend } from "@/lib/backend/client";
import { toInventoryRow } from "@/lib/backend/adapters";
import type { BackendRecommendation } from "@/lib/backend/types";

/** Matches the MCP server's MAX_ROWS, for the same reason. */
const MAX_ROWS = 20;

export interface ToolContext {
  datasetId: string;
  /** Locations the viewer may see, or null for unrestricted. */
  locations: string[] | null;
}

function inScope(rows: BackendRecommendation[], locations: string[] | null) {
  if (locations === null) return rows;
  const allowed = new Set(locations);
  return rows.filter((row) => row.location_id !== null && allowed.has(row.location_id));
}

export const TOOL_DEFINITIONS = [
  {
    name: "get_stockout_risk",
    description:
      "Items at risk of stocking out, soonest first. This is the action list — use it for any question about what needs ordering, what is urgent, or which locations are in trouble.",
    input_schema: {
      type: "object" as const,
      properties: {
        top_n: {
          type: "number",
          description: `How many items to return, at most ${MAX_ROWS}. Default 10.`,
        },
        location: {
          type: "string",
          description: "Optional location id to narrow to, e.g. CAB-JKT-01.",
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "get_reorder_recommendation",
    description:
      "One item's recommended order quantity with the arithmetic behind it. Use when asked why a specific item needs a specific quantity. Every recommendation breaks down into a sum the buyer can check.",
    input_schema: {
      type: "object" as const,
      properties: {
        series_id: {
          type: "string",
          description: "The series id, e.g. SKU-0033__CAB-JKT-01.",
        },
      },
      required: ["series_id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_data_health",
    description:
      "Data quality for this dataset: what was found, what was fixed, what cannot be forecast and why. Use when asked whether the numbers can be trusted.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "explain_forecast",
    description:
      "Why a particular model was chosen for one series, with every candidate's backtest score. Use when asked how we know a forecast is right for an item.",
    input_schema: {
      type: "object" as const,
      properties: {
        series_id: { type: "string", description: "The series id to explain." },
      },
      required: ["series_id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_business_value",
    description:
      "What the recommendations are worth against current practice — fill rate, stockouts avoided, working capital. Use for questions about impact or ROI.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
];

/**
 * Runs one tool call.
 *
 * Returns a string because that is what a `tool_result` carries. Errors are
 * returned as text rather than thrown: a failed tool should let the model say
 * "I could not read that" and carry on, not abort the whole conversation.
 */
export async function runTool(
  name: string,
  input: Record<string, unknown>,
  context: ToolContext,
): Promise<string> {
  try {
    switch (name) {
      case "get_stockout_risk": {
        const limit = Math.min(Number(input.top_n) || 10, MAX_ROWS);
        const { recommendations } = await backend.getRecommendations(context.datasetId, 200);
        let rows = inScope(recommendations, context.locations);
        if (typeof input.location === "string" && input.location) {
          rows = rows.filter((row) => row.location_id === input.location);
        }
        const ranked = rows
          .filter((row) => row.stockout_risk === "high" || row.stockout_risk === "medium")
          .sort((a, b) => (a.days_until_stockout ?? 999) - (b.days_until_stockout ?? 999))
          .slice(0, limit);

        return JSON.stringify({
          count: ranked.length,
          scope:
            context.locations === null
              ? "all locations"
              : `locations you can access: ${context.locations.join(", ")}`,
          items: ranked.map((row) => ({
            series_id: row.series_id,
            item: row.item_id,
            location: row.location_id,
            risk: row.stockout_risk,
            days_until_stockout: row.days_until_stockout,
            recommended_qty: Math.round(row.recommended_qty),
          })),
        });
      }

      case "get_reorder_recommendation": {
        const seriesId = String(input.series_id ?? "");
        const { recommendations } = await backend.getRecommendations(context.datasetId, 500);
        const match = inScope(recommendations, context.locations).find(
          (row) => row.series_id === seriesId,
        );
        if (!match) {
          return `No recommendation for ${seriesId} in the data you can see.`;
        }
        const row = toInventoryRow(match);
        return JSON.stringify({
          series_id: row.series_id,
          location: row.location,
          risk: row.risk,
          days_until_stockout: row.days_until_stockout,
          recommended_qty: row.recommended_qty,
          why: row.explanation.lines,
          model_used: row.model,
          backtest_wape_percent: row.wape_percent,
          // Say what is missing rather than letting the model infer a zero.
          not_reported_by_the_service: ["coverage_days", "lead_time_days", "moq", "category"],
        });
      }

      case "get_data_health": {
        const health = await backend.getHealth(context.datasetId);
        return JSON.stringify({
          health_score: health.health_score,
          frequency: health.frequency,
          series_forecastable: health.series_forecastable,
          series_total: health.series_total,
          demand_portfolio: health.demand_portfolio,
          findings: health.findings,
          excluded_total: health.series_excluded_count,
        });
      }

      case "explain_forecast": {
        const seriesId = String(input.series_id ?? "");
        if (context.locations !== null) {
          const allowed = context.locations.some((location) => seriesId.includes(location));
          if (!allowed) return `${seriesId} is not in a location you can access.`;
        }
        const result = await backend.getSeriesForecast(context.datasetId, seriesId);
        if (!result.selection) return `No model selection recorded for ${seriesId}.`;
        return JSON.stringify({
          series_id: seriesId,
          model_selected: result.selection.model_name,
          why: result.selection.reason,
          candidates_evaluated: result.candidates,
          profile: result.profile,
        });
      }

      case "get_business_value": {
        const value = await backend.getValue(context.datasetId);
        return JSON.stringify({
          ...value,
          note:
            context.locations === null
              ? undefined
              : "This figure covers the whole dataset, not only your branches — the service cannot scope it by location.",
        });
      }

      default:
        return `Unknown tool: ${name}`;
    }
  } catch (error) {
    return `That read failed: ${error instanceof Error ? error.message : "unknown error"}`;
  }
}
