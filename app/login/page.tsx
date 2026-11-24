"use client";

import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  async function signIn() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  // Password sign-in exists only for automated tests (NEXT_PUBLIC_E2E=1); real sign-in is Google.
  async function testSignIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const { error } = await createClient().auth.signInWithPassword({ email: String(f.get("email")), password: String(f.get("password")) });
    if (!error) window.location.href = "/inbox";
  }

  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="w-full max-w-xs space-y-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Planner</h1>
        <button
          onClick={signIn}
          className="w-full rounded-lg bg-button px-4 py-3 text-sm font-medium text-white transition hover:opacity-90"
        >
          Continue with Google
        </button>
        {process.env.NEXT_PUBLIC_E2E === "1" && (
          <form onSubmit={testSignIn} className="space-y-2">
            <input name="email" aria-label="Email" className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm" />
            <input name="password" type="password" aria-label="Password" className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm" />
            <button className="w-full rounded-lg border border-line px-4 py-2 text-sm">Test sign-in</button>
          </form>
        )}
      </div>
    </main>
  );
}
