/** "Show more" paging: pages grow by `step` rows, read from ?limit=. */
export const PAGE_STEP = 24;
export const MAX_LIMIT = 480;

export function readLimit(raw: string | string[] | undefined, step = PAGE_STEP) {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isFinite(n) || n < step) return step;
  return Math.min(Math.ceil(n / step) * step, MAX_LIMIT);
}

/** Ask the database for one extra row; if it comes back, there's more to show. */
export function splitPage<T>(rows: T[] | null | undefined, limit: number) {
  const list = rows ?? [];
  return { items: list.slice(0, limit), hasMore: list.length > limit };
}

/** The same URL with a bigger ?limit=. */
export function moreHref(path: string, params: Record<string, string | undefined | null>, limit: number, step = PAGE_STEP) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  sp.set("limit", String(Math.min(limit + step, MAX_LIMIT)));
  return `${path}?${sp.toString()}`;
}
