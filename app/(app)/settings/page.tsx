"use client";

import { useState } from "react";
import { disconnectGoogleCalendar, getGoogleAuthUrl, useGoogleCalendarConnection } from "@/lib/data";

export default function SettingsPage() {
  const { connection, connected, loading } = useGoogleCalendarConnection();
  const [busy, setBusy] = useState(false);

  async function handleConnect() {
    setBusy(true);
    try {
      const url = await getGoogleAuthUrl();
      window.location.href = url;
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    setBusy(true);
    try {
      await disconnectGoogleCalendar();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Settings</h1>

      <section className="space-y-4 rounded-xl border border-line bg-surface p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium">Google Calendar</h2>
            <p className="mt-1 text-xs text-muted/70">
              Show your Google Calendar events on the Actions board and sync pinned blocks to your &quot;Planner&quot; calendar.
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
              connected ? "bg-accent/15 text-accent" : "bg-muted/10 text-muted/70"
            }`}
          >
            {loading ? "Checking..." : connected ? "Connected" : "Not connected"}
          </span>
        </div>

        {connected && connection && (
          <dl className="space-y-1.5 rounded-lg border border-line/70 bg-bg px-3.5 py-2.5 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-muted/60">Account</dt>
              <dd className="font-medium">{connection.email ?? "Connected"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted/60">Planner calendar ID</dt>
              <dd className="truncate font-mono text-[11px] text-muted/80">{connection.planner_calendar_id ?? "Created on first sync"}</dd>
            </div>
          </dl>
        )}

        <div className="flex items-center gap-3">
          {connected ? (
            <button
              onClick={handleDisconnect}
              disabled={busy || loading}
              className="rounded-lg border border-area-coral/40 px-4 py-2 text-sm font-medium text-area-coral transition hover:bg-area-coral/10 disabled:opacity-50"
            >
              {busy ? "Disconnecting..." : "Disconnect"}
            </button>
          ) : (
            <button
              onClick={handleConnect}
              disabled={busy || loading}
              className="rounded-lg bg-button px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Connecting..." : "Connect Google Calendar"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
