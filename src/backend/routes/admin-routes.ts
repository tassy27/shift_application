import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { z } from "zod";
import type { components } from "../../../spec/generated/openapi-types";
import { fail, ok } from "../http";
import { requireAdmin } from "../auth";
import {
  createEmployee,
  getLocalActorUserId,
  getSubmissionById,
  getSyncJobById,
  listEmployees,
  listSubmissionsByMonth,
  listSyncJobItems,
  listSyncJobs,
  listUnsubmittedEmployees,
  updateEmployee,
  updateSubmissionById,
} from "../db";
import { exportEmployeesCsvDiff, runCsvSync } from "../services/sync-service";

const updateSchema: z.ZodType<components["schemas"]["AdminShiftSubmissionUpdateRequest"]> = z.object({
  note: z.string().optional(),
  details: z
    .array(
      z.object({
        targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        availability: z.enum(["available", "unavailable", "negotiable"]),
        memo: z.string().nullable().optional(),
      })
    )
    .optional(),
});

const employeeCreateSchema: z.ZodType<components["schemas"]["EmployeeCreateRequest"]> = z.object({
  employeeCode: z.string().min(1),
  displayName: z.string().min(1),
  department: z.string().optional(),
  joinedOn: z.string().optional(),
});

const employeeUpdateSchema: z.ZodType<components["schemas"]["EmployeeUpdateRequest"]> = z.object({
  displayName: z.string().optional(),
  department: z.string().optional(),
  isActive: z.boolean().optional(),
  leftOn: z.string().optional(),
});

const syncJobSchema = z.object({
  yearMonth: z.string().regex(/^\d{4}-\d{2}$/),
  spreadsheetId: z.string().optional(),
  sheetName: z.string().optional(),
});

export const adminRouter = Router();
adminRouter.use(requireAdmin);

adminRouter.get("/shift-submissions/:yearMonth", async (req, res) => {
  const yearMonth = req.params.yearMonth;
  const list = await listSubmissionsByMonth(yearMonth);
  return ok(res, list);
});

adminRouter.get("/unsubmitted/:yearMonth", async (req, res) => {
  const yearMonth = req.params.yearMonth;
  const unsubmitted = await listUnsubmittedEmployees(yearMonth);
  return ok(res, unsubmitted);
});

adminRouter.patch("/shift-submissions/by-id/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "BAD_REQUEST", "invalid payload");
  const id = Number(req.params.id);
  const updated = await updateSubmissionById(id, {
    note: parsed.data.note,
    details: parsed.data.details?.map((d) => ({
      targetDate: d.targetDate,
      availability: d.availability,
      memo: d.memo ?? null,
    })),
  });
  if (!updated) return fail(res, 404, "NOT_FOUND", "submission not found");
  try {
    const targets = await listSubmissionsByMonth(updated.yearMonth);
    const actorUserId = req.user?.dbUserId ?? (await getLocalActorUserId());
    await runCsvSync({
      yearMonth: updated.yearMonth,
      triggerType: "auto",
      triggeredByUserId: actorUserId,
      submissions: targets,
    });
  } catch {
    // no-op: update itself should succeed even if csv export failed
  }
  return ok(res, updated);
});

adminRouter.get("/employees", async (_req, res) => {
  const employees = await listEmployees();
  return ok(res, employees);
});

adminRouter.post("/employees", async (req, res) => {
  const parsed = employeeCreateSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "BAD_REQUEST", "invalid payload");
  try {
    const created = await createEmployee({
      employeeCode: parsed.data.employeeCode,
      displayName: parsed.data.displayName,
      department: parsed.data.department,
      joinedOn: parsed.data.joinedOn,
    });
    await exportEmployeesCsvDiff();
    return ok(res, created, 201);
  } catch (e) {
    return fail(res, 409, "CONFLICT", e instanceof Error ? e.message : "employee create failed");
  }
});

adminRouter.patch("/employees/:id", async (req, res) => {
  const parsed = employeeUpdateSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "BAD_REQUEST", "invalid payload");
  const id = Number(req.params.id);
  const updated = await updateEmployee(id, {
    displayName: parsed.data.displayName,
    department: parsed.data.department,
    isActive: parsed.data.isActive,
    leftOn: parsed.data.leftOn,
  });
  if (!updated) return fail(res, 404, "NOT_FOUND", "employee not found");
  try {
    await exportEmployeesCsvDiff();
  } catch {
    // no-op
  }
  return ok(res, updated);
});

adminRouter.post("/sync-jobs", async (req, res) => {
  const parsed = syncJobSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "BAD_REQUEST", "invalid sync payload");

  const { yearMonth } = parsed.data;
  const targets = await listSubmissionsByMonth(yearMonth);
  if (targets.length === 0) return fail(res, 400, "BAD_REQUEST", "no submissions for target month");

  try {
    const actorUserId = req.user?.dbUserId ?? (await getLocalActorUserId());
    const result = await runCsvSync({
      yearMonth,
      triggerType: "manual",
      triggeredByUserId: actorUserId,
      submissions: targets,
    });
    return ok(res, result, 202);
  } catch (e) {
    return fail(res, 500, "SYNC_FAILED", e instanceof Error ? e.message : "sync failed");
  }
});

adminRouter.get("/sync-jobs", async (_req, res) => {
  const jobs = await listSyncJobs();
  return ok(res, jobs);
});

adminRouter.get("/sync-jobs/:id", async (req, res) => {
  const id = Number(req.params.id);
  const job = await getSyncJobById(id);
  if (!job) return fail(res, 404, "NOT_FOUND", "sync job not found");
  const items = await listSyncJobItems(id);
  const submission = await getSubmissionById(items[0]?.shiftSubmissionId ?? -1);
  let artifact: { fileName: string; filePath: string; version: number } | null = null;
  if (submission) {
    const indexPath = path.resolve(process.cwd(), "storage", "csv", submission.yearMonth, "index.json");
    try {
      const raw = await fs.readFile(indexPath, "utf-8");
      const parsed = JSON.parse(raw) as {
        files: Array<{ version: number; fileName: string; filePath: string }>;
      };
      artifact = parsed.files?.[parsed.files.length - 1] ?? null;
    } catch {
      artifact = null;
    }
  }
  return ok(res, {
    job,
    items,
    hint: submission ? { yearMonth: submission.yearMonth } : null,
    artifact,
  });
});
