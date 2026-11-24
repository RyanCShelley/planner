"use client";

import { useState } from "react";
import { QuickAdd } from "@/components/quick-add";
import { ItemList } from "@/components/item-row";
import { ItemSheet } from "@/components/item-sheet";
import { useAreas, useItems } from "@/lib/data";
import type { Item } from "@/lib/types";

export default function InboxPage() {
  const { areas } = useAreas();
  const { items, loading } = useItems({ inbox: true });
  const [open, setOpen] = useState<Item | null>(null);

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Inbox</h1>
      <QuickAdd />
      {!loading && <ItemList items={items} areas={areas} onOpen={setOpen} empty="Inbox is clear." />}
      <ItemSheet item={open} areas={areas} onClose={() => setOpen(null)} />
    </div>
  );
}
