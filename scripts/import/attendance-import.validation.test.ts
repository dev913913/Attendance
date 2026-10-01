import assert from "node:assert/strict";
import test from "node:test";
import { PROGRAMME_IMPORT_CONFIGS, REQUIRED_HEADERS, type RawWorksheet } from "./attendance-import.types.ts";
import { validateWorkbook } from "./attendance-import.validation.ts";

function worksheet(name: string, count: number, attendance: number): RawWorksheet {
  return {
    worksheetName: name,
    rows: [
      [...REQUIRED_HEADERS],
      ...Array.from({ length: count }, (_, index) => [index + 1, `${name.replaceAll(/[^A-Za-z0-9]/g, "")}-${index + 1}`, `Student ${index + 1}`, attendance]),
    ],
  };
}

function validWorkbook(): RawWorksheet[] {
  return PROGRAMME_IMPORT_CONFIGS.map((config) => worksheet(config.worksheetName, config.expectedStudentCount, config.classesConducted));
}

test("accepts exactly 74 valid students and normalizes values", () => {
  const result = validateWorkbook(validWorkbook());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.students.length, 74);
  assert.deepEqual(result.students.map((student) => student.programmeCode).filter((code) => code === "bsc-fd-1").length, 40);
  assert.equal(result.students[0].classesConducted, 34);
});

test("collects validation errors for duplicate and invalid values without accepting the workbook", () => {
  const workbook = validWorkbook();
  workbook[0].rows[1] = [1, "duplicate-roll", "", 35];
  workbook[1].rows[1] = [1, "duplicate-roll", "Student", -1];
  workbook[2].rows.splice(2, 1);
  workbook.push({ worksheetName: "Unexpected", rows: [[...REQUIRED_HEADERS]] });

  const result = validateWorkbook(workbook);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.errors.some((error) => error.includes("Name of the Student is required")));
  assert.ok(result.errors.some((error) => error.includes("duplicate Roll No.")));
  assert.ok(result.errors.some((error) => error.includes("0 to 34")));
  assert.ok(result.errors.some((error) => error.includes("0 to 32")));
  assert.ok(result.errors.some((error) => error.includes("expected 12 students, found 11")));
  assert.ok(result.errors.some((error) => error.includes("Unexpected worksheet")));
});

test("rejects missing headers and empty data rows", () => {
  const workbook = validWorkbook();
  workbook[0].rows[0] = ["Sr. No.", "Roll No.", "Name of the Student"];
  workbook[1].rows[3] = ["", "", "", ""];

  const result = validateWorkbook(workbook);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.errors.some((error) => error.includes("missing required header \"total attendance till 01 Oct\"")));
  assert.ok(result.errors.some((error) => error.includes("empty rows are not allowed")));
});
