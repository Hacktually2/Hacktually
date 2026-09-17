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
export function CopyLink({ token }: { token: string }) {
  const path = `/join/${token}`;
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div>
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
