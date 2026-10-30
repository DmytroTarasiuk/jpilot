import { z } from "zod";

const databaseSchema = z.object({
  DATABASE_URL: z.string().url().startsWith("postgresql://"),
});

const clerkSchema = z.object({
  CLERK_SECRET_KEY: z.string().min(1),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
});

const r2Schema = z.object({
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET_NAME: z.string().min(1),
  R2_ENDPOINT: z.string().url().optional().or(z.literal("")),
});

const cloudmersiveSchema = z.object({
  CLOUDMERSIVE_API_KEY: z.string().min(16),
});

const cvMalwareScanSchema = z.object({
  CV_MALWARE_SCAN_ENABLED: z.enum(["true", "false"]).default("false"),
});

const emailDeliverySchema = z.object({
  RESEND_API_KEY: z.string().min(1),
  NOTIFICATION_EMAIL_FROM: z.string().min(3),
});

const supportAccessSchema = z.object({
  SUPPORT_ACCESS_SECRET: z.string().min(32),
});

function parseEnvironment<T extends z.ZodType>(schema: T, label: string): z.output<T> {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const names = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`${label} environment is not configured. Missing or invalid: ${names}`);
  }
  return result.data;
}

export function getDatabaseEnvironment() {
  return parseEnvironment(databaseSchema, "Database");
}

export function getClerkEnvironment() {
  return parseEnvironment(clerkSchema, "Clerk");
}

export function getR2Environment() {
  const environment = parseEnvironment(r2Schema, "R2");
  return {
    ...environment,
    R2_ENDPOINT:
      environment.R2_ENDPOINT ||
      `https://${environment.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  };
}

export function getCloudmersiveEnvironment() {
  const result = cloudmersiveSchema.safeParse(process.env);
  return result.success ? result.data : null;
}

export function isCloudmersiveMalwareScanEnabled() {
  return parseEnvironment(cvMalwareScanSchema, "CV malware scan").CV_MALWARE_SCAN_ENABLED === "true";
}

export function getEmailDeliveryEnvironment() {
  const result = emailDeliverySchema.safeParse(process.env);
  return result.success ? result.data : null;
}

export function getSupportAccessEnvironment() {
  const result = supportAccessSchema.safeParse(process.env);
  return result.success ? result.data : null;
}
