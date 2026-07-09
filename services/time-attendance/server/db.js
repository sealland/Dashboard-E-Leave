import sql from "mssql";
import dotenv from "dotenv";

dotenv.config();

function envFlag(name, defaultValue = true) {
  const value = (process.env[name] ?? "").trim().toLowerCase();
  if (value === "true" || value === "1" || value === "yes") return true;
  if (value === "false" || value === "0" || value === "no") return false;
  return defaultValue;
}

const config = {
  server: process.env.DB_SERVER,
  port: Number(process.env.DB_PORT || 1433),
  database: process.env.DB_DATABASE || "INFO",
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
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

export function getPool() {
  if (!poolPromise) {
    poolPromise = sql.connect(config);
  }
  return poolPromise;
}

export { sql };
