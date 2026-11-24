"use client";

import Link from "next/link";
import { useState } from "react";
import { AreaIcon } from "@/lib/icons";
import { db, useAreas } from "@/lib/data";
import type { Area } from "@/lib/types";

// Add, reorder and remove areas. Rename, icon and color live on each area's page.
export default function AreasPage() {
  const { areas, reload } = useAreas();
  const [name, setName] = useState("");

  async function add() {
    if (!name.trim()) return;
    const sort = Math.max(0, ...areas.map((a) => a.sort)) + 1;
    await db().from("areas").insert({ name: name.trim(), sort });
    setName("");
    reload();
  }

  async function move(a: Area, dir: -1 | 1) {
    const i = areas.findIndex((x) => x.id === a.id);
    const b = areas[i + dir];
    if (!b) return;
    await Promise.all([
      db().from("areas").update({ sort: b.sort }).eq("id", a.id),
      db().from("areas").update({ sort: a.sort }).eq("id", b.id),
    ]);
    reload();
  }

  return (
    <div className="max-w-md space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Areas</h1>
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {areas.map((a, i) => (
          <li key={a.id} className="flex items-center gap-3 px-4 py-3 text-sm">
            <AreaIcon icon={a.icon} color={a.color} />
            <Link href={`/areas/${a.id}`} className="flex-1 hover:text-accent">
              {a.name}
            </Link>
            <button onClick={() => move(a, -1)} disabled={i === 0} aria-label="Move up" className="px-1 text-muted/50 hover:text-text disabled:opacity-20">
              ↑
            </button>
            <button onClick={() => move(a, 1)} disabled={i === areas.length - 1} aria-label="Move down" className="px-1 text-muted/50 hover:text-text disabled:opacity-20">
              ↓
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="New area"
          className="flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button onClick={add} className="rounded-lg bg-button px-4 py-2 text-sm font-medium text-white">
          Add
        </button>
      </div>
    </div>
  );
}
