import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// A transient socket error on an idle pooled connection (e.g. EADDRNOTAVAIL, ECONNRESET)
// emits an 'error' event that, if unhandled, crashes the whole process. Log & swallow it —
// the pool discards the bad connection and opens a fresh one on the next query.
pool.on("error", (err) => { console.error("[pg pool] idle client error (ignored):", err.message); });
export const db = drizzle(pool, { schema });
