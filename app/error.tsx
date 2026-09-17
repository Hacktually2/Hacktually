"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { AlertOctagon } from "@/components/ui/icons";

/**
 * The last line of defence.
 *
 * Every data path in this app already handles its own failure — the backend
 * client turns a dead service into a typed error, and the data layer falls back
 * to fixtures with a badge. This catches what is left: a bug, a bad shape, a
 * render that threw. It offers the two things that actually help, retrying and
 * leaving, and says plainly that nothing was lost.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] unhandled error", error);
  }, [error]);

  return (
    <main className="layout-shell flex flex-1 items-center justify-center py-20">
      <div className="max-w-md text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-status-critical-surface text-status-critical">
          <AlertOctagon size={24} />
        </span>
        <h1 className="mt-5 text-page font-bold text-brand-deep">This screen could not load</h1>
        <p className="mt-2 text-body text-ink-secondary">
          Nothing was changed and no data was lost. Try again, or go back to your projects.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-meta text-ink-tertiary">Reference {error.digest}</p>
        )}
        <div className="mt-7 flex justify-center gap-3">
          <Button type="button" onClick={reset}>
            Try again
          </Button>
          <ButtonLink href="/projects" variant="secondary">
            Back to projects
          </ButtonLink>
        </div>
      </div>
    </main>
  );
}
