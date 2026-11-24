"use client";

import { useState } from "react";
import type { Area, Item } from "@/lib/types";
import { repeatLabel } from "@/lib/repeat";
import { dayLabel, today } from "@/lib/dates";
import { completeItem, db, mutate } from "@/lib/data";

export function ItemRow({ item, areas, onOpen }: { item: Item; areas: Area[]; onOpen: (i: Item) => void }) {
  const [busy, setBusy] = useState(false);
  const area = areas.find((a) => a.id === item.area_id);
  const rep = repeatLabel(item);
  const overdue = item.due_date && item.due_date < today();

  async function done() {
    setBusy(true);
    try {
      if (item.done_at) await mutate(db().from("items").update({ done_at: null }).eq("id", item.id));
      else await completeItem(item.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={`group flex items-center gap-3 px-4 py-3 transition ${busy ? "opacity-40" : ""}`}>
      <button
        onClick={done}
        disabled={busy}
        aria-label={item.done_at ? `Reopen ${item.title}` : `Mark ${item.title} complete`}
        className={`grid size-5 shrink-0 place-items-center rounded-full border transition hover:border-accent ${
          item.done_at ? "border-accent bg-accent/20 text-[10px] text-accent" : "border-line"
        }`}
      >
        {item.done_at ? "✓" : null}
      </button>
      <button onClick={() => onOpen(item)} className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm">
        <span className="size-2 shrink-0 rounded-full" style={{ background: area ? `var(--area-${area.color})` : "var(--line)" }} />
        <span className={`truncate ${item.done_at ? "text-muted/40 line-through" : ""}`}>{item.title}</span>
        {item.must && <span className="text-area-amber">★</span>}
        <span className="ml-auto flex shrink-0 gap-2 text-xs text-muted/50">
          {rep && <span>↻ {rep}</span>}
          {item.due_date && <span className={overdue ? "text-area-coral" : ""}>{dayLabel(item.due_date)}</span>}
        </span>
      </button>
    </li>
  );
}

export function ItemList({ items, areas, onOpen, empty }: { items: Item[]; areas: Area[]; onOpen: (i: Item) => void; empty?: string }) {
  if (!items.length) return <p className="px-1 py-6 text-sm text-muted/50">{empty ?? "Nothing here."}</p>;
  return (
    <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
      {items.map((i) => (
        <ItemRow key={i.id} item={i} areas={areas} onOpen={onOpen} />
      ))}
    </ul>
  );
}
