import fs from "fs/promises";
import path from "path";
import type { components } from "../../../spec/generated/openapi-types";
import {
  addSyncJobItem,
  createSyncJob,
  finishSyncJob,
  listEmployees,
} from "../db";

type ShiftSubmission = components["schemas"]["ShiftSubmission"];
type SyncTriggerType = components["schemas"]["SyncJob"]["triggerType"];

type CsvRow = Record<string, string | number>;
type RowHashMap = Record<string, string>;

type ExportIndex = {
  latestVersion: number;
  latestFilePath: string | null;
  rowHashes: RowHashMap;
  files: Array<{ version: number; fileName: string; filePath: string; createdAt: string }>;
};

type ExportDiff = {
  inserted: number;
  updated: number;
  deleted: number;
};

type CsvSyncOptions = {
  yearMonth: string;
  triggerType: SyncTriggerType;
  triggeredByUserId: number;
  submissions: ShiftSubmission[];
};

const DEFAULT_INDEX: ExportIndex = {
  latestVersion: 0,
  latestFilePath: null,
  rowHashes: {},
  files: [],
};

function csvEscape(value: string | number | null | undefined): string {
  const raw = value === null || value === undefined ? "" : String(value);
  if (!/[",\r\n]/.test(raw)) return raw;
  return `"${raw.replace(/"/g, "\"\"")}"`;
}

function rowsToCsv(headers: string[], rows: CsvRow[]): string {
  const lines: string[] = [];
  lines.push(headers.join(","));
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function makeRowHashes(rows: CsvRow[], keyFn: (row: CsvRow) => string): RowHashMap {
  const out: RowHashMap = {};
  for (const row of rows) {
    const key = keyFn(row);
    out[key] = JSON.stringify(row);
  }
  return out;
}

function calcDiff(before: RowHashMap, after: RowHashMap): ExportDiff {
  let inserted = 0;
  let updated = 0;
  let deleted = 0;

  for (const [k, v] of Object.entries(after)) {
    if (!(k in before)) inserted += 1;
    else if (before[k] !== v) updated += 1;
  }
  for (const k of Object.keys(before)) {
    if (!(k in after)) deleted += 1;
  }
  return { inserted, updated, deleted };
}

async function readIndex(indexPath: string): Promise<ExportIndex> {
  try {
    const raw = await fs.readFile(indexPath, "utf-8");
    const parsed = JSON.parse(raw) as ExportIndex;
    return {
      latestVersion: parsed.latestVersion ?? 0,
      latestFilePath: parsed.latestFilePath ?? null,
      rowHashes: parsed.rowHashes ?? {},
      files: parsed.files ?? [],
    };
  } catch {
    return { ...DEFAULT_INDEX };
  }
}

async function writeCsvWithDiff(options: {
  baseDir: string;
  filePrefix: string;
  headers: string[];
  rows: CsvRow[];
  keyFn: (row: CsvRow) => string;
}): Promise<{
  changed: boolean;
  diff: ExportDiff;
  artifact: { fileName: string; filePath: string; version: number } | null;
}> {
  await fs.mkdir(options.baseDir, { recursive: true });
  const indexPath = path.join(options.baseDir, "index.json");
  const index = await readIndex(indexPath);
  const rowHashes = makeRowHashes(options.rows, options.keyFn);
  const diff = calcDiff(index.rowHashes, rowHashes);
  const changed = diff.inserted + diff.updated + diff.deleted > 0 || !index.latestFilePath;

  if (!changed) {
    const latest = index.files[index.files.length - 1] ?? null;
    return {
      changed: false,
      diff,
      artifact: latest
        ? { fileName: latest.fileName, filePath: latest.filePath, version: latest.version }
        : null,
    };
  }

  const version = index.latestVersion + 1;
  const ts = Date.now();
  const fileName = `${options.filePrefix}_v${String(version).padStart(4, "0")}_${ts}.csv`;
  const filePath = path.join(options.baseDir, fileName);
  await fs.writeFile(filePath, rowsToCsv(options.headers, options.rows), "utf-8");

  index.latestVersion = version;
  index.latestFilePath = filePath;
  index.rowHashes = rowHashes;
  index.files.push({
    version,
    fileName,
    filePath,
    createdAt: new Date().toISOString(),
  });
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2), "utf-8");
  return { changed: true, diff, artifact: { fileName, filePath, version } };
}

function buildSubmissionRows(submission: ShiftSubmission, employeeName: string): CsvRow[] {
  return submission.details.map((d) => ({
    submission_id: submission.id,
    year_month: submission.yearMonth,
    employee_id: submission.employeeId,
    employee_name: employeeName,
    target_date: d.targetDate,
    availability: d.availability,
    time_range: d.memo ?? "",
  }));
}

async function processSubmission(
  submission: ShiftSubmission,
  employeeNameById: Map<number, string>
): Promise<{ rows: CsvRow[] }> {
  await new Promise((resolve) => setTimeout(resolve, 10));
  if (submission.details.length === 0) throw new Error("details is empty");
  const employeeName = employeeNameById.get(submission.employeeId) ?? `employee-${submission.employeeId}`;
  return { rows: buildSubmissionRows(submission, employeeName) };
}

export async function exportEmployeesCsvDiff(): Promise<{
  changed: boolean;
  diff: ExportDiff;
  artifact: { fileName: string; filePath: string; version: number } | null;
}> {
  const employees = await listEmployees();
  const rows: CsvRow[] = employees
    .map((e) => ({
      employee_id: e.id,
      employee_code: e.employeeCode,
      display_name: e.displayName,
      department: e.department ?? "",
      is_active: e.isActive ? 1 : 0,
    }))
    .sort((a, b) => Number(a.employee_id) - Number(b.employee_id));

  return writeCsvWithDiff({
    baseDir: path.resolve(process.cwd(), "storage", "csv", "employees"),
    filePrefix: "employees",
    headers: ["employee_id", "employee_code", "display_name", "department", "is_active"],
    rows,
    keyFn: (row) => String(row.employee_id),
  });
}

export async function runCsvSync(options: CsvSyncOptions) {
  const { yearMonth, triggerType, submissions, triggeredByUserId } = options;
  if (submissions.length === 0) throw new Error("no submissions for target month");

  const job = await createSyncJob({
    triggeredByUserId,
    triggerType,
    spreadsheetId: "csv-export",
    sheetName: `csv_${yearMonth}`,
    status: "running",
  });

  const employees = await listEmployees();
  const employeeNameById = new Map<number, string>(employees.map((e) => [e.id, e.displayName]));
  const settled = await Promise.allSettled(
    submissions.map((s) => processSubmission(s, employeeNameById))
  );

  const csvRows: CsvRow[] = [];
  let failedCount = 0;
  for (let i = 0; i < settled.length; i += 1) {
    const result = settled[i];
    const submission = submissions[i];
    if (result.status === "fulfilled") {
      csvRows.push(...result.value.rows);
      await addSyncJobItem({
        syncJobId: job.id,
        shiftSubmissionId: submission.id,
        status: "success",
      });
    } else {
      failedCount += 1;
      await addSyncJobItem({
        syncJobId: job.id,
        shiftSubmissionId: submission.id,
        status: "failed",
        errorMessage: result.reason instanceof Error ? result.reason.message : "csv export failed",
      });
    }
  }

  csvRows.sort((a, b) => {
    const left = `${a.submission_id}:${a.target_date}`;
    const right = `${b.submission_id}:${b.target_date}`;
    return left.localeCompare(right);
  });

  const submissionsExport = await writeCsvWithDiff({
    baseDir: path.resolve(process.cwd(), "storage", "csv", yearMonth),
    filePrefix: `${yearMonth.replace("-", "")}_submissions`,
    headers: [
      "submission_id",
      "year_month",
      "employee_id",
      "employee_name",
      "target_date",
      "availability",
      "time_range",
    ],
    rows: csvRows,
    keyFn: (row) => `${row.submission_id}:${row.target_date}`,
  });
  const employeesExport = await exportEmployeesCsvDiff();

  const status = failedCount > 0 ? "failed" : "success";
  await finishSyncJob({
    id: job.id,
    status,
    errorMessage: failedCount > 0 ? "some rows failed during parallel csv export" : null,
  });

  return {
    job: {
      ...job,
      status,
      finishedAt: new Date().toISOString(),
      errorMessage: failedCount > 0 ? "some rows failed during parallel csv export" : null,
    },
    summary: {
      total: submissions.length,
      success: submissions.length - failedCount,
      failed: failedCount,
      submissionDiff: submissionsExport.diff,
      employeeDiff: employeesExport.diff,
    },
    artifact: {
      yearMonth,
      submissionsCsv: submissionsExport.artifact,
      employeesCsv: employeesExport.artifact,
      changed: submissionsExport.changed || employeesExport.changed,
    },
  };
}
