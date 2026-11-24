"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAreas, useBlocks, useCurrentFocuses, useDoneSince, useGoals, useItems, useProjects } from "@/lib/data";
import { addDays, today } from "@/lib/dates";
import { AreaIcon } from "@/lib/icons";
import type { Area, Goal } from "@/lib/types";

const hrs = (min: number) => (min === 0 ? "0h" : `${Math.round((min / 60) * 10) / 10}h`);
const plain = (html: string) =>
  html
    .replace(/<\/(p|h\d|li|blockquote)>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" · ");
const quote = (s: string) => `“${s}”`;
const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/**
 * Ten minutes on Sunday: does every active goal have something on the board for the next 7 days?
 * Shows each area's current focus, time blocked, goals with nothing scheduled, and what got done.
 */
export default function ReviewPage() {
  const t = today();
  const end = addDays(t, 6);
  const { areas, loading } = useAreas();
  const { blocks } = useBlocks(t, end);
  const { items } = useItems(); // open actions
  const { goals } = useGoals();
  const { projects } = useProjects();
  const { focuses } = useCurrentFocuses();
  const { done } = useDoneSince(`${addDays(t, -7)}T00:00:00`);

  const r = useMemo(() => {
    const weekBlocks = new Set(blocks.map((b) => b.id));
    const active = goals.filter((g) => g.status === "active");
    const scheduled = (g: Goal) => items.filter((i) => i.goal_id === g.id && i.block_id && weekBlocks.has(i.block_id)).length;
    // A block counts toward its own area, or, if it has none, the area most of its actions are in.
    const areaOf = (b: (typeof blocks)[number]) => {
      if (b.area_id) return b.area_id;
      const n = new Map<string, number>();
      for (const i of items) if (i.block_id === b.id && i.area_id) n.set(i.area_id, (n.get(i.area_id) ?? 0) + 1);
      return [...n].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
    };
    const blockArea = new Map(blocks.map((b) => [b.id, areaOf(b)]));
    const minutes = (a: Area) => blocks.filter((b) => blockArea.get(b.id) === a.id).reduce((s, b) => s + b.length_min, 0);
    const per = areas.map((a) => ({
      area: a,
      min: minutes(a),
      goals: active.filter((g) => g.area_id === a.id).map((g) => ({ g, n: scheduled(g) })),
      focus: focuses.find((f) => f.area_id === a.id),
      done: done.filter((i) => i.area_id === a.id).length,
    }));
    const unplanned = per.flatMap((p) => p.goals.filter((x) => x.n === 0).map((x) => x.g));
    const total = blocks.reduce((s, b) => s + b.length_min, 0);
    const inbox = items.filter((i) => !i.area_id).length;
    const loose = blocks.filter((b) => !blockArea.get(b.id)).length;
    return { per, unplanned, total, inbox, loose };
  }, [areas, blocks, items, goals, focuses, done]);

  if (loading) return null;

  const busiest = [...r.per].sort((a, b) => b.min - a.min)[0];
  const empty = r.per.filter((p) => p.min === 0).map((p) => p.area.name);
  const summary = [
    `You have ${blocks.length} block${blocks.length === 1 ? "" : "s"} over the next 7 days (${hrs(r.total)}).`,
    busiest && busiest.min > 0 ? `Most of that time goes to ${busiest.area.name} (${hrs(busiest.min)}).` : "",
    r.loose ? `${r.loose} block${r.loose === 1 ? " isn't" : "s aren't"} tied to an area yet.` : "",
    !empty.length || !blocks.length ? "" : empty.length <= 3 ? `${list(empty)} ${empty.length > 1 ? "have" : "has"} no blocks.` : `${empty.length} areas have no blocks.`,
    r.unplanned.length > 3
      ? `${r.unplanned.length} goals have nothing scheduled this week (marked below).`
      : r.unplanned.length
      ? `${list(r.unplanned.map((g) => quote(g.goal)))} ${r.unplanned.length > 1 ? "have" : "has"} nothing scheduled this week.`
      : goals.some((g) => g.status === "active")
        ? "Every active goal has something scheduled."
        : "",
    `You finished ${done.length} action${done.length === 1 ? "" : "s"} in the last 7 days.`,
    r.inbox ? `${r.inbox} Inbox item${r.inbox === 1 ? "" : "s"} still need${r.inbox === 1 ? "s" : ""} an area.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const stats: [number | string, string, string?][] = [
    [blocks.length, "blocks planned", "/actions"],
    [hrs(r.total), "blocked"],
    [r.unplanned.length, "goals with nothing scheduled"],
    [done.length, "done in the last 7 days"],
    [r.inbox, "in Inbox", "/inbox"],
  ];

  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Weekly review</h1>
        <p className="text-sm text-muted/60">Ten minutes on Sunday. Make sure every goal has something on the board for the next 7 days.</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" role="list" aria-label="This week">
        {stats.map(([n, label, href]) => {
          const inner = (
            <>
              <b className="block text-xl font-semibold">{n}</b>
              <span className="text-xs text-muted/60">{label}</span>
            </>
          );
          const cls = "block rounded-xl border border-line bg-surface p-3";
          return (
            <div role="listitem" key={label} aria-label={`${n} ${label}`}>
              {href ? (
                <Link href={href} className={cls + " hover:border-accent"}>
                  {inner}
                </Link>
              ) : (
                <div className={cls}>{inner}</div>
              )}
            </div>
          );
        })}
      </div>

      <section aria-label="Summary" className="rounded-xl border border-accent/40 bg-accent/5 p-4">
        <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-accent">Summary</h2>
        <p className="text-sm leading-relaxed">{summary}</p>
      </section>

      {r.per.map(({ area, min, goals: gs, focus, done: d }) => (
        <section
          key={area.id}
          aria-label={area.name}
          className="space-y-3 rounded-xl border border-line bg-surface p-4"
          style={{ borderTop: `3px solid var(--area-${area.color})` }}
        >
          <div className="flex items-center gap-2">
            <AreaIcon icon={area.icon} color={area.color} className="size-4" />
            <Link href={`/areas/${area.id}`} className="text-sm font-semibold hover:underline">
              {area.name}
            </Link>
            <span className="ml-auto text-xs text-muted/60">
              {hrs(min)} blocked · {d} done
            </span>
          </div>

          <Link href={`/areas/${area.id}`} className="block rounded-lg bg-bg/60 px-3 py-2 text-sm hover:bg-bg">
            <span className="mr-2 text-[11px] uppercase tracking-wide text-muted/50">Focus</span>
            {focus && plain(focus.body) ? (
              <span className="line-clamp-2">{plain(focus.body)}</span>
            ) : (
              <span className="text-muted/50">None set. Add one →</span>
            )}
          </Link>

          {gs.length ? (
            <ul className="divide-y divide-line">
              {gs.map(({ g, n }) => {
                const project = projects.find((p) => p.id === g.project_id);
                return (
                  <li key={g.id} aria-label={g.goal} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                    <span className="min-w-0 flex-1">
                      {g.goal}
                      {project && <span className="ml-2 text-xs text-muted/50">{project.title}</span>}
                    </span>
                    {n ? (
                      <span className="text-xs text-accent">{n} scheduled</span>
                    ) : (
                      <span className="rounded-full bg-area-coral/15 px-2 py-0.5 text-[11px] text-area-coral">Nothing scheduled</span>
                    )}
                    <Link href={`/goals/${g.id}`} className="text-xs font-medium text-accent hover:underline">
                      Plan it →
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-muted/50">No active goals. Day-to-day actions only.</p>
          )}
        </section>
      ))}
    </div>
  );
}
