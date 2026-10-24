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

const malwareScannerSchema = z.object({
  MALWARE_SCAN_URL: z.string().url(),
  MALWARE_SCAN_TOKEN: z.string().min(16),
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

export function getMalwareScannerEnvironment() {
  const result = malwareScannerSchema.safeParse(process.env);
  return result.success ? result.data : null;
}
