"use client";

import { useEffect, useState } from "react";
import { ERROR } from "@/lib/data";

// Shows write/read errors briefly so nothing fails silently.
export function Toast() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const on = (e: Event) => {
      setMsg((e as CustomEvent<string>).detail);
      clearTimeout(t);
      t = setTimeout(() => setMsg(null), 6000);
    };
    window.addEventListener(ERROR, on);
    return () => window.removeEventListener(ERROR, on);
  }, []);
  if (!msg) return null;
  return (
    <div role="alert" className="fixed inset-x-4 bottom-20 z-[60] mx-auto max-w-md rounded-xl border border-area-coral/50 bg-surface px-4 py-3 text-sm shadow-lg md:bottom-6">
      <span className="text-area-coral">Something went wrong:</span> {msg}
    </div>
  );
}
