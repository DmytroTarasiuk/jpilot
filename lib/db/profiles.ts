import { and, eq } from "drizzle-orm";
import type { CandidateProfileInput } from "../domain/profile";
import { getDb } from "./client";
import { candidateProfiles } from "./schema";

export async function getCandidateProfile(input: { tenantId: string; ownerId: string }) {
  const [profile] = await getDb()
    .select()
    .from(candidateProfiles)
    .where(
      and(
        eq(candidateProfiles.tenantId, input.tenantId),
        eq(candidateProfiles.ownerId, input.ownerId),
      ),
    )
    .limit(1);
  return profile ?? null;
}

export async function upsertCandidateProfile(input: {
  tenantId: string;
  ownerId: string;
  profile: CandidateProfileInput;
}) {
  const now = new Date();
  const [profile] = await getDb()
    .insert(candidateProfiles)
    .values({
      tenantId: input.tenantId,
      ownerId: input.ownerId,
      ...input.profile,
      confirmedAt: now,
    })
    .onConflictDoUpdate({
      target: [candidateProfiles.tenantId, candidateProfiles.ownerId],
      set: { ...input.profile, confirmedAt: now, updatedAt: now },
    })
    .returning();
  if (!profile) throw new Error("Unable to save the candidate profile.");
  return profile;
}
