export function canonicalizeUrl(input: string): string {
  let s = String(input || "").trim();
  if (!s) return "";

  if (!/^https?:\/\//i.test(s)) s = "https://" + s;

  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return s;
  }

  u.hostname = u.hostname.toLowerCase();

  if ((u.protocol === "http:" && u.port === "80") || (u.protocol === "https:" && u.port === "443")) {
    u.port = "";
  }

  u.pathname = u.pathname.replace(/\/{2,}/g, "/");
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");

  const dropPrefixes = ["utm_", "fbclid", "gclid", "mc_cid", "mc_eid"];
  for (const key of Array.from(u.searchParams.keys())) {
    const k = key.toLowerCase();
    if (dropPrefixes.some((p) => k === p || k.startsWith(p))) u.searchParams.delete(key);
  }

  const sorted = new URLSearchParams();
  Array.from(u.searchParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([k, v]) => sorted.append(k, v));
  u.search = sorted.toString() ? `?${sorted.toString()}` : "";

  u.hash = "";

  return u.toString();
}
