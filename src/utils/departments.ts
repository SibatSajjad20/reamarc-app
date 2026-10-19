export const CANONICAL_DEPARTMENTS = [
  'Website',
  'Creative',
  'Content',
  'SEO',
  'Performance marketing',
  'Social media',
  'Sales',
  'AI',
  'Software development',
  'HR',
] as const;

export type CanonicalDepartment = (typeof CANONICAL_DEPARTMENTS)[number];

const CANONICAL_BY_KEY = new Map(
  CANONICAL_DEPARTMENTS.map((d) => [d.toLowerCase(), d]),
);

const ALIASES: Record<string, CanonicalDepartment> = {
  social: 'Social media',
  social_media: 'Social media',
  socialmedia: 'Social media',
  performance: 'Performance marketing',
  performance_marketing: 'Performance marketing',
  performancemarketing: 'Performance marketing',
  'web development': 'Website',
  webdevelopment: 'Website',
  software: 'Website',
  dev: 'Website',
};

function lookupKey(value: string): string {
  return value.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function canonicalDept(value?: string | null): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const key = lookupKey(raw);
  if (!key) return '';
  const exact = CANONICAL_BY_KEY.get(key);
  if (exact) return exact;
  const collapsed = key.replace(/\s+/g, '');
  for (const canon of CANONICAL_DEPARTMENTS) {
    if (canon.toLowerCase().replace(/\s+/g, '') === collapsed) return canon;
  }
  if (ALIASES[key]) return ALIASES[key];
  for (const [alias, canon] of Object.entries(ALIASES)) {
    if (alias.replace(/[\s_]+/g, '') === collapsed) return canon;
  }
  return raw;
}

export function sameDept(a?: string | null, b?: string | null): boolean {
  const left = canonicalDept(a).toLowerCase() || String(a || '').trim().toLowerCase();
  const right = canonicalDept(b).toLowerCase() || String(b || '').trim().toLowerCase();
  return Boolean(left) && left === right;
}

export function uniqueCanonicalDepts(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const canon = canonicalDept(value);
    if (!canon) continue;
    const marker = canon.toLowerCase();
    if (seen.has(marker)) continue;
    seen.add(marker);
    out.push(canon);
  }
  return out;
}

export function mapDeptToOption(raw: string | null | undefined, options: readonly string[]): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  const match = options.find((opt) => sameDept(opt, trimmed));
  return match || trimmed;
}

export function memberDepartmentLists(member: {
  primary_department?: string | null;
  departments?: string[] | null;
  department?: string | null;
}): { primary: string; secondaries: string[] } {
  const fromList = Array.isArray(member.departments) ? member.departments : [];
  const fromString =
    member.department && member.department !== 'All' && member.department !== 'HR'
      ? member.department.split(/[,;/]|\band\b|&/i).map((s) => s.trim()).filter(Boolean)
      : [];
  const primaryRaw =
    member.primary_department ||
    fromList[0] ||
    fromString[0] ||
    '';
  const primary = mapDeptToOption(primaryRaw, CANONICAL_DEPARTMENTS) || canonicalDept(primaryRaw);
  const rest = uniqueCanonicalDepts([...fromList, ...fromString]).filter((d) => !sameDept(d, primary));
  return { primary, secondaries: rest };
}
