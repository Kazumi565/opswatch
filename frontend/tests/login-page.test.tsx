import { beforeEach, describe, expect, it, vi } from "vitest";

import LoginPage from "../app/login/page";

const { fetchCurrentUser, redirect } = vi.hoisted(() => ({
  fetchCurrentUser: vi.fn(),
  redirect: vi.fn((): never => {
    throw new Error("redirect");
  }),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [{ name: "opswatch_session", value: "test-session" }] }),
}));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/server-auth", () => ({ fetchCurrentUser }));

beforeEach(() => {
  vi.clearAllMocks();
  fetchCurrentUser.mockResolvedValue({ id: 1 });
});

describe("login page redirect", () => {
  it.each([
    "//example.org",
    "/\\example.org",
    "/\t/example.org",
    "https://example.org",
    "/..//example.org",
    "/%2e%2e//example.org",
  ])(
    "keeps signed-in users on site for next=%j",
    async (next) => {
      await expect(LoginPage({ searchParams: Promise.resolve({ next }) })).rejects.toThrow("redirect");
      expect(redirect).toHaveBeenCalledWith("/overview");
      expect(fetchCurrentUser).toHaveBeenCalledWith("opswatch_session=test-session");
    },
  );

  it("validates the first value of repeated next parameters", async () => {
    await expect(
      LoginPage({ searchParams: Promise.resolve({ next: ["//example.org", "/incidents"] }) }),
    ).rejects.toThrow("redirect");
    expect(redirect).toHaveBeenCalledWith("/overview");
  });

  it("rejects a protocol-relative destination decoded from the query string", async () => {
    const next = new URLSearchParams("next=%2F%2Fexample.org").get("next")!;
    await expect(LoginPage({ searchParams: Promise.resolve({ next }) })).rejects.toThrow("redirect");
    expect(redirect).toHaveBeenCalledWith("/overview");
  });

  it("preserves a local destination and its query for signed-in users", async () => {
    await expect(
      LoginPage({ searchParams: Promise.resolve({ next: "/incidents?state=open" }) }),
    ).rejects.toThrow("redirect");
    expect(redirect).toHaveBeenCalledWith("/incidents?state=open");
  });

  it("passes the validated destination to the form for signed-out users", async () => {
    fetchCurrentUser.mockResolvedValue(null);
    const form = await LoginPage({ searchParams: Promise.resolve({ next: "//example.org" }) });
    expect(redirect).not.toHaveBeenCalled();
    expect(form.props.nextPath).toBe("/overview");
  });
});
