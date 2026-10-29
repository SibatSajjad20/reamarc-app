import {
  buildShareMeta,
  extractReviewToken,
  injectShareMeta,
  isBuiltSpaHtml,
  isValidReviewToken,
} from "./review-og-lib.mjs";

const FETCH_MS = 4000;
const API_ORIGIN = process.env.REVIEW_API_ORIGIN || "https://api.oneworklane.com";

function requestOrigin(req) {
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "oneworklane.com")
    .split(",")[0]
    .trim();
  return `${proto}://${host}`;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBuiltSpa(origin) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_MS);
  try {
    const res = await fetch(`${origin}/index.html`, {
      signal: controller.signal,
      headers: { accept: "text/html" },
    });
    if (!res.ok) return null;
    const html = await res.text();
    return isBuiltSpaHtml(html) ? html : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  if (req.method && req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.setHeader("allow", "GET, HEAD");
    res.end();
    return;
  }

  const origin = requestOrigin(req);
  const token = String(req.query?.token || extractReviewToken(`https://local${req.url}`) || "").trim();
  const path = token ? `/review/${token}` : "/review";
  let item = null;

  if (isValidReviewToken(token)) {
    item = await fetchJson(
      `${API_ORIGIN}/api/v1/content-calendar/public/review/${encodeURIComponent(token)}`,
    );
  }

  const meta = buildShareMeta(item, { origin, path, token });
  const spa = await fetchBuiltSpa(origin);
  const html = injectShareMeta(spa, meta);

  res.statusCode = 200;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("cache-control", "public, max-age=60, stale-while-revalidate=300");
  res.setHeader("x-robots-tag", "noindex, nofollow");
  res.end(req.method === "HEAD" ? "" : html);
}
