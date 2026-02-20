import type { components } from "../../../spec/generated/openapi-types";

type ShiftSubmissionCreateRequest = components["schemas"]["ShiftSubmissionCreateRequest"];
type ShiftSubmissionDetail = components["schemas"]["ShiftSubmissionDetail"];

export type ShiftSubmissionRow = {
  id: number;
  employee_id: number;
  year_month: string;
  submitted_at: string;
  source: "employee" | "admin";
  note: string | null;
};

export type ShiftSubmissionDetailRow = {
  target_date: string;
  availability: "available" | "unavailable" | "negotiable";
  memo: string | null;
};

export function toSubmissionInsertInput(
  input: ShiftSubmissionCreateRequest,
  source: "employee" | "admin"
) {
  return {
    yearMonth: input.yearMonth,
    employeeId: input.employeeId,
    note: input.note ?? null,
    source,
    details: input.details.map((d) => ({
      targetDate: d.targetDate,
      availability: d.availability,
      memo: d.memo ?? null,
    })),
  };
}

export function toShiftSubmissionDto(
  row: ShiftSubmissionRow,
  detailRows: ShiftSubmissionDetailRow[]
): components["schemas"]["ShiftSubmission"] {
  const details: ShiftSubmissionDetail[] = detailRows.map((d) => ({
    targetDate: d.target_date,
    availability: d.availability,
    memo: d.memo,
  }));

  return {
    id: row.id,
    employeeId: row.employee_id,
    yearMonth: row.year_month,
    submittedAt: row.submitted_at,
    source: row.source,
    note: row.note,
    details,
  };
}

export function validateShiftSubmissionCreate(input: ShiftSubmissionCreateRequest): string[] {
  const errors: string[] = [];
  if (!/^\d{4}-\d{2}$/.test(input.yearMonth)) {
    errors.push("yearMonth must be YYYY-MM");
  }
  if (!Number.isInteger(input.employeeId) || input.employeeId <= 0) {
    errors.push("employeeId must be a positive integer");
  }
  if (!input.details || input.details.length === 0) {
    errors.push("details must have at least one item");
  }

  const dateSet = new Set<string>();
  for (const d of input.details ?? []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.targetDate)) {
      errors.push(`invalid targetDate: ${d.targetDate}`);
    }
    if (dateSet.has(d.targetDate)) {
      errors.push(`duplicate targetDate: ${d.targetDate}`);
    }
    dateSet.add(d.targetDate);
  }
  return errors;
}
