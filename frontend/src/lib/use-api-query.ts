import useSWR, { type SWRConfiguration } from "swr";
import { z } from "zod";

import { fetchAndParse } from "@/lib/http";

export const DEFAULT_REFRESH_MS = 30_000;

export function useApiQuery<T>(
  key: string | null,
  schema: z.ZodType<T>,
  config?: SWRConfiguration<T, Error>,
) {
  return useSWR<T, Error>(
    key,
    key ? (path: string) => fetchAndParse(path, schema) : null,
    {
      refreshInterval: DEFAULT_REFRESH_MS,
      revalidateOnFocus: false,
      ...config,
    },
  );
}

export function firstError<T>(...errors: Array<T | null | undefined>): T | undefined {
  return errors.find((err): err is T => err != null);
}