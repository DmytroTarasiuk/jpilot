import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { getDatabaseEnvironment } from "../env/server";
import * as schema from "./schema";

let database: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDb() {
  if (database) return database;

  const { DATABASE_URL } = getDatabaseEnvironment();
  const client = neon(DATABASE_URL);
  database = drizzle({ client, schema });
  return database;
}

export type AppDatabase = ReturnType<typeof getDb>;
