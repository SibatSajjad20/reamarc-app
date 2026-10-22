export type CompanyMembership = { id: string };

export function inboxPrimeKey(user?: { id?: string | null; company_id?: string | null } | null): string {
  return `${user?.id || ''}:${user?.company_id || ''}`;
}

export function shouldSwitchCompanyForPush(
  currentCompanyId: string | null | undefined,
  data: { company_id?: string | null } | null | undefined,
  companies: CompanyMembership[] | null | undefined,
): string | null {
  const target = data?.company_id ? String(data.company_id) : '';
  if (!target || target === currentCompanyId) return null;
  if (!(companies || []).some((c) => c.id === target)) return null;
  return target;
}
