const TOKEN_RE = /^[A-Za-z0-9_-]{8,128}$/;
const DEFAULT_TITLE = "Campaign review · Reamarc";
const DEFAULT_DESCRIPTION = "Open this link to review and approve the campaign.";
const TITLE_MAX = 70;
const DESCRIPTION_MAX = 180;

export function isValidReviewToken(token) {
  return TOKEN_RE.test(String(token || "").trim());
}

export function isBuiltSpaHtml(html) {
  const value = String(html || "");
  return (
    value.includes('id="root"') &&
    !value.includes("/src/main.tsx") &&
    /\/assets\/[^"']+\.(js|css)/.test(value)
  );
}

export function extractReviewToken(urlLike) {
  try {
    const url = new URL(urlLike, "https://reamarc.local");
    const fromQuery = String(url.searchParams.get("token") || "").trim();
    if (fromQuery) return fromQuery;
    const match = url.pathname.match(/\/(?:review|client-review)\/([^/?#]+)/i);
    return match ? decodeURIComponent(match[1]).trim() : "";
  } catch {
    return "";
  }
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeAttr(value) {
  return escapeHtml(value).replace(/\s+/g, " ").trim();
}

function clip(text, max) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (text) return text;
  }
  return "";
}

export function absoluteUrl(origin, pathOrUrl) {
  const value = String(pathOrUrl || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  const originClean = String(origin || "").replace(/\/+$/, "");
  if (value.startsWith("//")) return `https:${value}`;
  if (value.startsWith("/")) return `${originClean}${value}`;
  return `${originClean}/${value}`;
}

function isImageAsset(asset) {
  if (!asset || typeof asset !== "object") return false;
  const kind = String(asset.kind || "").toLowerCase();
  const type = String(asset.content_type || "").toLowerCase();
  return kind === "image" || type.startsWith("image/");
}

function isVideoAsset(asset) {
  if (!asset || typeof asset !== "object") return false;
  const kind = String(asset.kind || "").toLowerCase();
  const type = String(asset.content_type || "").toLowerCase();
  return kind === "video" || type.startsWith("video/");
}

export function pickShareImage(item, origin, token) {
  const fallback = absoluteUrl(origin, "/og-review.png");
  const attachments = Array.isArray(item?.attachments) ? item.attachments : [];
  const ranked = [
    ...attachments.filter(isImageAsset),
    ...attachments.filter(isVideoAsset),
  ];

  for (const asset of ranked) {
    const assetId = String(asset.id || "").trim();
    const thumb = String(asset.thumbnail_url || "").trim();
    const url = String(asset.url || "").trim();
    const type = String(asset.content_type || "").toLowerCase();
    const preferThumb = isVideoAsset(asset) || type.includes("gif") || Boolean(thumb);

    let chosen = preferThumb && thumb ? thumb : url || thumb;
    if (!chosen && assetId && token) {
      const thumbQuery = isVideoAsset(asset) ? "?thumb=1" : "";
      chosen = `/api/v1/content-calendar/public/review/${encodeURIComponent(token)}/assets/${encodeURIComponent(assetId)}${thumbQuery}`;
    }
    const abs = absoluteUrl(origin, chosen);
    if (abs) return abs;
  }

  return fallback;
}

export function buildShareMeta(item, { origin, path, token } = {}) {
  const client = firstNonEmpty(item?.client_name);
  const concept = firstNonEmpty(item?.content_concept);
  const serial = firstNonEmpty(item?.serial);
  const titleCore = concept || (client ? `${client} campaign review` : DEFAULT_TITLE);
  const title = clip(client && concept ? `${concept} · ${client}` : titleCore, TITLE_MAX);

  const description = clip(
    firstNonEmpty(
      item?.primary_text,
      item?.headlines_hooks,
      item?.content_on_creative,
      item?.offer,
      client ? `Please review this campaign for ${client}.` : DEFAULT_DESCRIPTION,
    ),
    DESCRIPTION_MAX,
  );

  const canonicalPath = path || (token ? `/review/${token}` : "/review");
  const url = absoluteUrl(origin, canonicalPath);
  const image = pickShareImage(item, origin, token);
  const imageAlt = clip(concept || client || "Reamarc campaign review", 100);

  return {
    title: title || DEFAULT_TITLE,
    description: description || DEFAULT_DESCRIPTION,
    url,
    image,
    imageAlt,
    siteName: "Reamarc",
    serial,
  };
}

export function renderMetaTags(meta) {
  const title = escapeAttr(meta.title || DEFAULT_TITLE);
  const description = escapeAttr(meta.description || DEFAULT_DESCRIPTION);
  const url = escapeAttr(meta.url || "");
  const image = escapeAttr(meta.image || "");
  const imageAlt = escapeAttr(meta.imageAlt || "Reamarc campaign review");
  const siteName = escapeAttr(meta.siteName || "Reamarc");

  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${siteName}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:secure_url" content="${image}" />`,
    `<meta property="og:image:alt" content="${imageAlt}" />`,
    ...(String(meta.image || "").endsWith("/og-review.png")
      ? [
          `<meta property="og:image:width" content="1200" />`,
          `<meta property="og:image:height" content="630" />`,
        ]
      : []),
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${image}" />`,
    `<link rel="image_src" href="${image}" />`,
  ].join("\n    ");
}

export function injectShareMeta(html, meta) {
  const tags = renderMetaTags(meta);
  let next = String(html || "");
  if (!isBuiltSpaHtml(next)) {
    return `<!doctype html><html lang="en"><head>${tags}</head><body></body></html>`;
  }
  next = next.replace(/<title>[\s\S]*?<\/title>/i, "");
  next = next.replace(/<meta\s+name=["']description["'][^>]*>/i, "");
  return next.replace(/<\/head>/i, `    ${tags}\n  </head>`);
}

export const SHARE_DEFAULTS = { DEFAULT_TITLE, DEFAULT_DESCRIPTION };
