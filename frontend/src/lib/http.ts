import { z } from "zod";

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function fetchAndParse<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers ?? {});

  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(path, {
    ...init,
    cache: "no-store",
    headers,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(`Request failed (${res.status}): ${body || path}`, res.status);
  }

  const data = await res.json();
  return schema.parse(data);
}