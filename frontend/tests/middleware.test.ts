import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { middleware } from "../middleware";

function buildRequest(url: string, cookie?: string) {
  return new NextRequest(url, {
    headers: cookie ? { cookie } : undefined,
  });
}

describe("frontend auth middleware", () => {
  it("redirects unauthenticated dashboard requests to login", () => {
    const response = middleware(buildRequest("http://localhost:3000/overview"));
    expect(response.headers.get("location")).toBe("http://localhost:3000/login?next=%2Foverview");
  });

  it("allows dashboard requests that already have a session cookie", () => {
    const response = middleware(buildRequest("http://localhost:3000/overview", "opswatch_session=abc"));
    expect(response.headers.get("location")).toBeNull();
  });

  it("does not intercept proxied auth api requests", () => {
    const response = middleware(buildRequest("http://localhost:3000/api/auth/login"));
    expect(response.headers.get("location")).toBeNull();
  });
});
