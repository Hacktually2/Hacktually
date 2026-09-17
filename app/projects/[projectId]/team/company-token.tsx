"use client";

import { useEffect, useState } from "react";
import { rotateCompanyToken, revokeCompanyTokenNow } from "@/auth/actions";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Check, Users } from "@/components/ui/icons";

/**
 * The company token: one door into the owner's organisation.
 *
 * Anyone holding it can create a manager account without paying, so the panel
 * leads with what it does and keeps rotation one click away. Rotation is the
 * revocation mechanism — a new token replaces the old row — which is why the
 * button says "Replace" rather than "Regenerate": it is the consequence that
 * matters, not the operation.
 */
export function CompanyToken({
  token,
  expiresAt,
  uses,
  expired,
  members,
}: {
  token: string | null;
  expiresAt: string | null;
  uses: number;
  expired: boolean;
  members: number;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!token) {
    return (
      <div>
        <p className="text-body-sm leading-relaxed text-ink-secondary">
          Generate a token and send it to your branch managers. They create their own account
          with it — no payment, no invite email — and land in your company with no branch
          access until you approve one.
        </p>
        <form action={rotateCompanyToken} className="mt-4">
          <Button type="submit" className="w-full">
            <Users size={16} />
            Generate company token
          </Button>
        </form>
      </div>
    );
  }

  const link = `/join-company?token=${encodeURIComponent(token)}`;

  return (
    <div>
      {expired && (
        <p className="mb-3 flex items-start gap-2 rounded-sm border border-status-watch/30 bg-status-watch-surface px-3 py-2 text-body-sm text-status-watch">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          This token has expired and no longer works. Replace it to hand out a new one.
        </p>
      )}

      <p className="truncate rounded-sm border border-border-subtle bg-surface-sunken/60 px-3 py-2 font-mono text-body-sm text-ink-secondary">
        {link}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={async () => {
            await navigator.clipboard.writeText(`${location.origin}${link}`);
            setCopied(true);
          }}
        >
          {copied ? <Check size={14} /> : null}
          {copied ? "Copied" : "Copy join link"}
        </Button>
        <form action={rotateCompanyToken}>
          <Button type="submit" variant="ghost" size="sm">
            Replace
          </Button>
        </form>
        <form action={revokeCompanyTokenNow}>
          <Button type="submit" variant="ghost" size="sm">
            Turn off
          </Button>
        </form>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border-subtle pt-3">
        <Stat label="Used" value={String(uses)} />
        <Stat label="In company" value={String(members)} />
        <Stat
          label={expired ? "Expired" : "Expires"}
          value={expiresAt ? expiresAt.slice(0, 10) : "—"}
        />
      </dl>

      <p className="mt-3 text-meta leading-relaxed text-ink-tertiary">
        Replacing it stops the old link working immediately. Managers who already joined keep
        their accounts and their branches.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-meta text-ink-tertiary">{label}</dt>
      <dd className="mt-0.5 text-body-sm font-semibold text-ink" data-numeric>
        {value}
      </dd>
    </div>
  );
}
