const path = require("path");

const root = __dirname;
const venvPython = path.join(root, ".venv", "Scripts", "python.exe");

module.exports = {
  apps: [
    {
      name: "hr-approve",
      cwd: root,
      script: "run.py",
      interpreter: venvPython,
      env: {
        HR_APPROVE_SILENT: "1",
        DASHBOARD_HOST: "127.0.0.1",
        DASHBOARD_PORT: "8010",
      },
    },
    {
      name: "time-attendance",
      cwd: path.join(root, "services", "time-attendance"),
      script: "server/index.js",
      env: {
        BASE_PATH: "/hr-approve",
        API_PORT: "8011",
        API_HOST: "127.0.0.1",
      },
    },
  ],
};
