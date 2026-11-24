"use client";

import { useRouter } from "next/navigation";
import { db, showError, useAreas, useProjects } from "@/lib/data";
import { addDays, today } from "@/lib/dates";
import { AreaHeading, ProjectCard } from "@/components/plan-ui";

const addTile =
  "flex min-h-40 items-center justify-center rounded-xl border border-dashed border-line text-sm text-muted/60 transition hover:border-accent hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60";

export default function ProjectsPage() {
  const router = useRouter();
  const { areas, loading: areasLoading } = useAreas();
  const { projects, loading: projectsLoading } = useProjects();

  async function newProject(area_id: string) {
    const { data, error } = await db()
      .from("projects")
      .insert({ area_id, title: "New project", start_date: today(), finish_date: addDays(today(), 90) })
      .select("id")
      .single();
    if (error) return showError(error.message);
    router.push(`/projects/${data.id}?new=1`);
  }

  return (
    <div className="w-full space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
        <p className="mt-1 text-sm text-muted/60">
          Each project is a Result you want, Why it matters, and the Goal that proves it&apos;s achieved.
        </p>
      </div>
      {(areasLoading || projectsLoading) && (
        <div className="grid animate-pulse gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[0, 1, 2, 3].map((n) => (
            <div key={n} className="min-h-40 rounded-xl border border-line bg-surface p-5" />
          ))}
        </div>
      )}
      {areas.map((a) => {
        const ps = projects.filter((p) => p.area_id === a.id && p.status !== "done");
        return (
          <section key={a.id} aria-label={a.name} className="space-y-3">
            <AreaHeading area={a} />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {ps.map((p) => (
                <ProjectCard key={p.id} project={p} area={a} />
              ))}
              <button onClick={() => newProject(a.id)} className={addTile} aria-label={`New project in ${a.name}`}>
                + Project
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
