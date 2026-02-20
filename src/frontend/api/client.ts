import type { components } from "../../../spec/generated/openapi-types";
import type {
  ErrorPayload,
  RequestBody,
  SuccessResponse,
} from "../../shared/openapi-type-helpers";

type ApiPath = keyof import("../../../spec/generated/openapi-types").paths;
type ApiMethod = "get" | "post" | "patch";

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly payload?: ErrorPayload;

  constructor(message: string, status: number, payload?: ErrorPayload) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.payload = payload;
  }
}

export class ApiClient {
  constructor(
    private readonly baseUrl = "/api/v1",
    private readonly token?: string
  ) {}

  private async request<P extends ApiPath, M extends ApiMethod>(args: {
    path: P;
    method: M;
    body?: RequestBody<P, M>;
  }): Promise<SuccessResponse<P, M>> {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (args.body !== undefined) headers["Content-Type"] = "application/json";

    const res = await fetch(`${this.baseUrl}${args.path}`, {
      method: args.method.toUpperCase(),
      headers,
      body: args.body !== undefined ? JSON.stringify(args.body) : undefined,
    });

    const isJson = res.headers.get("content-type")?.includes("application/json");
    const payload = isJson ? await res.json() : undefined;

    if (!res.ok) {
      throw new ApiClientError("API request failed", res.status, payload as ErrorPayload);
    }
    return payload as SuccessResponse<P, M>;
  }

  getMe() {
    return this.request<"/me", "get">({ path: "/me", method: "get" });
  }

  getOpenShiftMonths() {
    return this.request<"/shift-months/open", "get">({
      path: "/shift-months/open",
      method: "get",
    });
  }

  getActiveEmployees() {
    return this.request<"/employees/active", "get">({
      path: "/employees/active",
      method: "get",
    });
  }

  submitShift(body: components["schemas"]["ShiftSubmissionCreateRequest"]) {
    return this.request<"/shift-submissions", "post">({
      path: "/shift-submissions",
      method: "post",
      body,
    });
  }

  getMySubmission(yearMonth: string) {
    return this.request<"/shift-submissions/my/{yearMonth}", "get">({
      path: `/shift-submissions/my/${yearMonth}` as "/shift-submissions/my/{yearMonth}",
      method: "get",
    });
  }

  getAdminMonthlySubmissions(yearMonth: string) {
    return this.request<"/admin/shift-submissions/{yearMonth}", "get">({
      path: `/admin/shift-submissions/${yearMonth}` as "/admin/shift-submissions/{yearMonth}",
      method: "get",
    });
  }

  updateAdminSubmission(
    id: number,
    body: components["schemas"]["AdminShiftSubmissionUpdateRequest"]
  ) {
    return this.request<"/admin/shift-submissions/by-id/{id}", "patch">({
      path: `/admin/shift-submissions/by-id/${id}` as "/admin/shift-submissions/by-id/{id}",
      method: "patch",
      body,
    });
  }
}
