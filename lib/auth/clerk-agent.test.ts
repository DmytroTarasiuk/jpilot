import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  claimAgentSession: vi.fn(),
  ensureTenantIdentity: vi.fn(),
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: () => ({ authenticateRequest: mocks.authenticateRequest }),
}));

vi.mock("../db/tenancy", () => ({
  claimAgentSession: mocks.claimAgentSession,
  ensureTenantIdentity: mocks.ensureTenantIdentity,
}));

import { clerkAppAuth } from "./clerk-agent";

describe("Clerk Eve route authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CLERK_SECRET_KEY", "test-secret");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "test-publishable");
    mocks.authenticateRequest.mockResolvedValue({
      isAuthenticated: true,
      toAuth: () => ({
        userId: "clerk-user-1",
        orgId: null,
        orgRole: null,
        sessionClaims: { iss: "https://clerk.test" },
      }),
    });
    mocks.ensureTenantIdentity.mockResolvedValue({
      tenantId: "tenant-1",
      userId: "user-1",
      role: "owner",
    });
    mocks.claimAgentSession.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("atomically claims an ID-addressed session before accepting its first request", async () => {
    const authenticate = clerkAppAuth();

    const result = await authenticate(
      new Request("https://jobpilot.example/eve/v1/session/wrun_new-session"),
    );

    expect(mocks.claimAgentSession).toHaveBeenCalledWith({
      sessionId: "wrun_new-session",
      tenantId: "tenant-1",
      userId: "user-1",
    });
    expect(result).toMatchObject({
      authenticator: "clerk",
      principalId: "clerk-user-1",
      attributes: { tenantId: "tenant-1", appUserId: "user-1" },
    });
  });

  it("rejects a session already claimed by another user", async () => {
    mocks.claimAgentSession.mockResolvedValue(false);
    const authenticate = clerkAppAuth();

    await expect(
      authenticate(new Request("https://jobpilot.example/eve/v1/session/wrun_owned")),
    ).rejects.toMatchObject({
      message: "This agent session does not belong to the authenticated user.",
    });
  });

  it("does not claim a session before Eve has assigned an ID", async () => {
    const authenticate = clerkAppAuth();

    await authenticate(new Request("https://jobpilot.example/eve/v1/session"));

    expect(mocks.claimAgentSession).not.toHaveBeenCalled();
  });
});
