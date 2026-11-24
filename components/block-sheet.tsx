"use client";

import { useEffect, useState } from "react";
import type { Area, Block, Part } from "@/lib/types";
import { LENGTHS, PARTS, fmtLen, partFor, toHours } from "@/lib/blocks";
import { db, mutate } from "@/lib/data";
import { Chip } from "./item-sheet";

const field = "w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent";
const label = "mb-1 block text-xs text-muted/60";

// Times offered when pinning, 6am–9:30pm in half hours.
const TIMES = Array.from({ length: 32 }, (_, i) => 6 + i / 2).map((h) => {
  const hh = String(Math.floor(h)).padStart(2, "0");
  return `${hh}:${h % 1 ? "30" : "00"}`;
});
const fmt12 = (t: string) => {
  const h = toHours(t);
  const hr = Math.floor(h) % 12 || 12;
  return `${hr}${h % 1 ? ":30" : ""}${h < 12 ? "am" : "pm"}`;
};

export function BlockSheet({ block, areas, onClose }: { block: Block | null; areas: Area[]; onClose: () => void }) {
  const [b, setB] = useState<Block | null>(block);
  useEffect(() => setB(block), [block]);
  if (!b) return null;

  const set = <K extends keyof Block>(k: K, v: Block[K]) => setB({ ...b, [k]: v });
  const pinned = b.start_time?.slice(0, 5) ?? "";

  async function save() {
    if (!b) return;
    const { id, name, date, part_of_day, length_min, start_time, area_id } = b;
    // A pinned time decides the part of the day.
    const part = start_time ? partFor(toHours(start_time)) : part_of_day;
    await mutate(db().from("blocks").update({ name: name.trim() || "Block", date, part_of_day: part, length_min, start_time, area_id }).eq("id", id));
    onClose();
  }
  async function remove() {
    // Its actions go back to the Work bench (block_id is set null by the database).
    await mutate(db().from("blocks").delete().eq("id", b!.id));
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/40 md:items-stretch" onClick={save}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85dvh] w-full space-y-5 overflow-y-auto rounded-t-2xl bg-surface p-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] md:max-h-none md:w-96 md:rounded-none md:border-l md:border-line"
      >
        <input
          autoFocus
          value={b.name}
          onChange={(e) => set("name", e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          className="w-full bg-transparent text-lg font-medium outline-none"
          aria-label="Block name"
        />

        <div>
          <span className={label}>Area</span>
          <div className="flex flex-wrap gap-2">
            <Chip on={!b.area_id} onClick={() => set("area_id", null)}>
              None
            </Chip>
            {areas.map((a) => (
              <Chip key={a.id} on={b.area_id === a.id} color={a.color} onClick={() => set("area_id", a.id)}>
                {a.name}
              </Chip>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className={label}>Day</span>
            <input type="date" value={b.date} onChange={(e) => e.target.value && set("date", e.target.value)} className={field} />
          </label>
          <label>
            <span className={label}>Length</span>
            <select value={b.length_min} onChange={(e) => set("length_min", Number(e.target.value))} className={field}>
              {LENGTHS.map((m) => (
                <option key={m} value={m}>
                  {fmtLen(m)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={label}>Part of day</span>
            <select
              value={b.part_of_day}
              disabled={!!b.start_time}
              onChange={(e) => set("part_of_day", e.target.value as Part)}
              className={field + " disabled:opacity-40"}
            >
              {PARTS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={label}>Pinned time</span>
            <select value={pinned} onChange={(e) => set("start_time", e.target.value ? e.target.value + ":00" : null)} className={field}>
              <option value="">Flexible</option>
              {TIMES.map((t) => (
                <option key={t} value={t}>
                  {fmt12(t)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {b.start_time && <p className="text-xs text-muted/50">Pinned blocks will go on your Google Calendar once that&apos;s connected (step 5).</p>}

        <div className="flex items-center gap-2 pt-2">
          <button onClick={save} className="rounded-lg bg-button px-4 py-2 text-sm font-medium text-white">
            Save
          </button>
          <button onClick={remove} className="ml-auto text-sm text-area-coral/80 hover:text-area-coral">
            Delete block
          </button>
        </div>
      </div>
    </div>
  );
}
