"use client";

import { useState } from "react";
import { QuickAdd } from "@/components/quick-add";
import { ItemList } from "@/components/item-row";
import { ItemSheet, Chip } from "@/components/item-sheet";
import { db, mutate, showError, useAreas, useBlocks, useGoals, useItems } from "@/lib/data";
import { addDays, dayLabel, today } from "@/lib/dates";
import type { Item } from "@/lib/types";
import { btn, small } from "@/components/plan-ui";

type InboxTab = "active" | "sometimes";

export default function InboxPage() {
  const todayStr = today();
  const { areas } = useAreas();
  const { goals } = useGoals();
  const { items: allItems, loading } = useItems();
  const { blocks: todayBlocks } = useBlocks(todayStr, todayStr);

  const [tab, setTab] = useState<InboxTab>("active");
  const [showToday, setShowToday] = useState(true);
  const [groupByBatch, setGroupByBatch] = useState(false);
  const [open, setOpen] = useState<Item | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [to, setTo] = useState("new");
  const [name, setName] = useState("");
  const [area, setArea] = useState("");
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);

  // Keep items in Inbox until scheduled (block_id or due_date set), even if area_id is assigned.
  const inboxItems = allItems.filter((i) => (i.status ?? "active") === "active" && !i.block_id && !i.due_date);
  const sometimesItems = allItems.filter((i) => i.status === "sometimes" && !i.block_id && !i.due_date);
  const visibleItems = tab === "active" ? inboxItems : sometimesItems;

  const todayBlockIds = new Set(todayBlocks.map((b) => b.id));
  const todayItems = allItems.filter(
    (i) => (i.status ?? "active") === "active" && (i.due_date === todayStr || (i.block_id && todayBlockIds.has(i.block_id))),
  );

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

  async function chunk() {
    let goal = goals.find((g) => g.id === to);
    if (to === "new") {
      const area_id = area || areas[0]?.id;
      const { data, error } = await db()
        .from("goals")
        .insert({ area_id, goal: name.trim() || "New goal", target_date: addDays(todayStr, 90) })
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

  async function scheduleToday(itemId: string, blockId?: string) {
    await mutate(
      db()
        .from("items")
        .update(blockId ? { block_id: blockId, due_date: todayStr, status: "active" } : { due_date: todayStr, status: "active" })
        .eq("id", itemId),
    );
  }

  // Group by batch_tag if enabled
  const batches = Array.from(new Set(visibleItems.map((i) => i.batch_tag || "Untagged"))).sort((a, b) =>
    a === "Untagged" ? 1 : b === "Untagged" ? -1 : a.localeCompare(b),
  );

  const activeGoals = goals.filter((g) => g.status === "active");

  return (
    <div className={`grid gap-6 ${showToday ? "lg:grid-cols-[1fr_340px] xl:grid-cols-[1fr_360px]" : "max-w-2xl"}`}>
      <div className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">Inbox</h1>
          <div className="ml-2 flex rounded-lg border border-line p-0.5 text-xs">
            <button
              onClick={() => setTab("active")}
              className={`rounded-md px-3 py-1 ${tab === "active" ? "bg-surface text-text" : "text-muted/60 hover:text-text"}`}
            >
              Inbox ({inboxItems.length})
            </button>
            <button
              onClick={() => setTab("sometimes")}
              className={`rounded-md px-3 py-1 ${tab === "sometimes" ? "bg-surface text-text" : "text-muted/60 hover:text-text"}`}
            >
              Sometimes ({sometimesItems.length})
            </button>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Chip on={groupByBatch} onClick={() => setGroupByBatch(!groupByBatch)}>
              Group by batch
            </Chip>
            {visibleItems.length > 1 && (
              <button onClick={() => (selecting ? stop() : setSelecting(true))} className="text-sm text-muted/60 hover:text-text">
                {selecting ? "Done" : "Chunk…"}
              </button>
            )}
            <button
              onClick={() => setShowToday(!showToday)}
              className="hidden rounded-lg border border-line px-2.5 py-1 text-xs text-muted/70 hover:text-text md:inline-block"
            >
              {showToday ? "Hide Today" : "Show Today"}
            </button>
          </div>
        </div>

        {!selecting && tab === "active" && <QuickAdd />}

        {selecting && (
          <div role="group" aria-label="Chunk selected" className="space-y-2 rounded-xl border border-accent/50 bg-accent/10 p-3 text-sm">
            <p className="text-xs text-muted/70">Pick the items that belong to one goal, then chunk them into it.</p>
            <div className="flex flex-wrap items-center gap-2">
              <b>{selected.size} selected</b>
              <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="Chunk into" className={small}>
                <option value="new">A new goal…</option>
                {activeGoals.map((g) => (
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

        {loading && (
          <div className="animate-pulse divide-y divide-line rounded-xl border border-line bg-surface">
            {[0, 1, 2].map((n) => (
              <div key={n} className="flex items-center gap-3 px-4 py-3.5">
                <div className="size-5 rounded-full bg-bg" />
                <div className="h-3.5 flex-1 rounded bg-bg" />
              </div>
            ))}
          </div>
        )}

        {!loading && !groupByBatch && (
          <div className="space-y-2">
            <ItemList
              items={visibleItems}
              areas={areas}
              onOpen={setOpen}
              empty={tab === "active" ? "Inbox is clear." : "Nothing in Sometimes."}
              select={selecting ? { selected, toggle } : undefined}
              draggable={showToday}
            />
          </div>
        )}

        {!loading && groupByBatch && (
          <div className="space-y-5">
            {!visibleItems.length && (
              <p className="px-1 py-6 text-sm text-muted/50">{tab === "active" ? "Inbox is clear." : "Nothing in Sometimes."}</p>
            )}
            {batches.map((batch) => {
              const batchItems = visibleItems.filter((i) => (i.batch_tag || "Untagged") === batch);
              return (
                <section key={batch} className="space-y-2">
                  <h2 className="text-xs font-medium uppercase tracking-wider text-muted/60">
                    {batch} ({batchItems.length})
                  </h2>
                  <ItemList
                    items={batchItems}
                    areas={areas}
                    onOpen={setOpen}
                    select={selecting ? { selected, toggle } : undefined}
                    draggable={showToday}
                  />
                </section>
              );
            })}
          </div>
        )}
      </div>

      {/* AcciFlow-style Today split pane on desktop */}
      {showToday && (
        <aside className="hidden space-y-4 rounded-2xl border border-line bg-surface/50 p-4 md:block">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold tracking-tight">Today — {dayLabel(todayStr)}</h2>
            <span className="text-xs text-muted/50">{todayItems.length} scheduled</span>
          </div>

          {todayBlocks.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs text-muted/50">Blocks</div>
              {todayBlocks.map((b) => {
                const blockItems = todayItems.filter((i) => i.block_id === b.id);
                return (
                  <div
                    key={b.id}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverTarget(b.id);
                    }}
                    onDragLeave={() => setDragOverTarget((cur) => (cur === b.id ? null : cur))}
                    onDrop={(e) => {
                      setDragOverTarget(null);
                      const id = e.dataTransfer.getData("text/plain").replace("item:", "");
                      if (id) scheduleToday(id, b.id);
                    }}
                    className={`rounded-xl border p-2.5 text-xs transition ${
                      dragOverTarget === b.id ? "border-accent bg-accent/10" : "border-line bg-bg/60"
                    }`}
                  >
                    <div className="flex items-center justify-between font-medium">
                      <span>{b.name}</span>
                      <span className="text-muted/50">{b.part_of_day}</span>
                    </div>
                    {blockItems.length > 0 && (
                      <ul className="mt-1.5 space-y-1">
                        {blockItems.map((i) => (
                          <li key={i.id} onClick={() => setOpen(i)} className="cursor-pointer truncate text-muted/80 hover:text-text">
                            • {i.title}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverTarget("due-today");
            }}
            onDragLeave={() => setDragOverTarget((cur) => (cur === "due-today" ? null : cur))}
            onDrop={(e) => {
              setDragOverTarget(null);
              const id = e.dataTransfer.getData("text/plain").replace("item:", "");
              if (id) scheduleToday(id);
            }}
            className={`space-y-2 rounded-xl border p-2 transition ${
              dragOverTarget === "due-today" ? "border-accent bg-accent/10" : "border-transparent"
            }`}
          >
            <div className="text-xs text-muted/50">Due Today</div>
            <ItemList items={todayItems} areas={areas} onOpen={setOpen} empty="Nothing scheduled for today." />
          </div>
        </aside>
      )}

      <ItemSheet item={open} areas={areas} onClose={() => setOpen(null)} />
    </div>
  );
}
