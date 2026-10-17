import assert from "node:assert/strict";
import test from "node:test";
import {
  absoluteUrl,
  buildShareMeta,
  escapeAttr,
  extractReviewToken,
  injectShareMeta,
  isBuiltSpaHtml,
  isValidReviewToken,
  pickShareImage,
} from "./review-og-lib.mjs";

test("extracts token from review path and query", () => {
  assert.equal(
    extractReviewToken("https://reamarc-app.vercel.app/review/8qOK-wUT-2Ie3Bq8a7mSQc5xwY5MjN8R"),
    "8qOK-wUT-2Ie3Bq8a7mSQc5xwY5MjN8R",
  );
  assert.equal(
    extractReviewToken("https://reamarc-app.vercel.app/api/review-og?token=cc_tok_abcDEF123"),
    "cc_tok_abcDEF123",
  );
  assert.equal(isValidReviewToken("8qOK-wUT-2Ie3Bq8a7mSQc5xwY5MjN8R"), true);
  assert.equal(isValidReviewToken("../etc/passwd"), false);
});

test("builds title, description, and creative image for WhatsApp tags", () => {
  const origin = "https://reamarc-app.vercel.app";
  const token = "8qOK-wUT-2Ie3Bq8a7mSQc5xwY5MjN8R";
  const meta = buildShareMeta(
    {
      client_name: "Northwind",
      content_concept: "Ramadan offer reel",
      primary_text: "A limited festive offer for returning customers.",
      attachments: [
        {
          id: "asset-1",
          kind: "image",
          content_type: "image/jpeg",
          url: `/api/v1/content-calendar/public/review/${token}/assets/asset-1`,
        },
      ],
    },
    { origin, path: `/review/${token}`, token },
  );

  assert.equal(meta.title, "Ramadan offer reel · Northwind");
  assert.match(meta.description, /festive offer/);
  assert.equal(
    meta.image,
    `${origin}/api/v1/content-calendar/public/review/${token}/assets/asset-1`,
  );
});

test("falls back to branded image when there is no creative", () => {
  const origin = "https://reamarc-app.vercel.app";
  const image = pickShareImage({ attachments: [] }, origin, "token-token");
  assert.equal(image, `${origin}/og-review.png`);
});

test("uses video thumbnail instead of the video file", () => {
  const origin = "https://example.com";
  const image = pickShareImage(
    {
      attachments: [
        {
          id: "vid",
          kind: "video",
          content_type: "video/mp4",
          url: "/api/v1/content-calendar/public/review/tok/assets/vid",
          thumbnail_url: "/api/v1/content-calendar/public/review/tok/assets/vid?thumb=1",
        },
      ],
    },
    origin,
    "tok",
  );
  assert.equal(image, `${origin}/api/v1/content-calendar/public/review/tok/assets/vid?thumb=1`);
});

test("does not use a video file as the WhatsApp preview image", () => {
  const origin = "https://reamarc-app.vercel.app";
  const image = pickShareImage(
    {
      attachments: [
        {
          id: "vid",
          kind: "video",
          content_type: "video/mp4",
          url: "/api/v1/content-calendar/public/review/tok/assets/vid",
        },
      ],
    },
    origin,
    "tok",
  );
  assert.equal(image, `${origin}/og-review.png`);
});

test("rejects Vite source HTML so the review app is never served unbuilt", () => {
  assert.equal(
    isBuiltSpaHtml('<div id="root"></div><script type="module" src="/src/main.tsx"></script>'),
    false,
  );
  assert.equal(
    isBuiltSpaHtml(
      '<html><head><script src="/assets/index-yz5LSi-Y.js"></script></head><body><div id="root"></div></body></html>',
    ),
    true,
  );
});

test("injects escaped Open Graph tags into the built SPA shell", () => {
  const spa =
    '<html><head><title>Reamarc</title><script src="/assets/index-yz5LSi-Y.js"></script></head><body><div id="root"></div></body></html>';
  const html = injectShareMeta(spa, {
    title: 'Review "Q2" <launch>',
    description: "Approve & comment",
    url: "https://reamarc-app.vercel.app/review/abc",
    image: "https://reamarc-app.vercel.app/og-review.png",
    imageAlt: "Preview",
    siteName: "Reamarc",
  });
  assert.match(html, /og:title/);
  assert.match(html, /og:image/);
  assert.equal(html.includes("<launch>"), false);
  assert.match(html, /Review &quot;Q2&quot; &lt;launch&gt;/);
  assert.match(html, /<div id="root"><\/div>/);
  assert.match(html, /\/assets\/index-yz5LSi-Y\.js/);
  assert.equal(escapeAttr('a "b"'), "a &quot;b&quot;");
  assert.equal(absoluteUrl("https://x.test", "/a"), "https://x.test/a");
});

test("does not inject source HTML if the built shell is missing", () => {
  const html = injectShareMeta(
    '<html><head></head><body><div id="root"></div><script src="/src/main.tsx"></script></body></html>',
    {
      title: "Campaign review · Reamarc",
      description: "Open this link",
      url: "https://x.test/review/a",
      image: "https://x.test/og-review.png",
    },
  );
  assert.equal(html.includes("/src/main.tsx"), false);
  assert.match(html, /og:title/);
});
