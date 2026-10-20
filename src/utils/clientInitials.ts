const LEGAL_SUFFIXES = new Set(['llc', 'ltd', 'limited', 'inc', 'pvt', 'co', 'corp']);

export function clientInitials(name?: string | null): string {
  const tokens = String(name || '')
    .trim()
    .split(/[\s\W_]+/)
    .filter(Boolean);
  const words = tokens.filter((t) => /^[A-Za-z]/.test(t) && !LEGAL_SUFFIXES.has(t.toLowerCase().replace(/\.$/, '')));
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
