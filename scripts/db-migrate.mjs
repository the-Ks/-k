import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..");

loadEnvFile(path.join(root, "backend", ".env.local"));
loadEnvFile(path.join(root, "backend", ".env"));

const includeSeed = process.argv.includes("--seed") || process.env.INCLUDE_DEMO_DATA === "true";
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required. Set it in backend/.env.local or the server environment.");
  process.exit(1);
}

const migrationFiles = [
  "001_init.sql",
  "003_message_media.sql",
  ...(includeSeed ? ["002_seed_demo.sql"] : []),
  "004_password_hashes.sql",
  "005_ai_quality_audit_fields.sql",
  "006_operation_log.sql",
  "007_manual_score_adjustment.sql"
];

const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false
});

try {
  await client.connect();
  for (const filename of migrationFiles) {
    const fullPath = path.join(root, "database", "postgresql", filename);
    const sql = await readFile(fullPath, "utf8");
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("commit");
      console.log(`applied ${filename}`);
    } catch (error) {
      await client.query("rollback");
      throw new Error(`failed ${filename}: ${error.message}`);
    }
  }
  console.log(includeSeed ? "database migration completed with demo seed" : "database migration completed");
} finally {
  await client.end().catch(() => {});
}

function loadEnvFile(filePath) {
  try {
    const content = readFileSync(filePath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index === -1) continue;
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim();
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // Optional local env files may not exist in production.
  }
}
