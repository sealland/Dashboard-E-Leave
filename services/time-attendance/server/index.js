import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import attendanceRouter from "./routes/attendance.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const port = Number(process.env.API_PORT || 8011);

function normalizeBasePath(value) {
  if (!value || value === "/") return "";
  const trimmed = String(value).trim();
  if (!trimmed) return "";
  const withLeading = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeading.endsWith("/") ? withLeading.slice(0, -1) : withLeading;
}

const basePath = normalizeBasePath(process.env.BASE_PATH ?? "");

function parseHost() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--host") {
      return args[i + 1] || "0.0.0.0";
    }
    if (args[i].startsWith("--host=")) {
      return args[i].slice("--host=".length) || "0.0.0.0";
    }
  }
  const fromEnv = (process.env.API_HOST || "").trim();
  return fromEnv || undefined;
}

const host = parseHost();

function injectBasePathMeta(html) {
  if (!basePath) return html;
  const meta = `<meta name="base-path" content="${basePath}" />`;
  if (html.includes('name="base-path"')) return html;
  return html.replace("<head>", `<head>\n    ${meta}`);
}

function sendHtml(res, filename) {
  const filePath = path.join(rootDir, filename);
  if (!basePath) {
    res.sendFile(filePath);
    return;
  }
  const html = fs.readFileSync(filePath, "utf8");
  res.type("html").send(injectBasePathMeta(html));
}

const app = express();

app.use(cors());
app.use(express.json());

if (basePath) {
  app.get("/", (_req, res) => {
    res.redirect(`${basePath}/`);
  });
}

const router = express.Router();
router.use("/api", attendanceRouter);

router.get("/", (_req, res) => {
  sendHtml(res, "index.html");
});

router.get("/index.html", (_req, res) => {
  sendHtml(res, "index.html");
});

router.get("/report-late.html", (_req, res) => {
  sendHtml(res, "report-late.html");
});

router.use(express.static(rootDir, { index: false }));

router.get("*", (_req, res) => {
  sendHtml(res, "index.html");
});

app.use(basePath || "/", router);

app.listen(port, host, () => {
  const pathSuffix = basePath || "";
  const localUrl = `http://localhost:${port}${pathSuffix}/`;
  if (!host || host === "0.0.0.0") {
    console.log(`Time Attendance running at ${localUrl}`);
    console.log(`  LAN: http://<เครื่องนี้-ip>:${port}${pathSuffix}/`);
    return;
  }
  console.log(`Time Attendance running at http://${host}:${port}${pathSuffix}/`);
});
