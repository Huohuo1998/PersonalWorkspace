export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}
export function csrf(): string {
  return decodeURIComponent(
    document.cookie
      .split("; ")
      .find((v) => v.startsWith("pw_csrf="))
      ?.split("=")[1] || "",
  );
}
export function key(): string {
  return crypto.randomUUID();
}
export async function api<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    key?: string;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch("/api/v1" + path, {
      method: options.method || "GET",
      credentials: "same-origin",
      signal: options.signal || controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrf(),
        ...(options.key ? { "Idempotency-Key": options.key } : {}),
      },
      ...(options.body !== undefined
        ? { body: JSON.stringify(options.body) }
        : {}),
    });
    const data = await response.json();
    if (!response.ok) {
      if (
        response.status === 401 &&
        path !== "/me" &&
        !path.startsWith("/auth/")
      )
        window.dispatchEvent(new Event("auth-expired"));
      throw new ApiError(
        response.status,
        data.error?.message || "请求未成功",
        data.error?.code || "REQUEST_FAILED",
        data.error?.details,
      );
    }
    return data as T;
  } finally {
    clearTimeout(timeout);
  }
}
export const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "操作未成功，请重试";
export const money = (
  value: string | number | null | undefined,
  currency = "CNY",
) =>
  value == null
    ? "尚未设置"
    : new Intl.NumberFormat("zh-CN", { style: "currency", currency }).format(
        Number(value),
      );
export function dayAt(timezone: string, date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function addDay(day: string, n: number) {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function monday(day: string) {
  const d = new Date(day + "T12:00:00Z");
  return addDay(day, -((d.getUTCDay() + 6) % 7));
}
export function timeIn(iso: string, timezone: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}
