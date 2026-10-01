import {
  PROGRAMME_IMPORT_CONFIGS,
  REQUIRED_HEADERS,
  type ImportStudent,
  type ProgrammeImportConfig,
  type RawStudentRow,
  type RawWorksheet,
  type ValidationResult,
} from "./attendance-import.types.ts";

const configByWorksheet = new Map(PROGRAMME_IMPORT_CONFIGS.map((config) => [config.worksheetName, config]));

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  return "[unsupported value]";
}

function parsePositiveInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  const text = displayValue(value);
  if (/^[1-9]\d*$/.test(text)) return Number(text);
  return undefined;
}

function parseAttendance(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  const text = displayValue(value);
  if (/^-?\d+$/.test(text)) return Number(text);
  return undefined;
}

function isBlankRow(row: unknown[]): boolean {
  return row.every((cell) => displayValue(cell) === "");
}

/** Extract only the four approved columns from a worksheet's first row/header. */
export function readWorksheetRows(worksheet: RawWorksheet): { rows: RawStudentRow[]; errors: string[] } {
  const errors: string[] = [];
  const [headerRow, ...dataRows] = worksheet.rows;
  if (!headerRow) {
    return { rows: [], errors: [`${worksheet.worksheetName}: worksheet is empty.`] };
  }

  const headerIndexes = new Map<string, number>();
  for (const [index, header] of headerRow.entries()) {
    const value = displayValue(header);
    if (REQUIRED_HEADERS.includes(value as (typeof REQUIRED_HEADERS)[number])) {
      if (headerIndexes.has(value)) {
        errors.push(`${worksheet.worksheetName}: duplicate required header "${value}".`);
      } else {
        headerIndexes.set(value, index);
      }
    }
  }

  for (const header of REQUIRED_HEADERS) {
    if (!headerIndexes.has(header)) errors.push(`${worksheet.worksheetName}: missing required header "${header}".`);
  }
  if (errors.length > 0) return { rows: [], errors };

  const rows: RawStudentRow[] = [];
  for (const [index, row] of dataRows.entries()) {
    const rowNumber = index + 2;
    if (isBlankRow(row)) {
      errors.push(`${worksheet.worksheetName} row ${rowNumber}: empty rows are not allowed in the data range.`);
      continue;
    }

    rows.push({
      worksheetName: worksheet.worksheetName,
      rowNumber,
      srNo: row[headerIndexes.get("Sr. No.")!],
      rollNo: row[headerIndexes.get("Roll No.")!],
      name: row[headerIndexes.get("Name of the Student")!],
      attendedClasses: row[headerIndexes.get("total attendance till 01 Oct")!],
    });
  }

  return { rows, errors };
}

export function validateWorkbook(worksheets: RawWorksheet[]): ValidationResult {
  const errors: string[] = [];
  const seenWorksheetNames = new Set<string>();
  const studentRows: RawStudentRow[] = [];

  for (const worksheet of worksheets) {
    if (seenWorksheetNames.has(worksheet.worksheetName)) {
      errors.push(`Duplicate worksheet "${worksheet.worksheetName}".`);
      continue;
    }
    seenWorksheetNames.add(worksheet.worksheetName);

    if (!configByWorksheet.has(worksheet.worksheetName)) {
      errors.push(`Unexpected worksheet "${worksheet.worksheetName}".`);
      continue;
    }

    const extracted = readWorksheetRows(worksheet);
    errors.push(...extracted.errors);
    studentRows.push(...extracted.rows);
  }

  for (const config of PROGRAMME_IMPORT_CONFIGS) {
    if (!seenWorksheetNames.has(config.worksheetName)) errors.push(`Missing required worksheet "${config.worksheetName}".`);
  }

  const students: ImportStudent[] = [];
  const seenRollNumbers = new Map<string, string>();
  const srNumbersByWorksheet = new Map<string, Set<number>>();

  for (const row of studentRows) {
    const config = configByWorksheet.get(row.worksheetName)!;
    const location = `${row.worksheetName} row ${row.rowNumber}`;
    const srNo = parsePositiveInteger(row.srNo);
    const rollNo = displayValue(row.rollNo);
    const name = displayValue(row.name);
    const attendedClasses = parseAttendance(row.attendedClasses);

    if (srNo === undefined) {
      errors.push(`${location}: Sr. No. must be a positive integer.`);
    } else {
      const programmeSrNumbers = srNumbersByWorksheet.get(row.worksheetName) ?? new Set<number>();
      if (programmeSrNumbers.has(srNo)) errors.push(`${location}: duplicate Sr. No. ${srNo}.`);
      programmeSrNumbers.add(srNo);
      srNumbersByWorksheet.set(row.worksheetName, programmeSrNumbers);
    }

    if (!rollNo) {
      errors.push(`${location}: Roll No. is required.`);
    } else {
      const firstLocation = seenRollNumbers.get(rollNo);
      if (firstLocation) errors.push(`${location}: duplicate Roll No. "${rollNo}" (first seen at ${firstLocation}).`);
      else seenRollNumbers.set(rollNo, location);
    }

    if (!name || name === "[unsupported value]") errors.push(`${location}: Name of the Student is required.`);
    if (attendedClasses === undefined || attendedClasses < 0 || attendedClasses > config.classesConducted) {
      errors.push(`${location}: total attendance till 01 Oct must be an integer from 0 to ${config.classesConducted}.`);
    }

    if (srNo !== undefined && rollNo && name && name !== "[unsupported value]" && attendedClasses !== undefined && attendedClasses >= 0 && attendedClasses <= config.classesConducted) {
      students.push({ ...row, programmeCode: config.programmeCode, srNo, rollNo, name, attendedClasses, classesConducted: config.classesConducted });
    }
  }

  for (const config of PROGRAMME_IMPORT_CONFIGS) {
    const count = studentRows.filter((row) => row.worksheetName === config.worksheetName).length;
    if (count !== config.expectedStudentCount) {
      errors.push(`${config.worksheetName}: expected ${config.expectedStudentCount} students, found ${count}.`);
    }
  }
  if (studentRows.length !== 74) errors.push(`Expected 74 students across all worksheets, found ${studentRows.length}.`);

  return errors.length > 0 ? { ok: false, errors } : { ok: true, students };
}

export function getProgrammeConfig(worksheetName: string): ProgrammeImportConfig | undefined {
  return configByWorksheet.get(worksheetName);
}
