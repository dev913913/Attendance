# KMS Attendance

A small, teacher-controlled attendance application for KMS College of IT and Management. This repository currently contains the production-ready foundation only; it does **not** yet include attendance marking or student data.

## Included

- Next.js App Router + TypeScript + Tailwind CSS application shell.
- Browser-safe Supabase client factory using the public publishable key only.
- Normalized Supabase migration for programmes, students, sessions, actual classes, final attendance, and cumulative historical baselines.
- Seeded reference data for **November 2026 — MST-2**, three programmes, and the 01 October 2026 baseline denominators (34 / 32 / 32).
- A documented location for a future validated, repeat-safe Excel importer: [`scripts/import/`](scripts/import/).

## Local setup

1. Install Node.js (the project is configured for modern Next.js).
2. Copy `.env.example` to `.env.local`.
3. In Supabase Dashboard, copy **Project URL** and the **publishable/anon key** into `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Do not use a service-role key in the browser or commit `.env.local`.
4. Install and run:

   ```bash
   npm install
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000).

## Supabase setup required

1. Link this repository to the already-created Supabase project using the Supabase CLI, then apply `supabase/migrations/20261001000000_initial_attendance_schema.sql` (or run it in the SQL Editor after review).
2. Configure the two public environment variables in your Vercel project for deployed builds.
3. Implement teacher authentication and narrowly scoped RLS policies before exposing any attendance workflow. The migration enables RLS and deliberately creates **no** policies, so data is not publicly accessible or writable.
4. Run the future importer with the real workbook locally or in a controlled server environment. It must never use a service-role key in frontend code.

Applying the migration has not been tested against a live Supabase project by this repository.

## Data model notes

A `classes` record represents an actual conducted class, never an ordinary calendar date. Baselines hold Excel-era cumulative values per student as of 01 October 2026; historical daily records are intentionally not fabricated. Future totals combine baseline values with finalized actual classes and `present` attendance records. The session label does not generate any attendance dates.

## Not yet implemented

Dashboard, class start/finalization, student import implementation, attendance marking, historical corrections, register, totals UI, export, authentication, student portal, QR attendance, notifications, charts, and analytics are intentionally deferred.

## Checks

```bash
npm run typecheck
npm run lint
npm run build
```
