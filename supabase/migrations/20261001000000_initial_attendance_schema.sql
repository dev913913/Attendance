-- KMS Attendance initial schema. Apply with the Supabase CLI or SQL editor.
-- The historical workbook provides cumulative totals only, so it is deliberately
-- represented as baselines rather than fabricated past daily attendance records.

create type public.class_status as enum ('open', 'finalized');
create type public.attendance_status as enum ('present', 'absent');

create table public.programmes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  created_at timestamptz not null default now(),
  constraint programmes_name_not_blank check (length(trim(name)) > 0),
  constraint programmes_code_format check (code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now(),
  constraint sessions_name_not_blank check (length(trim(name)) > 0)
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.programmes(id) on delete restrict,
  sr_no integer not null check (sr_no > 0),
  roll_no text not null unique,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint students_roll_no_not_blank check (length(trim(roll_no)) > 0),
  constraint students_name_not_blank check (length(trim(name)) > 0)
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete restrict,
  class_date date not null,
  status public.class_status not null default 'open',
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  constraint classes_one_class_per_session_day unique (session_id, class_date),
  constraint classes_finalization_matches_status check (
    (status = 'open' and finalized_at is null) or
    (status = 'finalized' and finalized_at is not null)
  )
);

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete restrict,
  status public.attendance_status not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, student_id)
);

-- Stores the shared, programme-specific historical denominator used while
-- importing each student's cumulative Excel attendance.
create table public.attendance_baseline_config (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete restrict,
  programme_id uuid not null references public.programmes(id) on delete restrict,
  classes_conducted integer not null check (classes_conducted >= 0),
  as_of_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, programme_id)
);

create table public.attendance_baselines (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  attended_classes integer not null check (attended_classes >= 0),
  classes_conducted integer not null check (classes_conducted >= 0),
  as_of_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, student_id),
  constraint attendance_baselines_attended_not_above_conducted check (attended_classes <= classes_conducted)
);

create index students_programme_id_idx on public.students(programme_id);
create index classes_session_date_idx on public.classes(session_id, class_date desc);
create index attendance_student_id_idx on public.attendance(student_id);
create index attendance_baselines_student_id_idx on public.attendance_baselines(student_id);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger students_set_updated_at before update on public.students
for each row execute function public.set_updated_at();
create trigger attendance_set_updated_at before update on public.attendance
for each row execute function public.set_updated_at();
create trigger attendance_baseline_config_set_updated_at before update on public.attendance_baseline_config
for each row execute function public.set_updated_at();
create trigger attendance_baselines_set_updated_at before update on public.attendance_baselines
for each row execute function public.set_updated_at();

-- Seed reference data only. No students and no individual baseline totals are
-- inserted until the validated Excel importer is run.
insert into public.programmes (name, code) values
  ('B.Sc. FD 1', 'bsc-fd-1'),
  ('B.Com 1', 'bcom-1'),
  ('BBA 1', 'bba-1');

insert into public.sessions (name) values ('November 2026 — MST-2');

insert into public.attendance_baseline_config (session_id, programme_id, classes_conducted, as_of_date)
select s.id, p.id,
  case p.code when 'bsc-fd-1' then 34 when 'bcom-1' then 32 when 'bba-1' then 32 end,
  date '2026-10-01'
from public.sessions s
cross join public.programmes p
where s.name = 'November 2026 — MST-2';

-- All exposed tables are protected by RLS. No policies are created yet, so the
-- publishable browser client cannot read or write attendance data. A future
-- teacher-authentication/authorization phase must add narrow policies.
alter table public.programmes enable row level security;
alter table public.sessions enable row level security;
alter table public.students enable row level security;
alter table public.classes enable row level security;
alter table public.attendance enable row level security;
alter table public.attendance_baseline_config enable row level security;
alter table public.attendance_baselines enable row level security;
