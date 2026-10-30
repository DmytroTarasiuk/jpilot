import { currentUser } from "@clerk/nextjs/server";

export async function getVerifiedPrimaryEmail() {
  const user = await currentUser();
  const email = user?.primaryEmailAddress;
  if (!email || email.verification?.status !== "verified") return null;
  return email.emailAddress.trim().toLowerCase();
}
