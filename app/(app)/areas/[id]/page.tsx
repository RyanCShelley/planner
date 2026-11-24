"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AreaIcon, ICON_CHOICES } from "@/lib/icons";
import { db, mutate, useAreas, useGoals, useItems, useProjects } from "@/lib/data";
import { GoalCard, ProjectCard } from "@/components/plan-ui";
import { AREA_COLORS, type Area, type Item } from "@/lib/types";
import { QuickAdd } from "@/components/quick-add";
import { ItemList } from "@/components/item-row";
import { ItemSheet } from "@/components/item-sheet";

export default function AreaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { areas, reload } = useAreas();
  const { items } = useItems({ areaId: id });
  const { projects } = useProjects();
  const { goals } = useGoals();
  const area = areas.find((a) => a.id === id);
  const [name, setName] = useState("");
  const [picker, setPicker] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [moveTo, setMoveTo] = useState<string>("");
  const [open, setOpen] = useState<Item | null>(null);

  useEffect(() => setName(area?.name ?? ""), [area?.name]);
  if (!area) return null;

  async function update(patch: Partial<Area>) {
    await mutate(db().from("areas").update(patch).eq("id", id));
    reload();
  }

  // Projects and goals must belong to an area, so everything moves before the area goes.
  async function remove() {
    if (!moveTo) return;
    const target = moveTo === "inbox" ? null : moveTo;
    const s = db();
    if (target) {
      await mutate(s.from("projects").update({ area_id: target }).eq("area_id", id));
      await mutate(s.from("goals").update({ area_id: target }).eq("area_id", id));
    }
    await mutate(s.from("items").update({ area_id: target }).eq("area_id", id));
    if (await mutate(s.from("areas").delete().eq("id", id))) router.push("/areas");
  }

  const others = areas.filter((a) => a.id !== id);

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setPicker(!picker)}
          aria-label="Change icon and color"
          className="grid size-11 place-items-center rounded-xl border border-line bg-surface"
        >
          <AreaIcon icon={area.icon} color={area.color} className="size-6" />
        </button>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== area.name && update({ name: name.trim() })}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          aria-label="Area name"
          className="flex-1 bg-transparent text-xl font-semibold tracking-tight outline-none"
        />
      </div>

      {picker && (
        <div className="space-y-4 rounded-xl border border-line bg-surface p-4">
          <div className="flex gap-2">
            {AREA_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => update({ color: c })}
                aria-label={c}
                className={`size-7 rounded-full border-2 ${area.color === c ? "border-text" : "border-transparent"}`}
                style={{ background: `var(--area-${c})` }}
              />
            ))}
          </div>
          <div className="grid grid-cols-9 gap-1">
            {ICON_CHOICES.map((k) => (
              <button
                key={k}
                onClick={() => update({ icon: k })}
                aria-label={k}
                className={`grid aspect-square place-items-center rounded-lg ${area.icon === k ? "bg-bg" : "hover:bg-bg/60"}`}
              >
                <AreaIcon icon={k} color={area.color} />
              </button>
            ))}
          </div>
        </div>
      )}

      {(() => {
        const ps = projects.filter((p) => p.area_id === id && p.status !== "done");
        const gs = goals.filter((g) => g.area_id === id && !g.project_id && g.status === "active");
        if (!ps.length && !gs.length) return null;
        return (
          <section className="space-y-2">
            <h2 className="text-sm font-medium text-muted/70">Projects and goals</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {ps.map((p) => (
                <ProjectCard key={p.id} project={p} area={area} goals={goals} />
              ))}
              {gs.map((g) => (
                <GoalCard key={g.id} goal={g} area={area} items={items} />
              ))}
            </div>
          </section>
        );
      })()}

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted/70">Everything else</h2>
        <QuickAdd areaId={id} />
        <ItemList items={items.filter((i) => !i.goal_id)} areas={areas} onOpen={setOpen} empty="No open actions in this area." />
      </section>

      <div className="border-t border-line pt-6">
        {!removing ? (
          <button onClick={() => setRemoving(true)} className="text-sm text-muted/50 hover:text-area-coral">
            Remove this area…
          </button>
        ) : (
          <div className="space-y-3 text-sm">
            <p>Move its projects, goals and actions to:</p>
            <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} className="w-full rounded-lg border border-line bg-surface px-3 py-2">
              <option value="">Choose…</option>
              {others.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button onClick={remove} disabled={!moveTo} className="rounded-lg bg-area-coral px-4 py-2 font-medium text-white disabled:opacity-30">
                Move and remove
              </button>
              <button onClick={() => setRemoving(false)} className="rounded-lg border border-line px-4 py-2">
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
