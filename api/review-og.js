import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildShareMeta,
  extractReviewToken,
  injectShareMeta,
  isValidReviewToken,
} from "./review-og-lib.mjs";

const FETCH_MS = 4000;
const API_ORIGIN = process.env.REVIEW_API_ORIGIN || "https://reamarc-app.onrender.com";

function requestOrigin(req) {
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "reamarc-app.vercel.app")
    .split(",")[0]
    .trim();
  return `${proto}://${host}`;
}

function loadSpaShell() {
  const candidates = [
    join(process.cwd(), "index.html"),
    join(process.cwd(), "dist", "index.html"),
    join(process.cwd(), "..", "index.html"),
  ];
  for (const path of candidates) {
    try {
      const html = readFileSync(path, "utf8");
      if (html.includes("<div id=\"root\">") || html.includes("id='root'")) return html;
    } catch {
      // try the next build output location
    }
  }
  return null;
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

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "text/html" },
    });
    if (!res.ok) return null;
    return await res.text();
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
  let spa = loadSpaShell();
  if (!spa) spa = await fetchText(`${origin}/index.html`);
  const html = injectShareMeta(spa, meta);

  res.statusCode = 200;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("cache-control", "public, max-age=120, stale-while-revalidate=600");
  res.setHeader("x-robots-tag", "noindex, nofollow");
  res.end(req.method === "HEAD" ? "" : html);
}
