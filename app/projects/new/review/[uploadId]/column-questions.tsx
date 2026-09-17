"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { confirmColumns, type ConfirmState } from "@/auth/actions";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Check, Info } from "@/components/ui/icons";

const INITIAL: ConfirmState = { error: null };

type QuestionKey = "branch_id_column" | "branch_location_column" | "product_column";

/**
 * Each question names what the answer is used for, because "which column is
 * the branch ID" is only answerable if you know why anyone is asking.
 */
const QUESTIONS: { key: QuestionKey; question: string; because: string }[] = [
  {
    key: "branch_id_column",
    question: "Is this the branch ID column?",
    because: "Rows are grouped by this column, and each group becomes a branch a manager can be given.",
  },
  {
    key: "branch_location_column",
    question: "Is this the branch location column?",
    because: "This is what the branch is called on screen — the city or area it trades in.",
  },
  {
    key: "product_column",
    question: "Is this the product column?",
    because: "Products are counted per branch, so each branch shows its own assortment.",
  },
];

export function ColumnQuestions({
  uploadId,
  columns,
  samples,
  guesses,
  defaultName,
}: {
  uploadId: string;
  columns: string[];
  samples: Record<string, string[]>;
  guesses: { branchId: string | null; branchLocation: string | null; product: string | null };
  defaultName: string;
}) {
  const [state, action] = useActionState(confirmColumns, INITIAL);
  const [answers, setAnswers] = useState<Record<QuestionKey, string>>({
    branch_id_column: guesses.branchId ?? "",
    branch_location_column: guesses.branchLocation ?? "",
    product_column: guesses.product ?? "",
  });

  const unanswered = QUESTIONS.filter((q) => !answers[q.key]).length;
  const clash =
    answers.branch_id_column !== "" &&
    answers.branch_id_column === answers.branch_location_column;

  return (
    <form action={action}>
      <input type="hidden" name="upload_id" value={uploadId} />

      <div className="space-y-4">
        {QUESTIONS.map((question) => (
          <Question
            key={question.key}
            question={question.question}
            because={question.because}
            name={question.key}
            value={answers[question.key]}
            guessed={
              answers[question.key] ===
              (question.key === "branch_id_column"
                ? guesses.branchId
                : question.key === "branch_location_column"
                  ? guesses.branchLocation
                  : guesses.product)
            }
            columns={columns}
            samples={samples}
            onChange={(value) =>
              setAnswers((prev) => ({ ...prev, [question.key]: value }))
            }
          />
        ))}
      </div>

      <div className="mt-6 border-t border-border-subtle pt-5">
        <label
          htmlFor="name"
          className="mb-1.5 block text-body-sm font-medium text-brand-deep"
        >
          Project name
        </label>
        <input
          id="name"
          name="name"
          defaultValue={defaultName}
          maxLength={80}
          className="h-10 w-full max-w-sm rounded-sm border border-border-default bg-surface-card px-3 text-body text-ink focus:border-brand-blue focus:outline-none"
        />
      </div>

      {clash && (
        <p className="mt-4 flex items-start gap-2 rounded-sm border border-status-watch/25 bg-status-watch-surface px-3 py-2.5 text-body-sm text-status-watch">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          The branch ID and branch location cannot be the same column.
        </p>
      )}

      {state.error && (
        <p
          className="mt-4 flex items-start gap-2 rounded-sm border border-status-critical/25 bg-status-critical-surface px-3 py-2.5 text-body-sm text-status-critical"
          role="alert"
        >
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          {state.error}
        </p>
      )}

      <Submit blocked={unanswered > 0 || clash} unanswered={unanswered} />
    </form>
  );
}

function Question({
  question,
  because,
  name,
  value,
  guessed,
  columns,
  samples,
  onChange,
}: {
  question: string;
  because: string;
  name: string;
  value: string;
  /** True while the answer is still the one we proposed. */
  guessed: boolean;
  columns: string[];
  samples: Record<string, string[]>;
  onChange: (value: string) => void;
}) {
  const values = samples[value] ?? [];

  return (
    <fieldset className="rounded-md border border-border-subtle bg-surface-sunken/40 p-4">
      <legend className="px-1 text-body font-semibold text-brand-deep">{question}</legend>

      <div className="flex flex-wrap items-center gap-3">
        <select
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={question}
          className="h-10 min-w-56 rounded-sm border border-border-default bg-surface-card px-2.5 text-body font-medium text-ink focus:border-brand-blue focus:outline-none"
        >
          <option value="">Select a column…</option>
          {columns.map((column) => (
            <option key={column} value={column}>
              {column}
            </option>
          ))}
        </select>

        {value && guessed && (
          <span className="flex items-center gap-1.5 text-meta font-medium text-status-healthy">
            <Check size={14} />
            Detected from your column names
          </span>
        )}
        {value && !guessed && (
          <span className="flex items-center gap-1.5 text-meta font-medium text-brand-blue-ink">
            <Info size={14} />
            Your choice
          </span>
        )}
      </div>

      <p className="mt-2.5 text-body-sm leading-relaxed text-ink-secondary">{because}</p>

      {value && (
        <p className="mt-2 text-meta text-ink-tertiary">
          Values in this column:{" "}
          <span className="font-mono text-ink-secondary">
            {values.length > 0 ? values.join(" · ") : "none read"}
          </span>
        </p>
      )}
    </fieldset>
  );
}

function Submit({ blocked, unanswered }: { blocked: boolean; unanswered: number }) {
  const { pending } = useFormStatus();
  return (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      <Button type="submit" size="lg" disabled={blocked || pending}>
        {pending ? "Splitting…" : "Confirm and split by branch"}
      </Button>
      <p className="text-body-sm text-ink-secondary" aria-live="polite">
        {pending
          ? "Reading every row once."
          : unanswered > 0
            ? `${unanswered} ${unanswered === 1 ? "question" : "questions"} still to answer.`
            : "All three answered."}
      </p>
    </div>
  );
}
