"use client";

import { useState } from "react";
import { QuickAdd } from "@/components/quick-add";
import { ItemList } from "@/components/item-row";
import { ItemSheet } from "@/components/item-sheet";
import { db, mutate, showError, useAreas, useGoals, useItems } from "@/lib/data";
import { addDays, today } from "@/lib/dates";
import type { Item } from "@/lib/types";
import { btn, small } from "@/components/plan-ui";

export default function InboxPage() {
  const { areas } = useAreas();
  const { goals } = useGoals();
  const { items, loading } = useItems({ inbox: true });
  const [open, setOpen] = useState<Item | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [to, setTo] = useState("new");
  const [name, setName] = useState("");
  const [area, setArea] = useState("");

  const toggle = (id: string) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setSelected(s);
  };
  const stop = () => {
    setSelecting(false);
    setSelected(new Set());
    setName("");
    setTo("new");
  };

  // Chunk: related Inbox items become the action plan of one goal, and leave the Inbox for its area.
  async function chunk() {
    let goal = goals.find((g) => g.id === to);
    if (to === "new") {
      const area_id = area || areas[0]?.id;
      const { data, error } = await db()
        .from("goals")
        .insert({ area_id, goal: name.trim() || "New goal", target_date: addDays(today(), 90) })
        .select("*")
        .single();
      if (error) return showError(error.message);
      goal = data;
    }
    if (!goal) return;
    const ok = await mutate(
      db().from("items").update({ goal_id: goal.id, area_id: goal.area_id, project_id: goal.project_id }).in("id", [...selected]),
    );
    if (ok) stop();
  }

  const active = goals.filter((g) => g.status === "active");

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center">
        <h1 className="text-xl font-semibold tracking-tight">Inbox</h1>
        {items.length > 1 && (
          <button onClick={() => (selecting ? stop() : setSelecting(true))} className="ml-auto text-sm text-muted/60 hover:text-text">
            {selecting ? "Done" : "Chunk…"}
          </button>
        )}
      </div>
      {!selecting && <QuickAdd />}
      {selecting && (
        <div role="group" aria-label="Chunk selected" className="space-y-2 rounded-xl border border-accent/50 bg-accent/10 p-3 text-sm">
          <p className="text-xs text-muted/70">Pick the items that belong to one goal, then chunk them into it.</p>
          <div className="flex flex-wrap items-center gap-2">
            <b>{selected.size} selected</b>
            <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="Chunk into" className={small}>
              <option value="new">A new goal…</option>
              {active.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.goal}
                </option>
              ))}
            </select>
            {to === "new" && (
              <>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name the goal" aria-label="New goal name" className={small} />
                <select value={area || areas[0]?.id || ""} onChange={(e) => setArea(e.target.value)} aria-label="Area for new goal" className={small}>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </>
            )}
            <button onClick={chunk} disabled={!selected.size} className={btn + " py-1.5"}>
              Chunk
            </button>
          </div>
        </div>
      )}
      {!loading && (
        <ItemList items={items} areas={areas} onOpen={setOpen} empty="Inbox is clear." select={selecting ? { selected, toggle } : undefined} />
      )}
      <ItemSheet item={open} areas={areas} onClose={() => setOpen(null)} />
    </div>
  );
}
