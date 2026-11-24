"use client";

import { useEffect, useState } from "react";
import type { Area, Item, Repeat } from "@/lib/types";
import { REPEATS, WD } from "@/lib/repeat";
import { completeItem, db, mutate, useBlocks, useGoals } from "@/lib/data";
import { addDays, dayLabel, today } from "@/lib/dates";
import { PARTS } from "@/lib/blocks";

const field = "w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent";
const label = "mb-1 block text-xs text-muted/60";

// Side sheet on desktop, bottom sheet on iPhone. Saves on close.
export function ItemSheet({ item, areas, onClose }: { item: Item | null; areas: Area[]; onClose: () => void }) {
  const [d, setD] = useState<Item | null>(item);
  useEffect(() => setD(item), [item]);
  if (!d) return null;

  const set = <K extends keyof Item>(k: K, v: Item[K]) => setD({ ...d, [k]: v });

  async function save() {
    if (!d) return;
    const { id, title, notes, area_id, goal_id, project_id, due_date, repeat, repeat_days, must, block_id } = d;
    await mutate(db()
      .from("items")
      .update({ title: title.trim() || "Untitled", notes, area_id, goal_id, project_id, due_date, repeat, repeat_days: repeat === "days" ? repeat_days : null, must, block_id })
      .eq("id", id));
    onClose();
  }
  async function remove() {
    await mutate(db().from("items").delete().eq("id", d!.id));
    onClose();
  }
  async function done() {
    await save();
    await completeItem(d!.id);
  }
  async function reopen() {
    await mutate(db().from("items").update({ done_at: null }).eq("id", d!.id));
    onClose();
  }
  const toggleDay = (n: number) => {
    const cur = new Set(d.repeat_days ?? []);
    if (cur.has(n)) cur.delete(n);
    else cur.add(n);
    set("repeat_days", [...cur].sort());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/40 md:items-stretch" onClick={save}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85dvh] w-full space-y-5 overflow-y-auto rounded-t-2xl border-line bg-surface p-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] md:max-h-none md:w-96 md:rounded-none md:border-l"
      >
        <input
          autoFocus
          value={d.title}
          onChange={(e) => set("title", e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          className="w-full bg-transparent text-lg font-medium outline-none"
          aria-label="Title"
        />

        <div>
          <span className={label}>Area</span>
          <div className="flex flex-wrap gap-2">
            <Chip on={!d.area_id} onClick={() => set("area_id", null)}>
              Inbox
            </Chip>
            {areas.map((a) => (
              <Chip key={a.id} on={d.area_id === a.id} color={a.color} onClick={() => set("area_id", a.id)}>
                {a.name}
              </Chip>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className={label}>Due</span>
            <input type="date" value={d.due_date ?? ""} onChange={(e) => set("due_date", e.target.value || null)} className={field} />
          </label>
          <label>
            <span className={label}>Repeats</span>
            <select value={d.repeat} onChange={(e) => set("repeat", e.target.value as Repeat)} className={field}>
              {REPEATS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>

        {d.repeat === "days" && (
          <div className="flex gap-1">
            {WD.map((w, n) => (
              <Chip key={w} on={!!d.repeat_days?.includes(n)} onClick={() => toggleDay(n)}>
                {w}
              </Chip>
            ))}
          </div>
        )}

        <GoalPicker item={d} onChange={(goal_id, project_id, area_id) => setD({ ...d, goal_id, project_id, area_id })} />

        <BlockPicker value={d.block_id} onChange={(v) => set("block_id", v)} />

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={d.must} onChange={(e) => set("must", e.target.checked)} className="accent-[var(--accent)]" />
          Must ★
        </label>

        <label className="block">
          <span className={label}>Notes</span>
          <textarea value={d.notes ?? ""} onChange={(e) => set("notes", e.target.value || null)} rows={3} className={field} />
        </label>

        <div className="flex items-center gap-2 pt-2">
          <button onClick={save} className="rounded-lg bg-button px-4 py-2 text-sm font-medium text-white">
            Save
          </button>
          {d.done_at ? (
            <button onClick={reopen} className="rounded-lg border border-line px-4 py-2 text-sm">
              Reopen
            </button>
          ) : (
            <button onClick={done} className="rounded-lg border border-line px-4 py-2 text-sm">
              ✓ Mark complete
            </button>
          )}
          <button onClick={remove} className="ml-auto text-sm text-area-coral/80 hover:text-area-coral">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export function Chip({ on, color, onClick, children }: { on: boolean; color?: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs transition ${on ? "border-accent text-text" : "border-line text-muted/60 hover:text-text"}`}
      style={on && color ? { borderColor: `var(--area-${color})` } : undefined}
    >
      {children}
    </button>
  );
}

// Put an action into a block without dragging (the way to schedule on iPhone).
function BlockPicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const from = today();
  const { blocks } = useBlocks(from, addDays(from, 13));
  const order = (p: string) => PARTS.findIndex((x) => x.id === p);
  const sorted = [...blocks].sort((a, b) => a.date.localeCompare(b.date) || order(a.part_of_day) - order(b.part_of_day));
  return (
    <label className="block">
      <span className={label}>Scheduled in</span>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} className={field}>
        <option value="">Not scheduled (Work bench)</option>
        {sorted.map((b) => (
          <option key={b.id} value={b.id}>
            {dayLabel(b.date)} · {PARTS.find((p) => p.id === b.part_of_day)?.label} · {b.name}
          </option>
        ))}
      </select>
    </label>
  );
}

// Which goal's action plan this belongs to. Picking one also sets its area and project.
function GoalPicker({ item, onChange }: { item: Item; onChange: (goal: string | null, project: string | null, area: string | null) => void }) {
  const { goals } = useGoals();
  const list = goals.filter((g) => g.status === "active" || g.id === item.goal_id);
  return (
    <label className="block">
      <span className={label}>Goal</span>
      <select
        value={item.goal_id ?? ""}
        onChange={(e) => {
          const g = goals.find((x) => x.id === e.target.value);
          onChange(g?.id ?? null, g ? g.project_id : item.project_id, g ? g.area_id : item.area_id);
        }}
        className={field}
      >
        <option value="">No goal</option>
        {list.map((g) => (
          <option key={g.id} value={g.id}>
            {g.goal}
          </option>
        ))}
      </select>
    </label>
  );
}
