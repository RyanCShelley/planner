import { createClient } from "@/lib/supabase/server";

// Step 1 check page: proves sign-in, the database and row-level security work end to end.
// Replaced by the day board in step 3.
export default async function ActionsPage() {
  const supabase = await createClient();
  const { data: areas } = await supabase.from("areas").select("id,name,icon,color").order("sort");

  return (
    <div className="max-w-md space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Actions</h1>
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {(areas ?? []).map((a) => (
          <li key={a.id} className="flex items-center gap-3 px-4 py-3 text-sm">
            <span className="size-2.5 rounded-full" style={{ background: `var(--area-${a.color})` }} />
            {a.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
