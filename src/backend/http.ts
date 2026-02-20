import type { Response } from "express";
import type { components } from "../../spec/generated/openapi-types";

type ErrorResponse = components["schemas"]["ErrorResponse"];

export function ok<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ data });
}

export function fail(res: Response, status: number, code: string, message: string) {
  const payload: ErrorResponse = {
    error: { code, message },
  };
  return res.status(status).json(payload);
}
