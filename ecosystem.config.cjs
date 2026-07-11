const path = require("path");
require(path.join(__dirname, "services", "time-attendance", "node_modules", "dotenv")).config({
  path: path.join(__dirname, ".env"),
});

const root = __dirname;
const venvPython = path.join(root, ".venv", "Scripts", "python.exe");

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

module.exports = {
  apps: [
    {
      name: "hr-approve",
      cwd: root,
      script: "run.py",
      interpreter: venvPython,
      env: {
        HR_APPROVE_SILENT: "1",
        DASHBOARD_HOST: process.env.DASHBOARD_HOST || "0.0.0.0",
        DASHBOARD_PORT: process.env.DASHBOARD_PORT || "8010",
        TIME_ATTENDANCE_URL: process.env.TIME_ATTENDANCE_URL || "http://127.0.0.1:8011",
        TIME_ATTENDANCE_PATH: process.env.TIME_ATTENDANCE_PATH || "/hr-approve",
      },
    },
    {
      name: "time-attendance",
      cwd: path.join(root, "services", "time-attendance"),
      script: "server/index.js",
      env: {
        ...dbEnv,
        BASE_PATH: process.env.TIME_ATTENDANCE_PATH || "/hr-approve",
        API_PORT: "8011",
        API_HOST: "127.0.0.1",
      },
    },
  ],
};
