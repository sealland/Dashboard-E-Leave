function normalizeBasePath(value) {
  if (!value || value === "/") return "";
  const trimmed = String(value).trim();
  if (!trimmed) return "";
  const withLeading = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeading.endsWith("/") ? withLeading.slice(0, -1) : withLeading;
}

export function getBasePath() {
  const meta = document.querySelector('meta[name="base-path"]');
  return normalizeBasePath(meta?.getAttribute("content") ?? "");
}

export function withBasePath(path) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const base = getBasePath();
  return base ? `${base}${normalized}` : normalized;
}
