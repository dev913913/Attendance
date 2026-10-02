import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";
import {
  BASELINE_AS_OF_DATE,
  PROGRAMME_IMPORT_CONFIGS,
  SESSION_NAME,
  type ImportStudent,
  type RawWorksheet,
} from "./attendance-import.types.ts";
import { validateWorkbook } from "./attendance-import.validation.ts";

type Programme = { id: string; code: string };
type Session = { id: string; name: string };
type BaselineConfig = { programme_id: string; classes_conducted: number; as_of_date: string };
type ExistingStudent = { id: string; programme_id: string; sr_no: number; roll_no: string; name: string; active: boolean };
type ExistingBaseline = { student_id: string; attended_classes: number; classes_conducted: number; as_of_date: string };

function usage(message?: string): never {
  if (message) console.error(`Error: ${message}\n`);
  console.error("Usage: tsx scripts/import/import-attendance-baselines.ts <workbook.xlsx> [--apply]");
  process.exit(1);
}

async function loadImportEnvironment(): Promise<void> {
  const envPath = path.resolve(".env.import.local");
  try {
    const content = await readFile(envPath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || line.trimStart().startsWith("#")) continue;
      const [, key, rawValue] = match;
      const value = rawValue.replace(/^(["'])(.*)\1$/, "$2");
      if (!process.env[key]) process.env[key] = value;
    }
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") usage("Missing .env.import.local. See scripts/import/README.md.");
    throw error;
  }
}

function parseArguments(): { workbookPath: string; apply: boolean } {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const paths = args.filter((argument) => argument !== "--apply");
  if (paths.length !== 1) usage("Provide exactly one workbook path and an optional --apply flag.");
  if (!paths[0].toLowerCase().endsWith(".xlsx")) usage("The workbook path must end in .xlsx.");
  return { workbookPath: path.resolve(paths[0]), apply };
}

function worksheetRows(workbook: ExcelJS.Workbook): RawWorksheet[] {
  return workbook.worksheets.map((worksheet) => {
    let lastNonEmptyRow = 0;
    for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const hasContent = Array.from({ length: worksheet.columnCount }, (_, index) => row.getCell(index + 1).value)
        .some((value) => value !== null && value !== undefined && String(value).trim() !== "");
      if (hasContent) lastNonEmptyRow = rowNumber;
    }

    const rows: unknown[][] = [];
    for (let rowNumber = 1; rowNumber <= lastNonEmptyRow; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      rows.push(Array.from({ length: worksheet.columnCount }, (_, index) => row.getCell(index + 1).value));
    }
    return { worksheetName: worksheet.name, rows };
  });
}

function failPreflight(errors: string[]): never {
  console.error(`Import preflight failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

async function resolveReferences(supabase: ReturnType<typeof createClient>): Promise<{ programmes: Map<string, Programme>; session: Session; configs: Map<string, BaselineConfig> }> {
  const codes = PROGRAMME_IMPORT_CONFIGS.map((config) => config.programmeCode);
  const [{ data: programmes, error: programmeError }, { data: sessions, error: sessionError }] = await Promise.all([
    supabase.from("programmes").select("id, code").in("code", codes),
    supabase.from("sessions").select("id, name").eq("name", SESSION_NAME),
  ]);
  if (programmeError) throw new Error(`Could not resolve programmes: ${programmeError.message}`);
  if (sessionError) throw new Error(`Could not resolve session: ${sessionError.message}`);

  const errors: string[] = [];
  const programmeMap = new Map(((programmes ?? []) as Programme[]).map((programme) => [programme.code, programme]));
  for (const code of codes) if (!programmeMap.has(code)) errors.push(`Missing seeded programme with code "${code}".`);
  if (!sessions || sessions.length !== 1) errors.push(`Expected exactly one session named "${SESSION_NAME}", found ${sessions?.length ?? 0}.`);
  if (errors.length > 0) failPreflight(errors);
  const session = sessions![0] as Session;

  const { data: configs, error: configError } = await supabase
    .from("attendance_baseline_config")
    .select("programme_id, classes_conducted, as_of_date")
    .eq("session_id", session.id);
  if (configError) throw new Error(`Could not resolve baseline configuration: ${configError.message}`);

  const configMap = new Map<string, BaselineConfig>();
  for (const config of (configs ?? []) as BaselineConfig[]) configMap.set(config.programme_id, config);
  for (const expected of PROGRAMME_IMPORT_CONFIGS) {
    const programme = programmeMap.get(expected.programmeCode)!;
    const config = configMap.get(programme.id);
    if (!config || config.classes_conducted !== expected.classesConducted || config.as_of_date !== BASELINE_AS_OF_DATE) {
      errors.push(`Baseline configuration for ${expected.worksheetName} must be ${expected.classesConducted} classes as of ${BASELINE_AS_OF_DATE}.`);
    }
  }
  if (configMap.size !== PROGRAMME_IMPORT_CONFIGS.length) errors.push(`Expected exactly ${PROGRAMME_IMPORT_CONFIGS.length} baseline configuration rows for the session.`);
  if (errors.length > 0) failPreflight(errors);
  return { programmes: programmeMap, session, configs: configMap };
}

async function preflightExistingData(
  supabase: ReturnType<typeof createClient>,
  students: ImportStudent[],
  programmes: Map<string, Programme>,
  sessionId: string,
): Promise<{ existingStudents: Map<string, ExistingStudent>; missingBaselines: ImportStudent[] }> {
  const rollNumbers = students.map((student) => student.rollNo);
  const { data, error } = await supabase
    .from("students")
    .select("id, programme_id, sr_no, roll_no, name, active")
    .in("roll_no", rollNumbers);
  if (error) throw new Error(`Could not preflight existing students: ${error.message}`);

  const existingStudents = new Map(((data ?? []) as ExistingStudent[]).map((student) => [student.roll_no, student]));
  const errors: string[] = [];
  for (const incoming of students) {
    const existing = existingStudents.get(incoming.rollNo);
    if (!existing) continue;
    const programmeId = programmes.get(incoming.programmeCode)!.id;
    if (existing.programme_id !== programmeId || existing.sr_no !== incoming.srNo || existing.name.trim() !== incoming.name || !existing.active) {
      errors.push(`Existing student for Roll No. "${incoming.rollNo}" conflicts with the workbook; no correction was made.`);
    }
  }
  if (errors.length > 0) failPreflight(errors);

  const existingIds = [...existingStudents.values()].map((student) => student.id);
  if (existingIds.length === 0) return { existingStudents, missingBaselines: students };
  const { data: baselines, error: baselineError } = await supabase
    .from("attendance_baselines")
    .select("student_id, attended_classes, classes_conducted, as_of_date")
    .eq("session_id", sessionId)
    .in("student_id", existingIds);
  if (baselineError) throw new Error(`Could not preflight existing baselines: ${baselineError.message}`);

  const baselineByStudent = new Map(((baselines ?? []) as ExistingBaseline[]).map((baseline) => [baseline.student_id, baseline]));
  const missingBaselines: ImportStudent[] = [];
  for (const incoming of students) {
    const existing = existingStudents.get(incoming.rollNo);
    if (!existing) {
      missingBaselines.push(incoming);
      continue;
    }
    const baseline = baselineByStudent.get(existing.id);
    if (!baseline) {
      missingBaselines.push(incoming);
    } else if (baseline.attended_classes !== incoming.attendedClasses || baseline.classes_conducted !== incoming.classesConducted || baseline.as_of_date !== BASELINE_AS_OF_DATE) {
      errors.push(`Existing baseline for Roll No. "${incoming.rollNo}" conflicts with the workbook; no correction was made.`);
    }
  }
  if (errors.length > 0) failPreflight(errors);
  return { existingStudents, missingBaselines };
}

async function applyImport(
  supabase: ReturnType<typeof createClient>,
  students: ImportStudent[],
  programmes: Map<string, Programme>,
  sessionId: string,
  existingStudents: Map<string, ExistingStudent>,
  missingBaselines: ImportStudent[],
): Promise<void> {
  const newStudents = students.filter((student) => !existingStudents.has(student.rollNo));
  if (newStudents.length > 0) {
    const { data, error } = await supabase
      .from("students")
      .insert(newStudents.map((student) => ({ programme_id: programmes.get(student.programmeCode)!.id, sr_no: student.srNo, roll_no: student.rollNo, name: student.name, active: true })))
      .select("id, programme_id, sr_no, roll_no, name, active");
    if (error) throw new Error(`Failed to insert students: ${error.message}`);
    for (const student of (data ?? []) as ExistingStudent[]) existingStudents.set(student.roll_no, student);
  }

  if (missingBaselines.length > 0) {
    const { error } = await supabase.from("attendance_baselines").insert(
      missingBaselines.map((student) => ({
        session_id: sessionId,
        student_id: existingStudents.get(student.rollNo)!.id,
        attended_classes: student.attendedClasses,
        classes_conducted: student.classesConducted,
        as_of_date: BASELINE_AS_OF_DATE,
      })),
    );
    if (error) throw new Error(`Failed to insert attendance baselines: ${error.message}`);
  }
  console.log(`Applied: inserted ${newStudents.length} student(s) and ${missingBaselines.length} baseline(s).`);
}

async function main(): Promise<void> {
  const { workbookPath, apply } = parseArguments();
  await loadImportEnvironment();
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) usage("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env.import.local.");

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookPath);
  const validation = validateWorkbook(worksheetRows(workbook));
  if (!validation.ok) failPreflight(validation.errors);

  const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { programmes, session } = await resolveReferences(supabase);
  const { existingStudents, missingBaselines } = await preflightExistingData(supabase, validation.students, programmes, session.id);
  const existingCount = validation.students.length - validation.students.filter((student) => !existingStudents.has(student.rollNo)).length;

  console.log(`Validated ${validation.students.length} students; ${existingCount} existing student(s), ${missingBaselines.length} missing baseline(s).`);
  if (!apply) {
    console.log("Dry run complete. No database writes were performed. Re-run with --apply to write students and attendance baselines.");
    return;
  }
  await applyImport(supabase, validation.students, programmes, session.id, existingStudents, missingBaselines);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `Import failed: ${error.message}` : "Import failed.");
  process.exit(1);
});
