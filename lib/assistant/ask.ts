import "server-only";

/**
 * The assistant loop.
 *
 * A manual tool loop rather than the SDK's tool runner, for one reason: every
 * tool here needs the caller's branch scope, and the loop is where that context
 * is held and where each call can be recorded for the UI to show. It is twenty
 * lines, it has no beta surface, and it makes what the assistant did inspectable
 * — which matters more here than brevity, because the thing it is talking about
 * is money.
 */
import Anthropic from "@anthropic-ai/sdk";
import { TOOL_DEFINITIONS, runTool, type ToolContext } from "./tools";

/** The default per the current model table. Not downgraded for cost. */
const MODEL = "claude-opus-5";

/** A planner's question is answered in a few reads, never fifty. */
const MAX_TURNS = 6;

export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantReply {
  text: string;
  /** Which reads it did, so the user can see the working. */
  toolsUsed: string[];
}

export class AssistantUnavailable extends Error {}

function systemPrompt(context: ToolContext, projectName: string): string {
  return [
    "You are the planning assistant inside DemandX, a demand forecasting and inventory tool used by Indonesian distributors and manufacturers.",
    "",
    `You are looking at the project "${projectName}".`,
    context.locations === null
      ? "You can see every location in it."
      : `You can only see these locations: ${context.locations.join(", ")}. Never speculate about other branches; say they are outside what you can see.`,
    "",
    "How to answer:",
    "- Use the tools. Never state a quantity, risk level or date you have not read from one.",
    "- If a tool reports a value as not supplied by the service, say it is not available. Do not estimate it, and do not call it zero.",
    "- Be brief. A planner wants the decision and the reason, not a report.",
    "- Name specific items and locations. 'Three items need ordering' is useless without which.",
    "- Rupiah figures are already in rupiah. Quantities are in units.",
    "",
    "You cannot send anything, change anything, or place an order. If asked to alert procurement, say the alert is on the Supply Chain screen and the person sends it themselves after reviewing the list.",
  ].join("\n");
}

export async function ask(
  history: AssistantMessage[],
  context: ToolContext,
  projectName: string,
): Promise<AssistantReply> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AssistantUnavailable("ANTHROPIC_API_KEY is not set.");
  }

  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = history.map((entry) => ({
    role: entry.role,
    content: entry.content,
  }));
  const toolsUsed: string[] = [];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // Adaptive thinking: choosing which reads answer a planner's question is
      // exactly the kind of decision worth thinking about.
      thinking: { type: "adaptive" },
      system: systemPrompt(context, projectName),
      tools: TOOL_DEFINITIONS,
      messages,
    });

    if (response.stop_reason === "refusal") {
      return {
        text: "I can't answer that one. Try asking about the forecast, the risk list or the data quality.",
        toolsUsed,
      };
    }

    const toolUses = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );

    if (toolUses.length === 0) {
      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();
      return { text: text || "I did not find an answer to that.", toolsUsed };
    }

    messages.push({ role: "assistant", content: response.content });

    // Parallel calls arrive together and their results must go back in ONE user
    // message, or the model learns to stop making them.
    const results: Anthropic.ToolResultBlockParam[] = await Promise.all(
      toolUses.map(async (use) => {
        toolsUsed.push(use.name);
        return {
          type: "tool_result" as const,
          tool_use_id: use.id,
          content: await runTool(
            use.name,
            // Tool inputs are parsed JSON, never string-matched.
            (use.input ?? {}) as Record<string, unknown>,
            context,
          ),
        };
      }),
    );
    messages.push({ role: "user", content: results });
  }

  return {
    text: "That took more steps than I allow in one answer. Try asking something narrower.",
    toolsUsed,
  };
}
