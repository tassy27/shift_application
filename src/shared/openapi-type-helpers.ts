import type { components, paths } from "../../spec/generated/openapi-types";

export type ApiPaths = paths;
export type ApiComponents = components;

export type HttpMethod = "get" | "post" | "patch" | "put" | "delete";

type Operation<
  P extends keyof ApiPaths,
  M extends HttpMethod
> = ApiPaths[P] extends Record<M, infer Op> ? Op : never;

type JsonBody<T> = T extends { content: { "application/json": infer B } } ? B : never;

type SuccessCodes = 200 | 201 | 202;

type ResponseForCode<Op, C extends number> = Op extends { responses: Record<C, infer R> } ? R : never;

export type RequestBody<
  P extends keyof ApiPaths,
  M extends HttpMethod
> = JsonBody<Operation<P, M> extends { requestBody: infer RB } ? RB : never>;

export type SuccessResponse<
  P extends keyof ApiPaths,
  M extends HttpMethod
> =
  | JsonBody<ResponseForCode<Operation<P, M>, 200>>
  | JsonBody<ResponseForCode<Operation<P, M>, 201>>
  | JsonBody<ResponseForCode<Operation<P, M>, 202>>;

export type PathParams<
  P extends keyof ApiPaths,
  M extends HttpMethod
> = Operation<P, M> extends { parameters: { path: infer V } } ? V : never;

export type QueryParams<
  P extends keyof ApiPaths,
  M extends HttpMethod
> = Operation<P, M> extends { parameters: { query: infer V } } ? V : never;

export type ErrorPayload = components["schemas"]["ErrorResponse"];
