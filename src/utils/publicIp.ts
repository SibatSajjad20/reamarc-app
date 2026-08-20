const CACHE_MS = 2 * 60 * 1000;
let cachedIp: { value: string; at: number } | null = null;
let inflight: Promise<string | null> | null = null;

async function fetchFrom(url: string, parse: (text: string) => string | null): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) return null;
    const text = await res.text();
    const ip = parse(text);
    return ip && /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) ? ip : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Public WAN IP of the current network. Used so office vs home Wi-Fi can be
 * distinguished when the API is reached through a localhost Vite proxy.
 */
export async function detectPublicIp(): Promise<string | null> {
  if (cachedIp && Date.now() - cachedIp.at < CACHE_MS) {
    return cachedIp.value;
  }
  if (inflight) return inflight;

  inflight = (async () => {
    const ipify = await fetchFrom('https://api.ipify.org?format=json', (text) => {
      try {
        return JSON.parse(text)?.ip || null;
      } catch {
        return null;
      }
    });
    const ip = ipify || (await fetchFrom('https://icanhazip.com', (text) => text.trim()));
    if (ip) {
      cachedIp = { value: ip, at: Date.now() };
    }
    return ip;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}
