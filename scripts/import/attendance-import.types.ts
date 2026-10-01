export const SESSION_NAME = "November 2026 — MST-2";
export const BASELINE_AS_OF_DATE = "2026-10-01";

export type ProgrammeImportConfig = {
  worksheetName: string;
  programmeCode: string;
  expectedStudentCount: number;
  classesConducted: number;
};

export const PROGRAMME_IMPORT_CONFIGS: readonly ProgrammeImportConfig[] = [
  { worksheetName: "B.Sc. FD 1", programmeCode: "bsc-fd-1", expectedStudentCount: 40, classesConducted: 34 },
  { worksheetName: "B.Com 1", programmeCode: "bcom-1", expectedStudentCount: 22, classesConducted: 32 },
  { worksheetName: "BBA 1", programmeCode: "bba-1", expectedStudentCount: 12, classesConducted: 32 },
] as const;

export const REQUIRED_HEADERS = ["Sr. No.", "Roll No.", "Name of the Student", "total attendance till 01 Oct"] as const;
export type RequiredHeader = (typeof REQUIRED_HEADERS)[number];

export type RawWorksheet = {
  worksheetName: string;
  rows: unknown[][];
};

export type RawStudentRow = {
  worksheetName: string;
  rowNumber: number;
  srNo: unknown;
  rollNo: unknown;
  name: unknown;
  attendedClasses: unknown;
};

export type ImportStudent = {
  worksheetName: string;
  rowNumber: number;
  programmeCode: string;
  srNo: number;
  rollNo: string;
  name: string;
  attendedClasses: number;
  classesConducted: number;
};

export type ValidationResult =
  | { ok: true; students: ImportStudent[] }
  | { ok: false; errors: string[] };
