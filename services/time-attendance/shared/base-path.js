function normalizeBasePath(value) {
  if (!value || value === "/") return "";
  const trimmed = String(value).trim();
  if (!trimmed) return "";
  const withLeading = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeading.endsWith("/") ? withLeading.slice(0, -1) : withLeading;
}

function inferBasePathFromLocation() {
  try {
    const path = window.location.pathname || "";
    if (path === "/hr-approve" || path.startsWith("/hr-approve/")) {
      return "/hr-approve";
    }
  } catch {
    // ignore
  }
  return "";
}

export function getBasePath() {
  const meta = document.querySelector('meta[name="base-path"]');
  const fromMeta = normalizeBasePath(meta?.getAttribute("content") ?? "");
  if (fromMeta) return fromMeta;
  return inferBasePathFromLocation();
}

export function withBasePath(path) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const base = getBasePath();
  return base ? `${base}${normalized}` : normalized;
}
