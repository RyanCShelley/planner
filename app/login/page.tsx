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
      </div>
    </main>
  );
}
