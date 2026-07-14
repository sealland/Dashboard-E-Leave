const fs = require("fs");
const path = require("path");

const root = __dirname;
const logsDir = path.join(root, "logs");

function loadEnv() {
  const envPath = path.join(root, ".env");
  try {
    const dotenvPath = path.join(
      root,
      "services",
      "time-attendance",
      "node_modules",
      "dotenv"
    );
    require(dotenvPath).config({ path: envPath });
  } catch {
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([^#=]+)=(.*)$/);
      if (match) process.env[match[1].trim()] = match[2].trim();
    }
  }
}

loadEnv();

const venvPython = path.join(root, ".venv", "Scripts", "python.exe");
const pythonInterpreter = fs.existsSync(venvPython) ? venvPython : "python";

const taPort = process.env.TIME_ATTENDANCE_API_PORT || "8011";
const taHost = process.env.TIME_ATTENDANCE_API_HOST || "127.0.0.1";
const taPath = process.env.TIME_ATTENDANCE_PATH || "/hr-approve";
const taUrl =
  process.env.TIME_ATTENDANCE_URL || `http://${taHost}:${taPort}`;
const dashboardPort = process.env.DASHBOARD_PORT || "8010";
const dashboardHost = process.env.DASHBOARD_HOST || "0.0.0.0";

const dbEnv = {
  DB_SERVER: process.env.DB_SERVER,
  DB_PORT: process.env.DB_PORT,
  DB_DATABASE: process.env.DB_DATABASE || process.env.DB_NAME,
  DB_NAME: process.env.DB_NAME,
  DB_USER: process.env.DB_USER,
  DB_PASSWORD: process.env.DB_PASSWORD,
  DB_ENCRYPT: process.env.DB_ENCRYPT,
  DB_TRUST_SERVER_CERTIFICATE: process.env.DB_TRUST_SERVER_CERTIFICATE,
};

const pm2Defaults = {
  autorestart: true,
  max_restarts: 10,
  min_uptime: "10s",
  restart_delay: 3000,
  merge_logs: true,
  time: true,
};

module.exports = {
  apps: [
    {
      name: "hr-approve",
      cwd: root,
      script: "run.py",
      interpreter: pythonInterpreter,
      ...pm2Defaults,
      error_file: path.join(logsDir, "hr-approve-error.log"),
      out_file: path.join(logsDir, "hr-approve-out.log"),
      env: {
        HR_APPROVE_SILENT: "1",
        DASHBOARD_HOST: dashboardHost,
        DASHBOARD_PORT: dashboardPort,
        TIME_ATTENDANCE_URL: taUrl,
        TIME_ATTENDANCE_PATH: taPath,
        DB_DRIVER: process.env.DB_DRIVER,
        DB_TRUSTED_CONNECTION: process.env.DB_TRUSTED_CONNECTION,
        ...dbEnv,
      },
    },
    {
      name: "time-attendance",
      cwd: path.join(root, "services", "time-attendance"),
      script: "server/index.js",
      ...pm2Defaults,
      error_file: path.join(logsDir, "time-attendance-error.log"),
      out_file: path.join(logsDir, "time-attendance-out.log"),
      env: {
        ...dbEnv,
        BASE_PATH: taPath,
        API_PORT: taPort,
        API_HOST: taHost,
      },
    },
  ],
};
