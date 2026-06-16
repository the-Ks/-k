import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "../..");

let poolPromise;

loadLocalEnv();

export function isPostgresConfigured() {
  const env = globalThis.process?.env || {};
  return env.DATA_SOURCE === "postgres" || Boolean(env.DATABASE_URL);
}

export async function query(text, params = []) {
  const pool = await getPool();
  return pool.query(text, params);
}

export async function getDatabaseStatus() {
  if (!isPostgresConfigured()) {
    return {
      mode: "mock",
      configured: false,
      connected: false,
      message: "未配置 PostgreSQL，当前使用 mock 数据。"
    };
  }

  try {
    const result = await query("select current_database() as database_name, current_schema() as schema_name, now() as checked_at");
    return {
      mode: "postgres",
      configured: true,
      connected: true,
      ...result.rows[0]
    };
  } catch (error) {
    return {
      mode: "postgres",
      configured: true,
      connected: false,
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

async function getPool() {
  if (!isPostgresConfigured()) {
    throw new Error("PostgreSQL is not configured. Set DATA_SOURCE=postgres and DATABASE_URL.");
  }

  if (!poolPromise) {
    poolPromise = createPool();
  }

  return poolPromise;
}

async function createPool() {
  let pg;
  try {
    pg = await import("pg");
  } catch {
    throw new Error("PostgreSQL driver is missing. Run npm install, then restart backend.");
  }

  const env = globalThis.process?.env || {};
  const sslMode = env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false;
  return new pg.Pool({
    connectionString: env.DATABASE_URL,
    ssl: sslMode,
    max: Number(env.DATABASE_POOL_MAX || 10),
    idleTimeoutMillis: 30000
  });
}

function loadLocalEnv() {
  for (const filename of [".env.local", ".env"]) {
    const envPath = path.join(backendRoot, filename);
    if (!existsSync(envPath)) continue;

    const content = readFileSync(envPath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const index = trimmed.indexOf("=");
      if (index === -1) continue;

      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
      if (key && !globalThis.process?.env?.[key]) {
        globalThis.process.env[key] = value;
      }
    }
  }
}
