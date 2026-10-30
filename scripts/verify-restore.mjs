import { neon } from "@neondatabase/serverless";

const restoreUrl = process.env.RESTORE_DATABASE_URL;
if (!restoreUrl) throw new Error("RESTORE_DATABASE_URL is required and must point to an isolated restored branch.");
if (process.env.DATABASE_URL && normalize(process.env.DATABASE_URL) === normalize(restoreUrl)) {
  throw new Error("Restore verification refuses to target DATABASE_URL. Use an isolated restored branch.");
}

const target = new URL(restoreUrl);
const sql = neon(restoreUrl);
const requiredTables = [
  "app_users",
  "tenants",
  "tenant_members",
  "cv_documents",
  "search_runs",
  "job_proposals",
  "applications",
  "privacy_requests",
  "tenant_governance_policies",
];
const [migration, tables, integrity] = await Promise.all([
  sql`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`,
  sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY(${requiredTables})`,
  sql`SELECT
      (SELECT count(*)::int FROM tenant_members AS member LEFT JOIN tenants AS tenant ON tenant.id = member.tenant_id WHERE tenant.id IS NULL) AS orphan_tenants,
      (SELECT count(*)::int FROM tenant_members AS member LEFT JOIN app_users AS app_user ON app_user.id = member.user_id WHERE app_user.id IS NULL) AS orphan_users`,
]);
const found = new Set(tables.map((row) => row.table_name));
const missing = requiredTables.filter((table) => !found.has(table));
if (missing.length > 0) throw new Error(`Restore is missing required tables: ${missing.join(", ")}`);
if ((migration[0]?.count ?? 0) < 1) throw new Error("Restore has no recorded Drizzle migrations.");
if ((integrity[0]?.orphan_tenants ?? 0) !== 0 || (integrity[0]?.orphan_users ?? 0) !== 0) {
  throw new Error("Restore failed tenant membership integrity checks.");
}
console.log(JSON.stringify({
  target: { host: target.hostname, database: target.pathname.slice(1) },
  migrationCount: migration[0].count,
  requiredTables: requiredTables.length,
  integrity: integrity[0],
}, null, 2));

function normalize(value) {
  const url = new URL(value);
  url.password = "";
  return url.toString();
}
