import type { components } from "../../spec/generated/openapi-types";

export type UserDto = components["schemas"]["User"];
export type EmployeeDto = components["schemas"]["Employee"];
export type ShiftMonthDto = components["schemas"]["ShiftMonth"];
export type ShiftSubmissionDto = components["schemas"]["ShiftSubmission"];
export type ShiftSubmissionDetailDto = components["schemas"]["ShiftSubmissionDetail"];
export type SyncJobDto = components["schemas"]["SyncJob"];
export type SyncJobItemDto = components["schemas"]["SyncJobItem"];
export type AuditLogDto = components["schemas"]["AuditLog"];

export type ShiftSubmissionCreateDto = components["schemas"]["ShiftSubmissionCreateRequest"];
export type ShiftSubmissionAdminUpdateDto = components["schemas"]["AdminShiftSubmissionUpdateRequest"];
export type EmployeeCreateDto = components["schemas"]["EmployeeCreateRequest"];
export type EmployeeUpdateDto = components["schemas"]["EmployeeUpdateRequest"];
export type CreateSyncJobDto = components["schemas"]["CreateSyncJobRequest"];
