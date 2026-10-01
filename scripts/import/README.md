# Attendance baseline importer

This trusted CLI imports the one-time cumulative Excel baseline as of **2026-10-01**. It writes only `students` and `attendance_baselines`; it never writes `classes` or `attendance` and never creates historical daily attendance.

## Prerequisites and local credentials

Install dependencies first:

```bash
npm install
```

Create a local-only `.env.import.local` in the repository root (it is ignored by Git):

```dotenv
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
```

The service-role key is required because the applied schema has RLS enabled and no public write policies. This key is for the local trusted importer only: do not commit it, put it in Vercel, expose it with a `NEXT_PUBLIC_` name, or import it into Next.js application code.

## Expected workbook

Pass one local `.xlsx` file. It must contain exactly these worksheets and expected row counts:

| Worksheet | Programme code | Students | Classes conducted |
| --- | --- | ---: | ---: |
| `B.Sc. FD 1` | `bsc-fd-1` | 40 | 34 |
| `B.Com 1` | `bcom-1` | 22 | 32 |
| `BBA 1` | `bba-1` | 12 | 32 |

The first row of each sheet must contain these four headers (additional columns are ignored):

1. `Sr. No.`
2. `Roll No.`
3. `Name of the Student`
4. `total attendance till 01 Oct`

The importer reads only those four columns. It rejects missing/duplicate required headers, unexpected or missing worksheets, empty rows in the data range, non-integer or invalid attendance, missing fields, duplicate roll numbers, duplicate programme serial numbers, incorrect sheet counts, and totals other than 74 students.

## Run safely

Always begin with a dry run; it reads the workbook and the existing Supabase reference/data rows but makes no writes:

```bash
npm run import:attendance -- ./path/to/attendance.xlsx
```

After reviewing the reported counts, explicitly apply it:

```bash
npm run import:attendance -- ./path/to/attendance.xlsx --apply
```

The importer resolves the seeded programmes, the `November 2026 — MST-2` session, and baseline configuration before it can write. It requires the 01 October 2026 configuration to be 34 / 32 / 32 classes.

## Safety and reruns

`roll_no` is the student identity. Existing students are compared with workbook programme, serial number, name, and active status; any difference stops the import without silently correcting records. Existing baselines are similarly compared before writing. Identical existing records are left unchanged, and only missing students/baselines are inserted, making an identical rerun safe after a successful or interrupted run.

All workbook validation and database conflict/reference checks occur before writes. The CLI reports all workbook validation errors together and makes no writes when validation fails. Since writes use the Supabase API rather than a cross-table database transaction, an infrastructure failure during apply may leave a partial import; rerun the same validated workbook to complete it safely.

## Tests

The pure workbook validation/normalization logic has synthetic-data tests only:

```bash
npm run test:import
```
