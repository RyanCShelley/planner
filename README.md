# Planner

A personal planner that turns goals into actions. Replaces Akiflow.
Plan: https://claude.ai/artifact/YaaPdyPR86EHUbw6YGGAFt

| Part | Where |
|---|---|
| UI (Next.js, React, TypeScript, Tailwind, PWA) | `app/`, `components/`, `lib/` |
| API (Python FastAPI, Vercel Python function) | `api/index.py` |
| Database (Supabase Postgres, row-level security) | `supabase/migrations/` |

## One-time setup

1. **Vercel:** Add New > Project > import this repo. Framework: Next.js. Defaults are fine.
2. **Supabase:** in the Vercel project, Storage > Marketplace > Supabase > connect to this project (US East). The `NEXT_PUBLIC_SUPABASE_*` variables are added for you. Also add `SUPABASE_URL` with the same value as `NEXT_PUBLIC_SUPABASE_URL`.
3. **Schema:** in Supabase, SQL Editor > paste `supabase/migrations/0001_init.sql` > Run.
4. **Google sign-in:** Supabase > Authentication > Providers > Google. Create an OAuth client in Google Cloud (Web application) and use the callback URL Supabase shows. Then in Supabase > Authentication > URL Configuration set Site URL to the Vercel URL and add `<vercel-url>/auth/callback` and `http://localhost:3000/auth/callback` to Redirect URLs.
5. Redeploy. Sign in with Google; your five areas appear on the Actions page.

## Local development

```bash
npm install
pip install -r requirements.txt uvicorn
vercel env pull .env.local   # or copy .env.example and fill it in
npm run dev                  # Next.js on :3000, FastAPI on :8000 (proxied at /api)
```
