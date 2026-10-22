export const STORAGE_VERSION = '2026-10-22-same-origin';

export function resetStaleClientStorage(): void {
  try {
    if (localStorage.getItem('reamarc_storage_version') !== STORAGE_VERSION) {
      const keep = new Set(['reamarc-theme']);
      for (const store of [localStorage, sessionStorage]) {
        const keys: string[] = [];
        for (let i = 0; i < store.length; i++) {
          const k = store.key(i);
          if (k) keys.push(k);
        }
        keys.forEach((k) => {
          if (keep.has(k)) return;
          if (
            k.startsWith('reamarc') ||
            k.startsWith('sidebar_collapsed') ||
            k.includes('react-query') ||
            k.includes('REACT_QUERY')
          ) {
            store.removeItem(k);
          }
        });
      }
      localStorage.setItem('reamarc_storage_version', STORAGE_VERSION);
    }
  } catch {
    /* storage blocked: ignore */
  }
}
