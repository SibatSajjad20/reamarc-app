import Constants from 'expo-constants';

export const colors = {
  bg: '#F4F4F5',
  card: '#FFFFFF',
  text: '#18181B',
  muted: '#71717A',
  line: '#E4E4E7',
  indigo: '#4F46E5',
  indigoDark: '#3730A3',
  emerald: '#059669',
  amber: '#D97706',
  rose: '#E11D48',
  slate: '#3F3F46',
};

function expoLanHostname(): string | null {
  const candidates = [
    Constants.expoConfig?.hostUri,
    Constants.expoGoConfig?.debuggerHost,
    (Constants.manifest2 as { extra?: { expoGo?: { debuggerHost?: string } } } | null)?.extra?.expoGo
      ?.debuggerHost,
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const host = String(raw)
      .replace(/^[a-z]+:\/\//i, '')
      .split('/')[0]
      ?.split(':')[0];
    if (host && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) && !host.startsWith('127.')) {
      return host;
    }
  }
  return null;
}

function isRewritableApiHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  );
}

/** Physical phones cannot use localhost; keep the API host in sync with Expo Metro. */
function resolveApiUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
  const lan = expoLanHostname();

  if (envUrl) {
    let resolved = envUrl;
    if (lan && /localhost|127\.0\.0\.1/i.test(envUrl)) {
      resolved = envUrl.replace(/localhost|127\.0\.0\.1/i, lan);
    }
    if (!__DEV__ && !/^https:\/\//i.test(resolved)) {
      return 'https://reamarc-app.onrender.com/api/v1';
    }
    return resolved;
  }

  // Dev-only: Expo / Metro on a physical phone talks to the LAN backend over HTTP.
  if (__DEV__ && lan) {
    return `http://${lan}:8000/api/v1`;
  }

  return 'https://reamarc-app.onrender.com/api/v1';
}

export const API_URL = resolveApiUrl();
