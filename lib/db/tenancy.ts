import { and, eq } from "drizzle-orm";
import { getDb } from "./client";
import { agentSessions, tenantMembers, tenants, users } from "./schema";

export interface TenantIdentity {
  tenantId: string;
  userId: string;
  role: "owner" | "admin" | "member";
}

export async function ensureTenantIdentity(input: {
  clerkUserId: string;
  clerkOrganizationId: string | null;
  clerkOrganizationRole: string | null;
}): Promise<TenantIdentity> {
  const db = getDb();
  const externalKey = input.clerkOrganizationId
    ? `clerk-org:${input.clerkOrganizationId}`
    : `clerk-user:${input.clerkUserId}`;
  const role = toMemberRole(input.clerkOrganizationId, input.clerkOrganizationRole);

  await db
    .insert(users)
    .values({ clerkUserId: input.clerkUserId })
    .onConflictDoUpdate({
      target: users.clerkUserId,
      set: { updatedAt: new Date() },
    });

  await db
    .insert(tenants)
    .values({
      externalKey,
      name: input.clerkOrganizationId ? "Clerk organization" : "Personal workspace",
    })
    .onConflictDoUpdate({
      target: tenants.externalKey,
      set: { updatedAt: new Date() },
    });

  const [user] = await db.select().from(users).where(eq(users.clerkUserId, input.clerkUserId)).limit(1);
  const [tenant] = await db.select().from(tenants).where(eq(tenants.externalKey, externalKey)).limit(1);

  if (!user || !tenant) throw new Error("Unable to establish the authenticated tenant.");

  await db
    .insert(tenantMembers)
    .values({ tenantId: tenant.id, userId: user.id, role, active: true })
    .onConflictDoUpdate({
      target: [tenantMembers.tenantId, tenantMembers.userId],
      set: { role, active: true, updatedAt: new Date() },
    });

  return { tenantId: tenant.id, userId: user.id, role };
}

export async function bindAgentSession(input: {
  sessionId: string;
  tenantId: string;
  userId: string;
}) {
  const db = getDb();
  await db
    .insert(agentSessions)
    .values({ sessionId: input.sessionId, tenantId: input.tenantId, ownerId: input.userId })
    .onConflictDoNothing({ target: agentSessions.sessionId });

  const [owner] = await db
    .select({ tenantId: agentSessions.tenantId, userId: agentSessions.ownerId })
    .from(agentSessions)
    .where(eq(agentSessions.sessionId, input.sessionId))
    .limit(1);

  if (!owner || owner.tenantId !== input.tenantId || owner.userId !== input.userId) {
    throw new Error("Agent session ownership conflict.");
  }
}

export async function canAccessAgentSession(input: {
  sessionId: string;
  tenantId: string;
  userId: string;
}) {
  const [row] = await getDb()
    .select({ sessionId: agentSessions.sessionId })
    .from(agentSessions)
    .where(
      and(
        eq(agentSessions.sessionId, input.sessionId),
        eq(agentSessions.tenantId, input.tenantId),
        eq(agentSessions.ownerId, input.userId),
      ),
    )
    .limit(1);
  return row !== undefined;
}

function toMemberRole(
  organizationId: string | null,
  clerkRole: string | null,
): TenantIdentity["role"] {
  if (!organizationId) return "owner";
  if (clerkRole === "org:admin" || clerkRole === "admin") return "admin";
  return "member";
}
