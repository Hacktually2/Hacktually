"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { askAssistant } from "@/app/projects/[projectId]/dashboard/assistant-actions";
import type { AssistantMessage } from "@/lib/assistant/ask";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Database, Info, Search } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";

/**
 * Ask the data a question.
 *
 * The dashboard answers "what is the state". This answers "what do I do about
 * it", in the planner's own words, over the same numbers — it reads through the
 * same service layer every screen does, so it cannot quote a figure the screen
 * would contradict.
 *
 * It reads and nothing else. Sending the procurement alert stays a button a
 * person presses on Supply Chain, which is the same line the MCP server draws:
 * an agent may recommend a purchase order, a person raises it.
 */
const SUGGESTIONS = [
  "What needs ordering this week, and why?",
  "Which location is in the worst shape?",
  "Can I trust this forecast?",
];

type Entry = AssistantMessage & { tools?: string[] };

export function AssistantPanel({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  // Keep the newest turn in view as the conversation grows.
  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: "end" });
  }, [entries, pending, open]);

  function send(question: string) {
    const text = question.trim();
    if (!text || pending) return;

    const next: Entry[] = [...entries, { role: "user", content: text }];
    setEntries(next);
    setDraft("");
    setError(null);

    startTransition(async () => {
      const result = await askAssistant(
        projectId,
        next.map(({ role, content }) => ({ role, content })),
      );
      if (result.ok) {
        setEntries([
          ...next,
          {
            role: "assistant",
            content: result.reply.text,
            tools: [...new Set(result.reply.toolsUsed)],
          },
        ]);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Search size={15} />
        Ask the data
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Ask the data"
        description="Reads the same forecasts and recommendations this dashboard shows. It cannot change or send anything."
      >
        <div className="max-h-[52vh] min-h-56 overflow-y-auto pr-1">
          {entries.length === 0 ? (
            <div className="py-4">
              <p className="text-body-sm text-ink-secondary">
                Ask about the forecast, what needs ordering, or whether the data can be
                trusted.
              </p>
              <ul className="mt-4 space-y-2">
                {SUGGESTIONS.map((suggestion) => (
                  <li key={suggestion}>
                    <button
                      type="button"
                      onClick={() => send(suggestion)}
                      className="w-full rounded-sm border border-border-subtle px-3 py-2 text-left text-body-sm text-ink-secondary transition-colors duration-(--duration-fast) hover:border-brand-blue/40 hover:bg-brand-pale-soft/50 hover:text-brand-deep"
                    >
                      {suggestion}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <ul className="space-y-4 py-1">
              {entries.map((entry, index) => (
                <li key={index}>
                  {entry.role === "user" ? (
                    <p className="ml-auto max-w-[85%] rounded-md bg-brand-pale-soft px-3 py-2 text-body-sm text-brand-deep">
                      {entry.content}
                    </p>
                  ) : (
                    <div className="max-w-[92%]">
                      <p className="text-body-sm leading-relaxed whitespace-pre-wrap text-ink">
                        {entry.content}
                      </p>
                      {entry.tools && entry.tools.length > 0 && (
                        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-meta text-ink-tertiary">
                          <Database size={12} />
                          Read {entry.tools.join(", ")}
                        </p>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {pending && (
            <p className="py-3 text-body-sm text-ink-tertiary" aria-live="polite">
              Reading the forecast…
            </p>
          )}
          <div ref={endRef} />
        </div>

        {error && (
          <p
            className="mt-3 flex items-start gap-2 rounded-sm border border-status-critical/25 bg-status-critical-surface px-3 py-2.5 text-body-sm text-status-critical"
            role="alert"
          >
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            {error}
          </p>
        )}

        <form
          className="mt-4 flex gap-2 border-t border-border-subtle pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            send(draft);
          }}
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask about this project…"
            aria-label="Ask about this project"
            className="h-10 flex-1 rounded-sm border border-border-default bg-surface-card px-3 text-body text-ink placeholder:text-ink-disabled focus:border-brand-blue focus:outline-none"
          />
          <Button type="submit" disabled={pending || draft.trim() === ""}>
            Ask
          </Button>
        </form>

        <p className="mt-3 flex items-start gap-2 text-meta text-ink-tertiary">
          <Info size={13} className="mt-0.5 shrink-0" />
          Answers come from the same endpoints as the screens behind this panel. It only sees
          the branches you can.
        </p>
      </Modal>
    </>
  );
}
