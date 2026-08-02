import { useState, useCallback, useRef, useEffect } from "react";
import { Copy, Check, ExternalLink } from "lucide-react";

/**
 * A prompt the student copies into Claude, plus a link to go run it.
 *
 * The slowest part of getting started is typing a schedule in by hand. Most
 * students already have it somewhere — a screenshot, a course-request PDF, a
 * registration page — just not as text this app can read. Rather than build a
 * parser for each of those, hand them a prompt that turns whatever they have
 * into the one line format the importer already understands.
 *
 * The prompt deliberately asks for that plain line format rather than JSON.
 * The backend parser already does text → structured items, and it is the thing
 * that owns the schema; asking Claude for JSON would mean two definitions of
 * the same shape, drifting apart on the first change.
 */

interface Props {
  title: string;
  description: string;
  prompt: string;
  /** Where the pasted result should go, e.g. "the box below". */
  returnHint: string;
}

export default function ClaudePromptCard({
  title,
  description,
  prompt,
  returnHint,
}: Props) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Without this, the timeout fires after the modal closes and calls
  // setState on an unmounted component.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked outside a secure context and in some embedded
      // browsers. Select the text so a manual copy still works.
      const el = document.getElementById("claude-prompt-text");
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  }, [prompt]);

  return (
    <section className="rounded-xl border border-border bg-surface-2 p-4">
      <h3 className="text-sm font-semibold text-ink-1">{title}</h3>
      <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-3">{description}</p>

      <pre
        id="claude-prompt-text"
        className="mt-3 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border/70 bg-surface-3 p-3 font-mono text-[0.6875rem] leading-relaxed text-ink-2"
      >
        {prompt}
      </pre>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={copy}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[0.8125rem] font-semibold text-primary-foreground transition-[filter] hover:brightness-110 focus-visible:outline-none focus-visible:[outline:2px_solid_hsl(var(--primary))] focus-visible:[outline-offset:2px]"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              Copy prompt
            </>
          )}
        </button>

        <a
          href="https://claude.ai/new"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3.5 text-[0.8125rem] font-semibold text-ink-2 transition-colors hover:border-ink-4/70 hover:bg-surface-3 hover:text-ink-1 focus-visible:outline-none focus-visible:[outline:2px_solid_hsl(var(--primary))] focus-visible:[outline-offset:2px]"
        >
          Open Claude
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>

        <span aria-live="polite" className="sr-only">
          {copied ? "Prompt copied to clipboard" : ""}
        </span>
      </div>

      <p className="mt-2.5 text-xs text-ink-4">
        Paste what Claude gives you back into {returnHint}.
      </p>
    </section>
  );
}

/** Produces the plain line format `parseSchedule` on the backend expects. */
export const SCHEDULE_PROMPT = `Convert my class schedule into a plain list I can paste into my planner.

Output rules:
- One item per line. No bullets, no numbering, no markdown, no commentary.
- Recurring classes and activities:  Name - Days Time-Time, Location
  Example:  AP Biology - MWF 9:00-10:15 AM, Room 204
- Things with a due date:  Name due Month Day
  Example:  Lab report due March 22
- Exams:  Name - Month Day
  Example:  Chem Midterm - March 15
- Write days as M, Tue, W, Thu, F. Always include AM or PM.
- If a detail is missing, leave it out rather than guessing it.

Output only the list — nothing before or after it.

Here is my schedule:
[paste your schedule, course list, or syllabus here — or attach a screenshot]`;
