"use client";

import { useRouter } from "next/navigation";
import { db, showError, useAreas, useGoals, useItems, useProjects } from "@/lib/data";
import { addDays, today } from "@/lib/dates";
import { AreaHeading, GoalCard, ProjectCard } from "@/components/plan-ui";

const add = "flex min-h-28 items-center justify-center rounded-xl border border-dashed border-line text-sm text-muted/60 hover:border-accent hover:text-text";

export default function ProjectsPage() {
  const router = useRouter();
  const { areas } = useAreas();
  const { projects } = useProjects();
  const { goals } = useGoals();
  const { items } = useItems();

  async function newProject(area_id: string) {
    const { data, error } = await db()
      .from("projects")
      .insert({ area_id, title: "New project", start_date: today(), finish_date: addDays(today(), 90) })
      .select("id")
      .single();
    if (error) return showError(error.message);
    router.push(`/projects/${data.id}?new=1`);
  }
  async function newGoal(area_id: string) {
    const { data, error } = await db()
      .from("goals")
      .insert({ area_id, goal: "New goal", target_date: addDays(today(), 90) })
      .select("id")
      .single();
    if (error) return showError(error.message);
    router.push(`/goals/${data.id}?new=1`);
  }

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
        <p className="mt-1 text-sm text-muted/60">A project holds related goals and the recurring time you give them every week. A goal can also stand on its own.</p>
      </div>
      {areas.map((a) => {
        const ps = projects.filter((p) => p.area_id === a.id && p.status !== "done");
        const loose = goals.filter((g) => g.area_id === a.id && !g.project_id && g.status === "active");
        return (
          <section key={a.id} aria-label={a.name} className="space-y-3">
            <AreaHeading area={a} />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ps.map((p) => (
                <ProjectCard key={p.id} project={p} area={a} goals={goals} />
              ))}
              {loose.map((g) => (
                <GoalCard key={g.id} goal={g} area={a} items={items} />
              ))}
              <div className="grid grid-cols-2 gap-3 sm:col-span-1">
                <button onClick={() => newProject(a.id)} className={add} aria-label={`New project in ${a.name}`}>
                  + Project
                </button>
                <button onClick={() => newGoal(a.id)} className={add} aria-label={`New goal in ${a.name}`}>
                  + Goal
                </button>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
