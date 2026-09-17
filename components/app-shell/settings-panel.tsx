"use client";

import { useState } from "react";
import type { Session } from "@/app/dummy-data/types";
import {
  getDensity,
  getMotion,
  getTheme,
  setDensity,
  setMotion,
  setTheme,
  type Density,
  type Motion,
  type Theme,
} from "@/lib/preferences";

/**
 * Settings.
 *
 * Every control here changes something visible. There are no placeholder
 * toggles: a setting that does nothing is worse than a missing one, because it
 * teaches people the product lies about its own state.
 *
 * Mounted only once the modal is open, so reading the current values during
 * render is safe and cannot mismatch a server-rendered guess.
 */
export function SettingsPanel({ session }: { session: Session }) {
  const [theme, setThemeState] = useState<Theme>(getTheme);
  const [density, setDensityState] = useState<Density>(getDensity);
  const [motion, setMotionState] = useState<Motion>(getMotion);

  return (
    <div className="space-y-7">
      <Group
        label="Appearance"
        hint="Applies to this browser. System follows your device setting."
      >
        <Segmented
          name="theme"
          value={theme}
          onChange={(v: Theme) => {
            setTheme(v);
            setThemeState(v);
          }}
          options={[
            { value: "system", label: "System" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
        />
      </Group>

      <Group
        label="Table density"
        hint="Compact fits more rows on screen without changing type size."
      >
        <Segmented
          name="density"
          value={density}
          onChange={(v: Density) => {
            setDensity(v);
            setDensityState(v);
          }}
          options={[
            { value: "comfortable", label: "Comfortable" },
            { value: "compact", label: "Compact" },
          ]}
        />
      </Group>

      <Group
        label="Motion"
        hint="Reduce turns off entry and reveal animations. Your device setting is respected either way."
      >
        <Segmented
          name="motion"
          value={motion}
          onChange={(v: Motion) => {
            setMotion(v);
            setMotionState(v);
          }}
          options={[
            { value: "system", label: "Follow system" },
            { value: "reduce", label: "Reduce" },
          ]}
        />
      </Group>

      <Group label="Account">
        <dl className="rounded-md border border-border-subtle bg-surface-sunken/40 px-4 py-3">
          <Row label="Name" value={session.name} />
          <Row label="Email" value={session.email} />
          <Row label="Role" value={session.role} />
          <Row label="Organisation" value={session.organisation} />
        </dl>
        <p className="mt-2 text-meta text-ink-tertiary">
          Account details come from your organisation&rsquo;s directory and cannot be edited
          here.
        </p>
      </Group>
    </div>
  );
}

function Group({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="text-body-sm font-semibold text-brand-deep">{label}</h3>
      {hint && <p className="mt-0.5 mb-2.5 text-meta text-ink-tertiary">{hint}</p>}
      <div className={hint ? "" : "mt-2.5"}>{children}</div>
    </section>
  );
}

/**
 * Radio group styled as a segmented control. Real radios, so arrow keys move
 * between options and the whole thing is reachable without a mouse.
 */
function Segmented<T extends string>({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={name}
      className="inline-flex flex-wrap gap-1 rounded-md border border-border-subtle bg-surface-sunken/60 p-1"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <label
            key={option.value}
            className={`cursor-pointer rounded-sm px-3 py-1.5 text-body-sm font-medium transition-colors duration-(--duration-fast) ${
              active
                ? "bg-surface-card text-brand-deep shadow-ambient"
                : "text-ink-secondary hover:text-brand-deep"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={active}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        );
      })}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <dt className="text-meta text-ink-tertiary">{label}</dt>
      <dd className="min-w-0 truncate text-body-sm font-medium text-ink">{value}</dd>
    </div>
  );
}
