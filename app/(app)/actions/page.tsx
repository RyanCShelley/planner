"use client";

import { useEffect, useState } from "react";
import type { Area, Block, Item, Part } from "@/lib/types";
import { PARTS, blockTime, fmtTime, toHours } from "@/lib/blocks";
import { addDays, dayLabel, today } from "@/lib/dates";
import { changed, completeItem, db, fillScheduleBlocks, mutate, showError, useAreas, useBlocks, useItems } from "@/lib/data";
import { AreaIcon } from "@/lib/icons";
import { repeatLabel } from "@/lib/repeat";
import { ItemSheet } from "@/components/item-sheet";
import { BlockSheet } from "@/components/block-sheet";

type Mode = "parts" | "hourly";
const DAYS = 7;
const H0 = 6, H1 = 22, HH = 44; // hourly grid: 6am–10pm, px per hour

function useStored<T extends string>(key: string, initial: T) {
  const [v, setV] = useState<T>(initial);
  useEffect(() => {
    try {
      const s = localStorage.getItem(key);
      if (s) setV(s as T);
    } catch {}
  }, [key]);
  const set = (x: T) => {
    setV(x);
    try {
      localStorage.setItem(key, x);
    } catch {}
  };
  return [v, set] as const;
}

export default function ActionsPage() {
  const [start, setStart] = useState(today());
  const [mode, setMode] = useStored<Mode>("planner-mode", "parts");
  const [bench, setBench] = useStored<"on" | "off">("planner-bench", "on");
  const [mDay, setMDay] = useState(0);
  const days = Array.from({ length: DAYS }, (_, i) => addDays(start, i));

  const { areas } = useAreas();
  const { items } = useItems();
  const { blocks } = useBlocks(days[0], days[DAYS - 1]);
  // Unfinished actions in blocks from past days roll back onto the Work bench.
  const { blocks: past } = useBlocks(addDays(today(), -60), addDays(today(), -1));
  const pastIds = new Set(past.map((b) => b.id));
  const [openItem, setOpenItem] = useState<Item | null>(null);
  const [openBlock, setOpenBlock] = useState<Block | null>(null);

  // Project schedules put their blocks on the board for the next two weeks.
  useEffect(() => {
    fillScheduleBlocks(today());
  }, []);

  async function newBlock(date: string, part: Part, area_id: string | null = null) {
    const area = areas.find((a) => a.id === area_id);
    const { data, error } = await db()
      .from("blocks")
      .insert({ date, part_of_day: part, length_min: 60, name: area?.name ?? "Focus", area_id })
      .select()
      .single();
    if (error) showError(error.message);
    changed();
    return data as Block | null;
  }

  // Drag and drop: "item:<id>" or "block:<id>" onto a block, a part of a day, or the bench.
  async function drop(payload: string, target: { block?: Block; date?: string; part?: Part; bench?: boolean }) {
    const [kind, id] = payload.split(":");
    if (kind === "item") {
      const item = items.find((i) => i.id === id);
      if (!item) return;
      let block_id: string | null = null;
      if (target.block) block_id = target.block.id;
      else if (target.date && target.part) {
        const existing = blocks.find((b) => b.date === target.date && b.part_of_day === target.part);
        block_id = (existing ?? (await newBlock(target.date, target.part, item.area_id)))?.id ?? null;
        if (!block_id) return;
      }
      await mutate(db().from("items").update({ block_id }).eq("id", id));
    } else if (kind === "block") {
      const b = blocks.find((x) => x.id === id);
      const date = target.block?.date ?? target.date;
      const part = target.block?.part_of_day ?? target.part;
      if (!b || !date || !part || target.block?.id === b.id) return;
      // Moving to another part of the day unpins it.
      const patch = part === b.part_of_day ? { date } : { date, part_of_day: part, start_time: null };
      await mutate(db().from("blocks").update(patch).eq("id", id));
    }
  }

  const ctx: Ctx = { areas, items, blocks, pastIds, mode, drop, newBlock, openItem: setOpenItem, openBlock: setOpenBlock };

  return (
    <div className="-m-6 flex h-[calc(100dvh-5rem)] flex-col md:-m-10 md:h-dvh">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3 md:px-6">
        {/* On iPhone the tab bar already says Actions; the toolbar needs the room. */}
        <h1 className="mr-2 hidden text-xl font-semibold tracking-tight md:block">Actions</h1>
        <IconBtn label="Previous days" onClick={() => setStart(addDays(start, -DAYS))} d="M15 6l-6 6 6 6" />
        <button onClick={() => { setStart(today()); setMDay(0); }} className="rounded-lg px-2 py-1 text-sm text-muted/70 hover:text-text">
          Today
        </button>
        <IconBtn label="Next days" onClick={() => setStart(addDays(start, DAYS))} d="M9 6l6 6-6 6" />
        <div className="ml-auto flex rounded-lg border border-line p-0.5 text-xs">
          {(["parts", "hourly"] as Mode[]).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`whitespace-nowrap rounded-md px-3 py-1 ${mode === m ? "bg-surface text-text" : "text-muted/60"}`}>
              {m === "parts" ? "Day parts" : "Hourly"}
            </button>
          ))}
        </div>
      </div>

      {/* iPhone: one day at a time */}
      <div className="flex gap-1 overflow-x-auto border-b border-line px-3 py-2 md:hidden">
        {days.map((d, i) => (
          <button key={d} onClick={() => setMDay(i)} className={`shrink-0 rounded-lg px-3 py-1 text-xs ${mDay === i ? "bg-surface text-accent" : "text-muted/60"}`}>
            {dayLabel(d)}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto md:hidden">
        <DayColumn date={days[mDay]} ctx={ctx} mobile />
      </div>

      {/* Mac: Work bench + scrolling day columns */}
      <div className="hidden flex-1 overflow-hidden md:flex">
        {bench === "on" ? (
          <BenchColumn ctx={ctx} onHide={() => setBench("off")} />
        ) : (
          <div className="shrink-0 border-r border-line px-1 py-3">
            <IconBtn label="Show Work bench" onClick={() => setBench("on")} d="M4 5h16v14H4zM10 5v14M14 10l2 2-2 2" />
          </div>
        )}
        <div className="flex flex-1 overflow-x-auto">
          {days.map((d) => (
            <DayColumn key={d} date={d} ctx={ctx} />
          ))}
        </div>
      </div>

      <ItemSheet item={openItem} areas={areas} onClose={() => setOpenItem(null)} />
      <BlockSheet block={openBlock} areas={areas} onClose={() => setOpenBlock(null)} />
    </div>
  );
}

type Ctx = {
  areas: Area[];
  items: Item[];
  blocks: Block[];
  pastIds: Set<string>;
  mode: Mode;
  drop: (payload: string, target: { block?: Block; date?: string; part?: Part; bench?: boolean }) => void;
  newBlock: (date: string, part: Part) => Promise<Block | null>;
  openItem: (i: Item) => void;
  openBlock: (b: Block) => void;
};

function IconBtn({ label, onClick, d, active }: { label: string; onClick: () => void; d: string; active?: boolean }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className={`rounded-lg p-1.5 transition hover:text-text ${active ? "text-text" : "text-muted/50"}`}>
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <path d={d} />
      </svg>
    </button>
  );
}

// A drop target that highlights while something is dragged over it.
function Drop({ onDrop, className, label, role = "region", style, children }: { onDrop: (payload: string) => void; className?: string; label?: string; role?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  const [over, setOver] = useState(false);
  return (
    <div
      role={label ? role : undefined}
      aria-label={label}
      style={style}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        const p = e.dataTransfer.getData("text/plain");
        if (p) onDrop(p);
      }}
      className={`${className ?? ""} ${over ? "outline outline-1 outline-accent" : ""}`}
    >
      {children}
    </div>
  );
}

const drag = (payload: string) => (e: React.DragEvent) => {
  e.stopPropagation();
  e.dataTransfer.setData("text/plain", payload);
  e.dataTransfer.effectAllowed = "move";
};

function MiniItem({ item, ctx }: { item: Item; ctx: Ctx }) {
  const area = ctx.areas.find((a) => a.id === item.area_id);
  const rep = repeatLabel(item);
  return (
    <div draggable onDragStart={drag(`item:${item.id}`)} className="group flex cursor-grab items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-bg/60">
      <button
        onClick={() => completeItem(item.id).catch(() => {})}
        aria-label={`Mark ${item.title} complete`}
        className="size-4 shrink-0 rounded-full border border-line hover:border-accent"
      />
      <button onClick={() => ctx.openItem(item)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <span className="size-1.5 shrink-0 rounded-full" style={{ background: area ? `var(--area-${area.color})` : "var(--line)" }} />
        <span className="truncate">{item.title}</span>
        {item.must && <span className="text-area-amber">★</span>}
        {rep && <span className="ml-auto shrink-0 text-[11px] text-muted/40">↻</span>}
      </button>
    </div>
  );
}

function BlockCard({ block, ctx, style, compact }: { block: Block; ctx: Ctx; style?: React.CSSProperties; compact?: boolean }) {
  const area = ctx.areas.find((a) => a.id === block.area_id);
  const its = ctx.items.filter((i) => i.block_id === block.id);
  const color = area ? `var(--area-${area.color})` : "var(--line)";
  return (
    // In Hourly, `style` places the block on the grid; the card fills it.
    <Drop onDrop={(p) => ctx.drop(p, { block })} label={`Block ${block.name}`} role="group" style={style} className={`rounded-lg ${style ? "absolute inset-x-1" : ""}`}>
      <div
        draggable
        onDragStart={drag(`block:${block.id}`)}
        style={{ borderLeftColor: color }}
        className={`${style ? "h-full overflow-hidden" : ""} rounded-lg border border-l-4 border-line bg-surface`}
      >
        <button onClick={() => ctx.openBlock(block)} className="flex w-full items-center gap-2 px-3 pt-2 text-left">
          {area && <AreaIcon icon={area.icon} color={area.color} className="size-3.5 shrink-0" />}
          <span className="truncate text-sm font-medium">{block.name}</span>
          <span className="ml-auto shrink-0 text-[11px] text-muted/50">{blockTime(block)}</span>
        </button>
        <div className="p-1">
          {compact ? (
            <p className="px-2 pb-1 text-[11px] text-muted/50">{its.length} action{its.length === 1 ? "" : "s"}</p>
          ) : its.length ? (
            its.map((i) => <MiniItem key={i.id} item={i} ctx={ctx} />)
          ) : (
            <p className="px-2 py-1.5 text-xs text-muted/40">Drop actions here</p>
          )}
        </div>
      </div>
    </Drop>
  );
}

function DayColumn({ date, ctx, mobile }: { date: string; ctx: Ctx; mobile?: boolean }) {
  const bs = ctx.blocks.filter((b) => b.date === date);
  const isToday = date === today();
  return (
    <section aria-label={dayLabel(date)} className={`${mobile ? "w-full" : "w-72 shrink-0 border-r border-line"} flex flex-col overflow-y-auto`}>
      {!mobile && (
        <header className={`sticky top-0 z-10 bg-bg px-4 py-3 text-sm font-medium ${isToday ? "text-accent" : ""}`}>{dayLabel(date)}</header>
      )}
      {ctx.mode === "parts" ? (
        <div className="space-y-4 px-3 pb-6 pt-2">
          {PARTS.map((p) => {
            const here = bs
              .filter((b) => b.part_of_day === p.id)
              .sort((a, b) => (a.start_time ?? "99").localeCompare(b.start_time ?? "99"));
            return (
              <Drop key={p.id} onDrop={(pl) => ctx.drop(pl, { date, part: p.id })} className="space-y-2 rounded-lg p-1">
                <div className="flex items-center justify-between px-1 text-xs text-muted/50">
                  <span>{p.label}</span>
                  <button
                    onClick={async () => {
                      const b = await ctx.newBlock(date, p.id);
                      if (b) ctx.openBlock(b);
                    }}
                    aria-label={`Add a block ${p.label.toLowerCase()}`}
                    className="rounded px-1 hover:text-text"
                  >
                    +
                  </button>
                </div>
                {here.length ? here.map((b) => <BlockCard key={b.id} block={b} ctx={ctx} />) : <p className="px-1 py-3 text-xs text-muted/30">Open</p>}
              </Drop>
            );
          })}
        </div>
      ) : (
        <Hourly date={date} blocks={bs} ctx={ctx} />
      )}
    </section>
  );
}

function Hourly({ date, blocks, ctx }: { date: string; blocks: Block[]; ctx: Ctx }) {
  const loose = blocks.filter((b) => !b.start_time);
  const pinned = blocks.filter((b) => b.start_time);
  return (
    <div className="px-3 pb-6 pt-2">
      <div className="mb-3 flex flex-wrap gap-1">
        {loose.map((b) => (
          <button key={b.id} onClick={() => ctx.openBlock(b)} className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted/70">
            {b.name} · {b.part_of_day}
          </button>
        ))}
      </div>
      <div className="relative" style={{ height: (H1 - H0) * HH }}>
        {Array.from({ length: H1 - H0 }, (_, i) => (
          <div key={i} className="absolute inset-x-0 border-t border-line/60" style={{ top: i * HH }}>
            <span className="-mt-2 block w-10 bg-bg text-[10px] text-muted/40">{fmtTime(H0 + i)}</span>
          </div>
        ))}
        <div className="absolute inset-y-0 left-10 right-0">
          {pinned.map((b) => {
            const s = toHours(b.start_time!);
            return (
              <BlockCard
                key={b.id}
                block={b}
                ctx={ctx}
                compact={b.length_min < 60}
                style={{ top: (s - H0) * HH + 1, height: Math.max((b.length_min / 60) * HH - 2, 22) }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function BenchColumn({ ctx, onHide }: { ctx: Ctx; onHide: () => void }) {
  const open = ctx.items.filter((i) => !i.block_id || ctx.pastIds.has(i.block_id));
  const groups = [...ctx.areas.map((a) => ({ key: a.id, area: a as Area | null })), { key: "inbox", area: null }]
    .map((g) => ({ ...g, items: open.filter((i) => (i.area_id ?? "inbox") === g.key) }))
    .filter((g) => g.items.length);
  return (
    <Drop onDrop={(p) => ctx.drop(p, { bench: true })} label="Work bench" className="w-72 shrink-0 overflow-y-auto border-r border-line bg-surface/40">
      <header className="sticky top-0 z-10 flex items-start bg-bg/95 px-4 py-3">
        <div className="flex-1">
          <div className="text-sm font-medium">Work bench</div>
          <div className="text-xs text-muted/50">{open.length} unscheduled · drag onto a day</div>
        </div>
        <IconBtn label="Hide Work bench" onClick={onHide} d="M4 5h16v14H4zM10 5v14M16 10l-2 2 2 2" />
      </header>
      <div className="space-y-4 px-2 pb-6">
        {groups.map((g) => (
          <div key={g.key}>
            <div className="flex items-center gap-2 px-2 pb-1 text-xs text-muted/60">
              {g.area && <AreaIcon icon={g.area.icon} color={g.area.color} className="size-3.5" />}
              {g.area?.name ?? "Inbox"}
            </div>
            {g.items.map((i) => (
              <MiniItem key={i.id} item={i} ctx={ctx} />
            ))}
          </div>
        ))}
      </div>
    </Drop>
  );
}
