"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { completeItem, db, mutate, useAreas, useBlocks, useGoals, useItems, useProjects } from "@/lib/data";
import { addDays, dayLabel, today } from "@/lib/dates";
import { PARTS } from "@/lib/blocks";
import { REPEATS } from "@/lib/repeat";
import type { Block, Goal, Item, Repeat } from "@/lib/types";
import { ItemSheet } from "@/components/item-sheet";
import { EditText, daysLeft, field, ghost, small } from "@/components/plan-ui";

export default function GoalPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = useSearchParams().get("new") === "1";
  const router = useRouter();
  const { areas } = useAreas();
  const { projects } = useProjects();
  const { goals, loading } = useGoals();
  const { items } = useItems({ goalId: id, open: false });
  const { blocks } = useBlocks(addDays(today(), -60), addDays(today(), 60));
  const [text, setText] = useState("");
  const [open, setOpen] = useState<Item | null>(null);
  const [deleting, setDeleting] = useState(false);
  const g = goals.find((x) => x.id === id);

  if (!g) return loading ? null : <p className="text-sm text-muted/60">That goal is gone. <Link href="/projects" className="underline">Projects</Link></p>;

  const update = (patch: Partial<Goal>) => mutate(db().from("goals").update(patch).eq("id", id));
  // Moving a goal to another area takes its actions along.
  async function setArea(area_id: string) {
    await update({ area_id, project_id: null });
    await mutate(db().from("items").update({ area_id, project_id: null }).eq("goal_id", id));
  }
  async function setProject(project_id: string | null) {
    await update({ project_id });
    await mutate(db().from("items").update({ project_id }).eq("goal_id", id));
  }
  async function addAction(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const ok = await mutate(db().from("items").insert({ title: text.trim(), goal_id: id, area_id: g!.area_id, project_id: g!.project_id }));
    if (ok) setText("");
  }
  async function remove() {
    if (await mutate(db().from("goals").delete().eq("id", id))) router.push(project ? `/projects/${project.id}` : "/projects");
  }

  const project = projects.find((p) => p.id === g.project_id);
  const acts = [...items].sort((a, b) => Number(!!a.done_at) - Number(!!b.done_at) || (a.priority ?? 99) - (b.priority ?? 99));
  const openActs = acts.filter((i) => !i.done_at);
  const left = daysLeft(g.target_date);

  return (
    <div className="max-w-4xl space-y-8">
      <Link href={project ? `/projects/${project.id}` : "/projects"} className="text-sm text-muted/60 hover:text-text">
        ← {project ? project.title : "Projects"}
      </Link>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted/70">
          <select value={g.area_id} onChange={(e) => setArea(e.target.value)} aria-label="Area" className={small}>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select value={g.project_id ?? ""} onChange={(e) => setProject(e.target.value || null)} aria-label="Project" className={small}>
            <option value="">No project</option>
            {projects
              .filter((p) => p.area_id === g.area_id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  Project: {p.title}
                </option>
              ))}
          </select>
          <label className="flex items-center gap-1">
            Target
            <input type="date" value={g.target_date ?? ""} onChange={(e) => update({ target_date: e.target.value || null })} className={small} />
          </label>
          {left != null && <span>{left >= 0 ? `${left} days left` : `${-left} days past`}</span>}
          <select value={g.status} onChange={(e) => update({ status: e.target.value as Goal["status"] })} aria-label="Status" className={small}>
            <option value="active">Active</option>
            <option value="done">Done</option>
            <option value="dropped">Dropped</option>
          </select>
        </div>
        <span className="block text-xs text-muted/60">Goal: what do I want?</span>
        <EditText
          value={g.goal}
          onSave={(v) => update({ goal: v.trim() || "Untitled goal" })}
          label="Goal"
          wrap
          autoSelect={isNew}
          className="w-full bg-transparent text-xl font-semibold leading-snug tracking-tight outline-none sm:text-2xl"
        />
        <label className="block">
          <span className="mb-1 block text-xs text-muted/60">Purpose: why do I want it?</span>
          <EditText value={g.purpose ?? ""} onSave={(v) => update({ purpose: v || null })} label="Purpose" multiline className={field} />
        </label>
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-semibold tracking-tight">Action plan</h2>
        <p className="text-xs text-muted/50">A menu of options, not a checklist. Star the musts. You often won&apos;t need every action to reach the goal.</p>
        <div className="hidden grid-cols-[1.25rem_1fr_10rem_9rem_4rem_2.5rem_10rem] gap-2 px-3 text-[11px] text-muted/50 md:grid">
          <span />
          <span>Action</span>
          <span>Leverage</span>
          <span>Repeats</span>
          <span>Priority</span>
          <span>Must</span>
          <span>Scheduled</span>
        </div>
        <ul className="space-y-2">
          {acts.map((i) => (
            <ActionRow key={i.id} item={i} blocks={blocks} onSchedule={() => setOpen(i)} />
          ))}
        </ul>
        <form onSubmit={addAction} className="flex gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add an action option…" aria-label="New action" className={field + " min-w-0 flex-1"} />
          <button className={ghost}>Add</button>
        </form>
        <div className="flex gap-4 text-sm text-muted/70">
          <span>
            <b className="text-text">{openActs.length}</b> open actions
          </span>
          <span>
            <b className="text-text">{openActs.filter((i) => i.must).length}</b> musts
          </span>
          <span>
            <b className="text-text">{openActs.filter((i) => i.block_id).length}</b> scheduled
          </span>
        </div>
      </section>

      <div className="border-t border-line pt-6 text-sm">
        {!deleting ? (
          <button onClick={() => setDeleting(true)} className="text-muted/50 hover:text-area-coral">
            Delete goal…
          </button>
        ) : (
          <div className="space-y-3">
            <p>The goal goes. Its actions stay in the area.</p>
            <div className="flex gap-2">
              <button onClick={remove} className="rounded-lg bg-area-coral px-4 py-2 font-medium text-white">
                Delete goal
              </button>
              <button onClick={() => setDeleting(false)} className={ghost}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <ItemSheet item={open} areas={areas} onClose={() => setOpen(null)} />
    </div>
  );
}

function blockLabel(b: Block | undefined) {
  if (!b) return "Scheduled";
  return `${dayLabel(b.date)} · ${PARTS.find((p) => p.id === b.part_of_day)?.label}`;
}

function ActionRow({ item: i, blocks, onSchedule }: { item: Item; blocks: Block[]; onSchedule: () => void }) {
  const save = (patch: Partial<Item>) => mutate(db().from("items").update(patch).eq("id", i.id));
  const done = !!i.done_at;
  return (
    <li
      aria-label={i.title}
      className={`grid grid-cols-[1.25rem_1fr_auto] items-center gap-2 rounded-xl border border-line bg-surface p-3 md:grid-cols-[1.25rem_1fr_10rem_9rem_4rem_2.5rem_10rem] ${done ? "opacity-50" : ""}`}
    >
      <button
        onClick={() => (done ? save({ done_at: null }) : completeItem(i.id).catch(() => {}))}
        aria-label={done ? `Reopen ${i.title}` : `Mark ${i.title} complete`}
        className={`grid size-5 place-items-center rounded-full border text-[10px] ${done ? "border-accent text-accent" : "border-line hover:border-accent"}`}
      >
        {done ? "✓" : null}
      </button>
      <EditText value={i.title} onSave={(v) => v.trim() && save({ title: v.trim() })} label="Action" className={`min-w-0 bg-transparent text-sm outline-none ${done ? "line-through" : ""}`} />
      <label className="flex items-center justify-end md:order-6 md:justify-center" title="Must do">
        <input type="checkbox" checked={i.must} onChange={(e) => save({ must: e.target.checked })} aria-label="Must" className="peer sr-only" />
        <span className="cursor-pointer text-lg text-muted/30 peer-checked:text-area-amber">★</span>
      </label>
      {/* Second line on iPhone, columns on Mac. */}
      <div className="col-span-3 grid grid-cols-[1fr_1fr] gap-2 md:contents">
        <EditText value={i.leverage ?? ""} onSave={(v) => save({ leverage: v.trim() || null })} label="Leverage" placeholder="Who can help?" className={small + " min-w-0 md:order-3"} />
        <select value={i.repeat} onChange={(e) => save({ repeat: e.target.value as Repeat })} aria-label="Repeats" className={small + " min-w-0 md:order-4"}>
          {REPEATS.filter(([v]) => v !== "days").map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
          {i.repeat === "days" && <option value="days">Specific days</option>}
        </select>
        <EditText
          value={i.priority?.toString() ?? ""}
          onSave={(v) => save({ priority: v.trim() ? Math.max(1, Math.min(99, Number(v) || 1)) : null })}
          label="Priority"
          placeholder="#"
          className={small + " min-w-0 md:order-5"}
        />
        <button onClick={onSchedule} className={`truncate rounded-lg px-2 py-1.5 text-left text-xs md:order-7 ${i.block_id ? "text-text" : "text-accent"}`}>
          {i.block_id ? blockLabel(blocks.find((b) => b.id === i.block_id)) : "Schedule →"}
        </button>
      </div>
    </li>
  );
}
