import { Router } from "express";
import { z } from "zod";
import { fail, ok } from "../http";
import {
  createSubmission,
  ensureEmployeeForUser,
  findUserIdByEmail,
  findSubmissionByEmployeeAndMonth,
  getLocalActorUserId,
  listActiveEmployees,
  listOpenShiftMonths,
  listSubmissionsByMonth,
} from "../db";
import { validateShiftSubmissionCreate } from "../dto/shift-submission-dto";
import { runCsvSync } from "../services/sync-service";

const submissionSchema = z.object({
  yearMonth: z.string().regex(/^\d{4}-\d{2}$/),
  employeeId: z.union([z.number(), z.string()]).optional(),
  note: z.string().optional(),
  details: z
    .array(
      z.object({
        targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        availability: z.enum(["available", "unavailable", "negotiable"]),
        memo: z.string().nullable().optional(),
      })
    )
    .min(1),
});

function toPositiveInt(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? value : null;
  }
  if (typeof value === "string") {
    if (!/^\d+$/.test(value)) return null;
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

export const employeeRouter = Router();

employeeRouter.get("/shift-months/open", async (_req, res) => {
  const months = await listOpenShiftMonths();
  ok(res, months);
});

employeeRouter.get("/employees/active", async (_req, res) => {
  const employees = await listActiveEmployees();
  ok(res, employees);
});

employeeRouter.get("/shift-submissions/my/:yearMonth", async (req, res) => {
  const yearMonth = req.params.yearMonth;
  const fallbackUserId =
    req.user?.dbUserId ??
    (req.user?.email ? await findUserIdByEmail(req.user.email) : null);
  const linkedEmployeeId = fallbackUserId
    ? await ensureEmployeeForUser(fallbackUserId)
    : null;
  const employeeId =
    toPositiveInt(linkedEmployeeId) ??
    toPositiveInt(req.user?.employeeId) ??
    toPositiveInt(req.header("x-employee-id"));
  if (!employeeId) return fail(res, 400, "BAD_REQUEST", "employee context is missing");
  const found = await findSubmissionByEmployeeAndMonth(employeeId, yearMonth);
  if (!found) return fail(res, 404, "NOT_FOUND", "submission not found");
  return ok(res, found);
});

employeeRouter.post("/shift-submissions", async (req, res) => {
  const parsed = submissionSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 400, "BAD_REQUEST", parsed.error.issues.map((i) => i.message).join(", "));
  }
  const payload = parsed.data;
  const fallbackUserId =
    req.user?.dbUserId ??
    (req.user?.email ? await findUserIdByEmail(req.user.email) : null);
  const linkedEmployeeId = fallbackUserId
    ? await ensureEmployeeForUser(fallbackUserId)
    : null;
  let employeeId =
    toPositiveInt(linkedEmployeeId) ??
    toPositiveInt(req.user?.employeeId) ??
    toPositiveInt(payload.employeeId) ??
    toPositiveInt(req.header("x-employee-id"));
  if (!employeeId) {
    if (!(req.app.locals.appConfig?.useAuth)) {
      const active = await listActiveEmployees();
      employeeId = toPositiveInt(active[0]?.id);
    }
  }
  if (!employeeId) return fail(res, 400, "BAD_REQUEST", "employee context is missing");

  const normalizedPayload = { ...payload, employeeId };
  const validationErrors = validateShiftSubmissionCreate(normalizedPayload);
  if (validationErrors.length > 0) {
    return fail(res, 400, "BAD_REQUEST", validationErrors.join(", "));
  }

  const dup = await findSubmissionByEmployeeAndMonth(employeeId, payload.yearMonth);
  if (dup) return fail(res, 409, "CONFLICT", "already submitted for this employee and month");

  const actorUserId = req.user?.dbUserId ?? (await getLocalActorUserId());
  const created = await createSubmission({
    employeeId,
    yearMonth: payload.yearMonth,
    note: payload.note,
    source: "employee",
    submittedByUserId: actorUserId,
    details: payload.details.map((d) => ({
      targetDate: d.targetDate,
      availability: d.availability,
      memo: d.memo ?? null,
    })),
  });

  let autoSync: unknown = null;
  try {
    const monthlySubmissions = await listSubmissionsByMonth(payload.yearMonth);
    autoSync = await runCsvSync({
      yearMonth: payload.yearMonth,
      triggerType: "auto",
      triggeredByUserId: actorUserId,
      submissions: monthlySubmissions,
    });
  } catch (e) {
    autoSync = { error: e instanceof Error ? e.message : "auto sync failed" };
  }
  return res.status(201).json({ data: created, autoSync });
});
