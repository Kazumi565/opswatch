import { describe, expect, it } from "vitest";

import { safeNextPath } from "@/lib/navigation";

describe("post-login navigation", () => {
  it.each([
    undefined,
    null,
    "",
    "https://example.org",
    "//example.org",
    "/\\example.org",
    "/\t/example.org",
    "/\n/example.org",
    "/..//example.org",
    "/%2e%2e//example.org",
    "/path/..//example.org",
    "javascript:alert(1)",
  ])("rejects unsafe next destination %j", (nextPath) => {
    expect(safeNextPath(nextPath)).toBe("/overview");
  });

  it.each(["/", "/incidents?state=open", "/monitors/12#history"])(
    "preserves local destination %s",
    (nextPath) => {
      expect(safeNextPath(nextPath)).toBe(nextPath);
    },
  );
});
