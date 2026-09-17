"use server";

/**
 * The assistant's one entry point.
 *
 * Runs server-side so the API key never reaches the browser, and so the branch
 * scope is decided here rather than sent up from a client that could change it.
 */
import { getProject } from "@/app/dummy-data";
import { accessibleLocations } from "@/auth/db";
import { requireForecastAccess } from "@/auth/session";
import {
  AssistantUnavailable,
  ask,
  type AssistantMessage,
  type AssistantReply,
} from "@/lib/assistant/ask";

export type AskResult =
  | { ok: true; reply: AssistantReply }
  | { ok: false; error: string; unavailable?: boolean };

/** Enough for a conversation, short enough that context stays cheap. */
const MAX_HISTORY = 20;

export async function askAssistant(
  projectId: string,
  history: AssistantMessage[],
): Promise<AskResult> {
  const user = await requireForecastAccess(projectId);
  const project = await getProject(projectId);
  if (!project) return { ok: false, error: "That project is no longer available." };

  const trimmed = history.slice(-MAX_HISTORY);
  if (trimmed.length === 0 || trimmed[trimmed.length - 1].role !== "user") {
    return { ok: false, error: "Ask a question first." };
  }

  try {
    const reply = await ask(
      trimmed,
      {
        datasetId: project.dataset_id,
        locations: accessibleLocations(user.id, projectId),
      },
      project.name,
    );
    return { ok: true, reply };
  } catch (error) {
    if (error instanceof AssistantUnavailable) {
      return {
        ok: false,
        unavailable: true,
        error:
          "The assistant is not configured. Set ANTHROPIC_API_KEY and restart the dev server.",
      };
    }
    console.error("[assistant]", error);
    return { ok: false, error: "The assistant could not answer. Try again in a moment." };
  }
}
