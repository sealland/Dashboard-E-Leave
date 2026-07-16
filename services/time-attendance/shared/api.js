import { withBasePath } from "./base-path.js";

export async function fetchOvertime(filters) {
  const { getDateRange } = await import("./filters.js");
  const from = filters.from || getDateRange(filters).from;
  const to = filters.to || getDateRange(filters).to;
  const params = new URLSearchParams({ from, to });
  if (filters.df_code) params.set("df_code", filters.df_code);

  const response = await fetch(`${withBasePath("/api/overtime")}?${params.toString()}`);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "ไม่สามารถโหลดข้อมูลโอทีได้");
  }
  return payload;
}

export async function fetchPpProductivity(filters) {
  const { getDateRange } = await import("./filters.js");
  const from = filters.from || getDateRange(filters).from;
  const to = filters.to || getDateRange(filters).to;
  const params = new URLSearchParams({ from, to });
  if (filters.df_code && filters.df_code !== "all") params.set("df_code", filters.df_code);
  if (filters.department && filters.department !== "all") {
    params.set("department", filters.department);
  }

  const response = await fetch(
    `${withBasePath("/api/overtime/pp-productivity")}?${params.toString()}`,
  );
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "ไม่สามารถโหลดข้อมูล ZHR_PP ได้");
  }
  return payload;
}

export async function fetchAttendance(filters) {
  const { getDateRange } = await import("./filters.js");
  const from = filters.from || getDateRange(filters).from;
  const to = filters.to || getDateRange(filters).to;
  const params = new URLSearchParams({ from, to });
  // branch/department filtered client-side so dropdown options stay complete

  const response = await fetch(`${withBasePath("/api/attendance")}?${params.toString()}`);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "ไม่สามารถโหลดข้อมูลได้");
  }
  return payload;
}

export async function checkApiHealth() {
  try {
    const response = await fetch(withBasePath("/api/health"));
    const payload = await response.json();
    return response.ok && payload.ok;
  } catch {
    return false;
  }
}
