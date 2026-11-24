"use client";

import { useState } from "react";
import { parseMany } from "@/lib/parse";
import { repeatLabel } from "@/lib/repeat";
import { dayLabel } from "@/lib/dates";
import { db, mutate } from "@/lib/data";

// Type or dictate (iPhone keyboard mic). Several things at once are split into separate items.
export function QuickAdd({ areaId = null }: { areaId?: string | null }) {
  const [text, setText] = useState("");
  const drafts = parseMany(text);

  async function add() {
    if (!drafts.length) return;
    const ok = await mutate(db()
      .from("items")
      .insert(drafts.map((d) => ({ ...d, area_id: areaId }))));
    if (ok) setText("");
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              add();
            }
          }}
          rows={1}
          placeholder="Add something… e.g. feed the chickens every day, call Mom tomorrow"
          className="min-h-11 flex-1 resize-none rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none placeholder:text-muted/40 focus:border-accent"
        />
        <button
          onClick={add}
          disabled={!drafts.length}
          aria-label="Add"
          className="grid size-11 shrink-0 place-items-center rounded-xl bg-button text-white disabled:opacity-30"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
      {drafts.length > 1 || (drafts[0] && (drafts[0].repeat !== "never" || drafts[0].due_date)) ? (
        <ul className="space-y-1 px-1 text-xs text-muted/60">
          {drafts.map((d, i) => (
            <li key={i}>
              {d.title}
              {d.repeat !== "never" && <span className="ml-2">↻ {repeatLabel(d)}</span>}
              {d.due_date && <span className="ml-2">{dayLabel(d.due_date)}</span>}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
