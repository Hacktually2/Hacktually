"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Check } from "@/components/ui/icons";

/**
 * The project link.
 *
 * The path is rendered on the server and the origin is only read at the moment
 * of copying, so the link is right on localhost, on a preview URL and in
 * production without an env var — and without an effect that would rewrite the
 * markup after paint.
 */
export function CopyLink({
  token,
  projectId,
}: {
  token: string;
  projectId: string;
}) {
  // Two links that do the same job. The project URL is the one to hand out —
  // it is readable and it is the page they will end up on anyway. The token
  // link stays because it is already in circulation and still works.
  const [which, setWhich] = useState<"project" | "token">("project");
  const path = which === "project" ? `/projects/${projectId}/team` : `/join/${token}`;
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div>
      <div className="mb-2 flex gap-1" role="group" aria-label="Which link to copy">
        {(
          [
            ["project", "Project link"],
            ["token", "Invite token"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setWhich(key);
              setCopied(false);
            }}
            aria-pressed={which === key}
            className={`rounded-sm border px-2.5 py-1 text-meta font-semibold transition-colors duration-(--duration-fast) ${
              which === key
                ? "border-brand-blue bg-brand-pale text-brand-deep"
                : "border-border-subtle text-ink-secondary hover:text-brand-deep"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="truncate rounded-sm border border-border-subtle bg-surface-sunken/60 px-3 py-2 font-mono text-body-sm text-ink-secondary">
        {path}
      </p>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="mt-3"
        onClick={async () => {
          await navigator.clipboard.writeText(`${location.origin}${path}`);
          setCopied(true);
        }}
      >
        {copied ? <Check size={14} /> : null}
        {copied ? "Full link copied" : "Copy full link"}
      </Button>
    </div>
  );
}

/**
 * A block of text with a copy button — a config snippet, a shell command.
 *
 * Unlike CopyLink the value is complete as rendered, so it is shown in full and
 * copied verbatim. Wraps rather than truncates: a config you cannot read is a
 * config you cannot check before pasting it into your editor.
 */
export function CopyBlock({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div className="mt-3 first:mt-0">
      <div className="flex items-center justify-between gap-4">
        <p className="text-meta font-semibold tracking-wide text-ink-tertiary uppercase">
          {label}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
          }}
        >
          {copied ? <Check size={14} /> : null}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="mt-1.5 overflow-x-auto rounded-sm border border-border-subtle bg-surface-sunken/60 p-3 font-mono text-body-sm whitespace-pre-wrap text-ink-secondary">
        {value}
      </pre>
    </div>
  );
}
