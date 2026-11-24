"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  db,
  fillScheduleBlocks,
  mutate,
  showError,
  useAreas,
  useBlocks,
  useCaptures,
  useItems,
  useProjects,
  useRules,
  useSubRoles,
} from "@/lib/data";
import { addDays, today } from "@/lib/dates";
import { LENGTHS, PARTS, fmtLen, fmtTime, partFor, toHours } from "@/lib/blocks";
import { WD } from "@/lib/repeat";
import type { Block, Part, Project, ScheduleRule } from "@/lib/types";
import { EditText, Section, btn, daysLeft, field, fmtDate, ghost, small } from "@/components/plan-ui";

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = useSearchParams().get("new") === "1";
  const router = useRouter();
  const { areas } = useAreas();
  const { projects, loading } = useProjects();
  const { items } = useItems({ open: false });
  const { blocks } = useBlocks(today(), addDays(today(), 13));
  const p = projects.find((x) => x.id === id);
  const [deleting, setDeleting] = useState(false);

  if (!p) {
    return loading ? (
      <div className="max-w-5xl animate-pulse space-y-6">
        <div className="h-8 w-64 rounded-lg bg-surface" />
        <div className="h-32 rounded-xl border border-line bg-surface" />
      </div>
    ) : (
      <p className="text-sm text-muted/60">
        That project is gone.{" "}
        <Link href="/projects" className="underline">
          All projects
        </Link>
      </p>
    );
  }

  const update = (patch: Partial<Project>) => mutate(db().from("projects").update(patch).eq("id", id));
  const projectItems = items.filter((i) => i.project_id === id);
  const openItems = projectItems.filter((i) => !i.done_at);
  const mins = blocks.filter((b) => b.project_id === id).reduce((s, b) => s + b.length_min, 0);
  const left = daysLeft(p.finish_date);

  async function remove() {
    if (await mutate(db().from("projects").delete().eq("id", id))) router.push("/projects");
  }

  return (
    <div className="w-full max-w-5xl space-y-8">
      <Link href="/projects" className="inline-block text-sm text-muted/60 hover:text-text">
        ← All projects
      </Link>

      <div className="space-y-4">
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

        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wide text-muted/50">Result (Title)</span>
          <EditText
            value={p.title}
            onSave={(v) => update({ title: v.trim() || "Untitled project" })}
            label="Project title"
            wrap
            autoSelect={isNew}
            className="w-full bg-transparent text-xl font-semibold leading-snug tracking-tight outline-none sm:text-2xl"
          />
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-muted/60">Why (Purpose): why this project matters</span>
            <EditText
              value={p.purpose ?? ""}
              onSave={(v) => update({ purpose: v || null })}
              label="Purpose"
              placeholder="Why does this result matter?"
              multiline
              className={field}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted/60">Goal: how I know I&apos;ve achieved the result</span>
            <EditText
              value={p.goal_text ?? ""}
              onSave={(v) => update({ goal_text: v || null })}
              label="Goal"
              placeholder="What does done look like?"
              multiline
              className={field}
            />
          </label>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <Stat n={openItems.length} label="open actions" />
          <Stat n={`${projectItems.filter((i) => i.done_at).length} / ${projectItems.length}`} label="actions done" />
          <Stat n={fmtLen(mins || 0)} label="blocked, next 14 days" />
        </div>
      </div>

      <CaptureAndChunk projectId={id} project={p} />

      <ScheduleActions project={p} openItems={openItems} blocks={blocks} />

      <ScheduleRules project={p} />

      <div className="border-t border-line pt-6 text-sm">
        {!deleting ? (
          <button onClick={() => setDeleting(true)} className="text-muted/50 hover:text-area-coral">
            Delete project…
          </button>
        ) : (
          <div className="space-y-3">
            <p>Its schedule and its blocks go. Its actions stay, without a project.</p>
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

/** Step 1 & 2: Single-box Capture -> Chunk into areas/sub-roles with practical order. */
function CaptureAndChunk({ projectId, project }: { projectId: string; project: Project }) {
  const { areas } = useAreas();
  const { captures } = useCaptures(projectId);
  const [text, setText] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [chunkAreaId, setChunkAreaId] = useState(project.area_id);
  const { subRoles } = useSubRoles(chunkAreaId);
  const [subRoleId, setSubRoleId] = useState("");
  const [orderMap, setOrderMap] = useState<Record<string, number>>({});

  async function capture(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    if (await mutate(db().from("captures").insert({ project_id: projectId, kind: "idea", text: text.trim() }))) {
      setText("");
    }
  }

  const toggle = (cid: string) => {
    const s = new Set(sel);
    if (s.has(cid)) s.delete(cid);
    else s.add(cid);
    setSel(s);
  };

  function suggestOrder() {
    const nextOrder: Record<string, number> = {};
    const allIds = new Set<string>();
    captures.forEach((c, idx) => {
      nextOrder[c.id] = idx + 1;
      allIds.add(c.id);
    });
    setOrderMap(nextOrder);
    setSel(allIds);
  }

  const chosen = captures
    .filter((c) => sel.has(c.id))
    .sort((a, b) => (orderMap[a.id] ?? 999) - (orderMap[b.id] ?? 999));

  async function convertToActions() {
    if (!chosen.length) return;
    const rows = chosen.map((c, idx) => ({
      title: c.text,
      area_id: chunkAreaId || project.area_id,
      sub_role_id: subRoleId || null,
      project_id: projectId,
      priority: orderMap[c.id] ?? idx + 1,
      status: "active" as const,
    }));
    if (!(await mutate(db().from("items").insert(rows)))) return;
    await mutate(
      db()
        .from("captures")
        .delete()
        .in(
          "id",
          chosen.map((c) => c.id),
        ),
    );
    setSel(new Set());
    setOrderMap({});
  }

  return (
    <Section
      n={1}
      title="Capture & Chunk"
      hint="Shoot off ideas in one box without deciding value. Then group them into an area/sub-role, assign a practical order, and convert to actions."
    >
      <form onSubmit={capture} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Shoot off an idea, task, or note…"
          aria-label="Capture"
          className={field + " min-w-0 flex-1"}
        />
        <button className={btn}>Capture</button>
      </form>

      <div className="rounded-xl border border-line bg-surface p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted/60">
            Captured ideas ({captures.length})
          </span>
          {captures.length > 0 && (
            <button type="button" onClick={suggestOrder} className="text-xs text-accent hover:underline">
              Select all &amp; suggest order
            </button>
          )}
        </div>

        {captures.length === 0 ? (
          <p className="text-xs text-muted/40">Nothing captured yet. Type an idea above and press Enter.</p>
        ) : (
          <ul className="space-y-2">
            {captures.map((c) => (
              <li key={c.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={sel.has(c.id)}
                  onChange={() => toggle(c.id)}
                  aria-label={`Select ${c.text}`}
                  className="accent-[var(--accent)]"
                />
                <input
                  type="number"
                  min={1}
                  placeholder="#"
                  aria-label={`Order for ${c.text}`}
                  value={orderMap[c.id] ?? ""}
                  onChange={(e) =>
                    setOrderMap((prev) => ({
                      ...prev,
                      [c.id]: e.target.value ? Number(e.target.value) : 0,
                    }))
                  }
                  className="w-14 rounded border border-line bg-bg px-2 py-1 text-center text-xs outline-none focus:border-accent"
                />
                <span className="flex-1">{c.text}</span>
                <button
                  type="button"
                  onClick={() => mutate(db().from("captures").delete().eq("id", c.id))}
                  aria-label={`Delete ${c.text}`}
                  className="grid size-7 place-items-center rounded-md text-xs text-muted/40 transition hover:bg-bg hover:text-area-coral"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {sel.size > 0 && (
        <div role="group" aria-label="Chunk selected" className="flex flex-wrap items-center gap-2 rounded-xl border border-accent/50 bg-accent/10 p-3 text-sm">
          <b>{sel.size} selected</b>
          <span>Area:</span>
          <select
            value={chunkAreaId}
            onChange={(e) => {
              setChunkAreaId(e.target.value);
              setSubRoleId("");
            }}
            aria-label="Chunk area"
            className={small}
          >
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          {subRoles.length > 0 && (
            <select value={subRoleId} onChange={(e) => setSubRoleId(e.target.value)} aria-label="Chunk sub-role" className={small}>
              <option value="">No sub-role</option>
              {subRoles.map((sr) => (
                <option key={sr.id} value={sr.id}>
                  {sr.name}
                </option>
              ))}
            </select>
          )}
          <button type="button" onClick={convertToActions} className={btn + " py-1.5"}>
            Convert to Actions
          </button>
          <button type="button" onClick={() => setSel(new Set())} className="text-muted/60 hover:text-text">
            Clear
          </button>
        </div>
      )}
    </Section>
  );
}

/** Step 3a: Schedule chunked actions onto blocks/calendar. */
function ScheduleActions({
  project,
  openItems,
  blocks,
}: {
  project: Project;
  openItems: { id: string; title: string; priority: number | null; block_id: string | null; due_date: string | null }[];
  blocks: Block[];
}) {
  const sorted = [...openItems].sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));

  async function assignBlock(itemId: string, blockId: string) {
    if (!blockId) {
      await mutate(db().from("items").update({ block_id: null }).eq("id", itemId));
      return;
    }
    const blk = blocks.find((b) => b.id === blockId);
    await mutate(
      db()
        .from("items")
        .update({ block_id: blockId, due_date: blk?.date ?? project.finish_date ?? today() })
        .eq("id", itemId),
    );
  }

  return (
    <Section n={2} title="Schedule Actions" hint="Assign chunked actions onto your upcoming blocks.">
      {sorted.length === 0 ? (
        <p className="text-sm text-muted/50">No open actions yet. Capture and chunk ideas above to create actions.</p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
              <div className="flex items-center gap-2">
                {item.priority != null && (
                  <span className="rounded bg-bg px-2 py-0.5 text-xs font-medium text-muted/70">#{item.priority}</span>
                )}
                <span>{item.title}</span>
              </div>
              <select
                value={item.block_id ?? ""}
                onChange={(e) => assignBlock(item.id, e.target.value)}
                aria-label={`Schedule ${item.title}`}
                className={small}
              >
                <option value="">Unscheduled</option>
                {blocks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {fmtDate(b.date)} · {b.name} ({b.part_of_day})
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
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

/** Step 3b: Recurring time for this project; each rule puts blocks on the Actions board. */
function ScheduleRules({ project }: { project: Project }) {
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
        .insert({
          project_id: project.id,
          name: project.title,
          days,
          part_of_day: pin ? partFor(Number(pin)) : part,
          length_min: len,
          pinned_time,
        }),
    );
    if (!ok) return;
    setDays([]);
    setPin("");
    await fillScheduleBlocks(today());
  }

  return (
    <Section n={3} title="Recurring Schedule" hint="Recurring time for this project. Each rule puts blocks on your Actions board for the next two weeks.">
      <ul className="space-y-2">
        {rules.map((r) => (
          <li key={r.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
            <span className="flex-1">↻ {ruleText(r)}</span>
            <button onClick={() => mutate(db().from("schedule_rules").delete().eq("id", r.id))} className="text-xs text-muted/50 hover:text-area-coral">
              Remove
            </button>
          </li>
        ))}
        {!rules.length && <li className="text-sm text-muted/50">No recurring schedule yet. Add one so this project gets time every week.</li>}
      </ul>
      <form onSubmit={add} className="space-y-3 rounded-xl border border-line p-3">
        <div role="group" aria-label="Days" className="flex flex-wrap gap-1">
          {WD.map((w, k) => (
            <label key={w} className={`cursor-pointer rounded-full border px-3 py-1 text-xs transition focus-within:ring-2 focus-within:ring-accent/60 ${days.includes(k) ? "border-accent text-text" : "border-line text-muted/60"}`}>
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
