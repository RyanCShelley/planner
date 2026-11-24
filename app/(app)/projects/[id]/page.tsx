"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { db, fillScheduleBlocks, mutate, showError, useAreas, useBlocks, useCaptures, useGoals, useItems, useProjects, useRules } from "@/lib/data";
import { addDays, today } from "@/lib/dates";
import { LENGTHS, PARTS, fmtLen, fmtTime, partFor, toHours } from "@/lib/blocks";
import { WD } from "@/lib/repeat";
import type { Capture, Part, Project, ScheduleRule } from "@/lib/types";
import { EditText, GoalCard, Section, btn, daysLeft, field, ghost, small } from "@/components/plan-ui";

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = useSearchParams().get("new") === "1";
  const router = useRouter();
  const { areas } = useAreas();
  const { projects, loading } = useProjects();
  const { goals } = useGoals();
  const { items } = useItems({ open: false });
  const { blocks } = useBlocks(today(), addDays(today(), 6));
  const p = projects.find((x) => x.id === id);
  const [deleting, setDeleting] = useState(false);

  if (!p) return loading ? null : <p className="text-sm text-muted/60">That project is gone. <Link href="/projects" className="underline">All projects</Link></p>;

  const update = (patch: Partial<Project>) => mutate(db().from("projects").update(patch).eq("id", id));
  const gs = goals.filter((g) => g.project_id === id);
  const acts = items.filter((i) => gs.some((g) => g.id === i.goal_id));
  const mins = blocks.filter((b) => b.project_id === id).reduce((s, b) => s + b.length_min, 0);
  const left = daysLeft(p.finish_date);

  async function addGoal() {
    const { data, error } = await db()
      .from("goals")
      .insert({ area_id: p!.area_id, project_id: id, goal: "New goal", target_date: p!.finish_date })
      .select("id")
      .single();
    if (error) return showError(error.message);
    router.push(`/goals/${data.id}?new=1`);
  }
  async function remove() {
    if (await mutate(db().from("projects").delete().eq("id", id))) router.push("/projects");
  }

  return (
    <div className="max-w-3xl space-y-8">
      <Link href="/projects" className="text-sm text-muted/60 hover:text-text">
        ← All projects
      </Link>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted/70">
          <select value={p.area_id} onChange={(e) => update({ area_id: e.target.value })} aria-label="Area" className={small}>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1">
            Start
            <input type="date" value={p.start_date ?? ""} onChange={(e) => update({ start_date: e.target.value || null })} className={small} />
          </label>
          <label className="flex items-center gap-1">
            Finish
            <input type="date" value={p.finish_date ?? ""} onChange={(e) => update({ finish_date: e.target.value || null })} className={small} />
          </label>
          {left != null && <span>{left >= 0 ? `${left} days left` : `${-left} days past`}</span>}
          <select value={p.status} onChange={(e) => update({ status: e.target.value as Project["status"] })} aria-label="Status" className={small}>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="done">Done</option>
          </select>
        </div>
        <EditText
          value={p.title}
          onSave={(v) => update({ title: v.trim() || "Untitled project" })}
          label="Project title"
          autoSelect={isNew}
          className="w-full bg-transparent text-2xl font-semibold tracking-tight outline-none"
        />
        <label className="block">
          <span className="mb-1 block text-xs text-muted/60">Purpose: why this project matters</span>
          <EditText value={p.purpose ?? ""} onSave={(v) => update({ purpose: v || null })} label="Purpose" multiline className={field} />
        </label>
        <div className="grid grid-cols-3 gap-3 text-center">
          <Stat n={gs.length} label="goals" />
          <Stat n={`${acts.filter((i) => i.done_at).length} / ${acts.length}`} label="actions done" />
          <Stat n={fmtLen(mins || 0)} label="blocked, next 7 days" />
        </div>
      </div>

      <Captures projectId={id} project={p} goals={gs} />

      <Section n={2} title="Goals" hint="Each goal has a purpose and a flexible action plan.">
        <div className="grid gap-3 sm:grid-cols-2">
          {gs.map((g) => (
            <GoalCard key={g.id} goal={g} area={areas.find((a) => a.id === g.area_id)} items={items} />
          ))}
          <button onClick={addGoal} className="flex min-h-28 items-center justify-center rounded-xl border border-dashed border-line text-sm text-muted/60 hover:border-accent hover:text-text">
            + Add goal
          </button>
        </div>
      </Section>

      <Schedule project={p} />

      <div className="border-t border-line pt-6 text-sm">
        {!deleting ? (
          <button onClick={() => setDeleting(true)} className="text-muted/50 hover:text-area-coral">
            Delete project…
          </button>
        ) : (
          <div className="space-y-3">
            <p>Its schedule and its blocks go. Its goals and actions stay, without a project.</p>
            <div className="flex gap-2">
              <button onClick={remove} className="rounded-lg bg-area-coral px-4 py-2 font-medium text-white">
                Delete project
              </button>
              <button onClick={() => setDeleting(false)} className={ghost}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ n, label }: { n: number | string; label: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-2 py-3">
      <b className="block text-lg font-semibold">{n}</b>
      <span className="text-xs text-muted/60">{label}</span>
    </div>
  );
}

/** 1. Capture & chunk: empty your head, then group related captures into a goal. */
function Captures({ projectId, project, goals }: { projectId: string; project: Project; goals: { id: string; goal: string }[] }) {
  const { captures } = useCaptures(projectId);
  const [text, setText] = useState("");
  const [kind, setKind] = useState<Capture["kind"]>("idea");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [to, setTo] = useState("new");
  const [name, setName] = useState("");

  async function capture(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    if (await mutate(db().from("captures").insert({ project_id: projectId, kind, text: text.trim() }))) setText("");
  }
  const toggle = (cid: string) => {
    const s = new Set(sel);
    if (s.has(cid)) s.delete(cid);
    else s.add(cid);
    setSel(s);
  };
  const chosen = captures.filter((c) => sel.has(c.id));

  // Selected captures become actions: under a goal (chunk) or loose in the area (to-dos).
  async function convert(goal_id: string | null) {
    const rows = chosen.map((c) => ({ title: c.text, area_id: project.area_id, project_id: projectId, goal_id }));
    if (!(await mutate(db().from("items").insert(rows)))) return;
    await mutate(db().from("captures").delete().in("id", chosen.map((c) => c.id)));
    setSel(new Set());
    setName("");
    setTo("new");
  }
  async function chunk() {
    let gid = to;
    if (to === "new") {
      const { data, error } = await db()
        .from("goals")
        .insert({ area_id: project.area_id, project_id: projectId, goal: name.trim() || "New goal", target_date: project.finish_date })
        .select("id")
        .single();
      if (error) return showError(error.message);
      gid = data.id;
    }
    await convert(gid);
  }

  return (
    <Section n={1} title="Capture & chunk" hint="Empty your head. Then pick the ones that belong to one goal and chunk them together.">
      <form onSubmit={capture} className="flex flex-wrap gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Idea, want, need, or someone to contact…" aria-label="Capture" className={field + " min-w-0 flex-1"} />
        <select value={kind} onChange={(e) => setKind(e.target.value as Capture["kind"])} aria-label="Kind" className={small}>
          <option value="idea">Idea / want / need</option>
          <option value="communication">Communication</option>
        </select>
        <button className={ghost}>Capture</button>
      </form>
      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            ["idea", "Ideas, wants, needs"],
            ["communication", "Communications"],
          ] as const
        ).map(([k, l]) => {
          const list = captures.filter((c) => c.kind === k);
          return (
            <div key={k} className="rounded-xl border border-line bg-surface p-3">
              <span className="text-xs text-muted/60">{l}</span>
              <ul className="mt-2 space-y-1">
                {list.map((c) => (
                  <li key={c.id}>
                    <label className="flex items-start gap-2 text-sm">
                      <input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} className="mt-0.5 accent-[var(--accent)]" />
                      <span>{c.text}</span>
                    </label>
                  </li>
                ))}
                {!list.length && <li className="text-xs text-muted/40">Nothing captured.</li>}
              </ul>
            </div>
          );
        })}
      </div>
      {sel.size > 0 && (
        <div role="group" aria-label="Chunk selected" className="flex flex-wrap items-center gap-2 rounded-xl border border-accent/50 bg-accent/10 p-3 text-sm">
          <b>{sel.size} selected</b>
          <span>Chunk into</span>
          <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="Chunk into" className={small}>
            <option value="new">A new goal…</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.goal}
              </option>
            ))}
          </select>
          {to === "new" && <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name the goal" aria-label="New goal name" className={small} />}
          <button onClick={chunk} className={btn + " py-1.5"}>
            Chunk
          </button>
          <button onClick={() => convert(null)} className={ghost + " py-1.5"}>
            Make them to-dos
          </button>
          <button onClick={() => setSel(new Set())} className="text-muted/60 hover:text-text">
            Clear
          </button>
        </div>
      )}
    </Section>
  );
}

// Times offered when pinning, 6am–9:30pm in half hours.
const TIMES = Array.from({ length: 32 }, (_, i) => 6 + i / 2);
const toTime = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${h % 1 ? "30" : "00"}:00`;

function ruleText(r: ScheduleRule) {
  const days = WD.filter((_, k) => r.days.includes(k)).join(", ");
  if (r.pinned_time) {
    const s = toHours(r.pinned_time);
    return `${days} · ${fmtTime(s)}–${fmtTime(s + r.length_min / 60)}`;
  }
  return `${days} · ${PARTS.find((x) => x.id === r.part_of_day)?.label} · ~${fmtLen(r.length_min)} · flexible`;
}

/** 3. Recurring time for this project; each rule puts blocks on the Actions board. */
function Schedule({ project }: { project: Project }) {
  const { rules } = useRules(project.id);
  const [days, setDays] = useState<number[]>([]);
  const [part, setPart] = useState<Part>("morning");
  const [len, setLen] = useState(60);
  const [pin, setPin] = useState("");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!days.length) return showError("Pick at least one day.");
    const pinned_time = pin ? toTime(Number(pin)) : null;
    const ok = await mutate(
      db()
        .from("schedule_rules")
        .insert({ project_id: project.id, name: project.title, days, part_of_day: pin ? partFor(Number(pin)) : part, length_min: len, pinned_time }),
    );
    if (!ok) return;
    setDays([]);
    setPin("");
    await fillScheduleBlocks(today());
  }

  return (
    <Section n={3} title="Schedule" hint="Recurring time for this project. Each one puts blocks on your Actions board for the next two weeks. Removing it removes its blocks.">
      <ul className="space-y-2">
        {rules.map((r) => (
          <li key={r.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
            <span className="flex-1">↻ {ruleText(r)}</span>
            <button onClick={() => mutate(db().from("schedule_rules").delete().eq("id", r.id))} className="text-xs text-muted/50 hover:text-area-coral">
              Remove
            </button>
          </li>
        ))}
        {!rules.length && <li className="text-sm text-muted/50">No schedule yet. Add one so this project gets time every week.</li>}
      </ul>
      <form onSubmit={add} className="space-y-3 rounded-xl border border-line p-3">
        <div role="group" aria-label="Days" className="flex flex-wrap gap-1">
          {WD.map((w, k) => (
            <label key={w} className={`cursor-pointer rounded-full border px-3 py-1 text-xs ${days.includes(k) ? "border-accent text-text" : "border-line text-muted/60"}`}>
              <input
                type="checkbox"
                className="sr-only"
                checked={days.includes(k)}
                onChange={() => setDays(days.includes(k) ? days.filter((d) => d !== k) : [...days, k].sort())}
              />
              {w}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={part} onChange={(e) => setPart(e.target.value as Part)} disabled={!!pin} aria-label="Part of day" className={small + " disabled:opacity-40"}>
            {PARTS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
          <select value={len} onChange={(e) => setLen(Number(e.target.value))} aria-label="Length" className={small}>
            {LENGTHS.map((m) => (
              <option key={m} value={m}>
                {fmtLen(m)}
              </option>
            ))}
          </select>
          <select value={pin} onChange={(e) => setPin(e.target.value)} aria-label="Timing" className={small}>
            <option value="">Flexible</option>
            {TIMES.map((t) => (
              <option key={t} value={t}>
                Pin at {fmtTime(t)}
              </option>
            ))}
          </select>
          <button className={btn + " py-1.5"}>Add to schedule</button>
        </div>
      </form>
    </Section>
  );
}
