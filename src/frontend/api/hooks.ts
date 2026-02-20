import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import type { components } from "../../../spec/generated/openapi-types";
import { ApiClient } from "./client";

type MeResponse = components["schemas"]["MeResponse"];
type OpenShiftMonthsResponse = components["schemas"]["OpenShiftMonthsResponse"];
type ActiveEmployeesResponse = components["schemas"]["ActiveEmployeesResponse"];
type ShiftSubmissionResponse = components["schemas"]["ShiftSubmissionResponse"];

export const queryKeys = {
  me: ["me"] as const,
  openShiftMonths: ["shift-months", "open"] as const,
  activeEmployees: ["employees", "active"] as const,
  mySubmission: (yearMonth: string) => ["shift-submissions", "my", yearMonth] as const,
  adminMonthlySubmissions: (yearMonth: string) =>
    ["admin", "shift-submissions", yearMonth] as const,
};

export function useMeQuery(
  client: ApiClient,
  options?: Omit<UseQueryOptions<MeResponse>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: () => client.getMe(),
    ...options,
  });
}

export function useOpenShiftMonthsQuery(
  client: ApiClient,
  options?: Omit<UseQueryOptions<OpenShiftMonthsResponse>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: queryKeys.openShiftMonths,
    queryFn: () => client.getOpenShiftMonths(),
    ...options,
  });
}

export function useActiveEmployeesQuery(
  client: ApiClient,
  options?: Omit<UseQueryOptions<ActiveEmployeesResponse>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: queryKeys.activeEmployees,
    queryFn: () => client.getActiveEmployees(),
    ...options,
  });
}

export function useMySubmissionQuery(
  client: ApiClient,
  yearMonth: string,
  options?: Omit<UseQueryOptions<ShiftSubmissionResponse>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: queryKeys.mySubmission(yearMonth),
    queryFn: () => client.getMySubmission(yearMonth),
    ...options,
  });
}

export function useSubmitShiftMutation(
  client: ApiClient,
  options?: UseMutationOptions<
    ShiftSubmissionResponse,
    Error,
    components["schemas"]["ShiftSubmissionCreateRequest"]
  >
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body) => client.submitShift(body),
    onSuccess: (_data, variables, onMutateResult, context) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mySubmission(variables.yearMonth) });
      queryClient.invalidateQueries({ queryKey: queryKeys.adminMonthlySubmissions(variables.yearMonth) });
      options?.onSuccess?.(_data, variables, onMutateResult, context);
    },
    ...options,
  });
}
