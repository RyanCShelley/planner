"use client";

import Link from "next/link";
import { useState } from "react";
import { ItemList } from "@/components/item-row";
import { ItemSheet, Chip } from "@/components/item-sheet";
import { AreaIcon } from "@/lib/icons";
import { useAreas, useItems } from "@/lib/data";
import type { Item } from "@/lib/types";

// The full list of open actions, grouped by area.
export default function BenchPage() {
  const { areas } = useAreas();
  const [showDone, setShowDone] = useState(false);
  const { items, loading } = useItems({ open: !showDone });
  const [open, setOpen] = useState<Item | null>(null);
  const [only, setOnly] = useState<string | null>(null);

  const groups = [
    ...areas.map((a) => ({ key: a.id, area: a, items: items.filter((i) => i.area_id === a.id) })),
    { key: "inbox", area: null, items: items.filter((i) => !i.area_id) },
  ].filter((g) => g.items.length && (!only || only === g.key));

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Work bench</h1>
        <Link href="/areas" className="text-sm text-muted/50 hover:text-text">
          Areas
        </Link>
      </div>
      <div className="flex flex-wrap gap-2">
        <Chip on={!only} onClick={() => setOnly(null)}>
          All
        </Chip>
        {areas.map((a) => (
          <Chip key={a.id} on={only === a.id} color={a.color} onClick={() => setOnly(a.id)}>
            {a.name}
          </Chip>
        ))}
        <Chip on={showDone} onClick={() => setShowDone(!showDone)}>
          Show completed
        </Chip>
      </div>
      {!loading && !groups.length && <p className="text-sm text-muted/50">No open actions.</p>}
      {groups.map((g) => (
        <section key={g.key} className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-medium text-muted/80">
            {g.area ? <AreaIcon icon={g.area.icon} color={g.area.color} className="size-4" /> : null}
            {g.area?.name ?? "Inbox"}
          </h2>
          <ItemList items={g.items} areas={areas} onOpen={setOpen} />
        </section>
      ))}
      <ItemSheet item={open} areas={areas} onClose={() => setOpen(null)} />
    </div>
  );
}
