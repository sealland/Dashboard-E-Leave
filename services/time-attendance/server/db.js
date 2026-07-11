import path from "path";
import { fileURLToPath } from "url";
import sql from "mssql";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(serviceRoot, "../..");

dotenv.config({ path: path.join(serviceRoot, ".env") });
dotenv.config({ path: path.join(repoRoot, ".env") });

function envFlag(name, defaultValue = true) {
  const value = (process.env[name] ?? "").trim().toLowerCase();
  if (value === "true" || value === "1" || value === "yes") return true;
  if (value === "false" || value === "0" || value === "no") return false;
  return defaultValue;
}

const server = (process.env.DB_SERVER ?? "").trim();
const database = (process.env.DB_DATABASE || process.env.DB_NAME || "INFO").trim();
const user = (process.env.DB_USER ?? "").trim();
const password = process.env.DB_PASSWORD ?? "";

const config = {
  server,
  port: Number(process.env.DB_PORT || 1433),
  database,
  user,
  password,
  options: {
    encrypt: envFlag("DB_ENCRYPT", true),
    trustServerCertificate: envFlag("DB_TRUST_SERVER_CERTIFICATE", true),
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let poolPromise;

function assertDbConfig() {
  if (!server) {
    throw new Error(
      'DB_SERVER is not set. Add DB_SERVER to the repo root .env or services/time-attendance/.env',
    );
  }
  if (!user) {
    throw new Error(
      'DB_USER is not set. Add DB_USER to the repo root .env or services/time-attendance/.env',
    );
  }
}

export function getPool() {
  if (!poolPromise) {
    assertDbConfig();
    poolPromise = sql.connect(config);
  }
  return poolPromise;
}

export { sql };
