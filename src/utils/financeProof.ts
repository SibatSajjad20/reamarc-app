export const FINANCE_PROOF_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'webp'] as const;
export const FINANCE_PROOF_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp';
export const FINANCE_PROOF_MAX_BYTES = 15 * 1024 * 1024;

export function validateFinanceProofFile(file: File): string | null {
  const name = file.name || 'upload';
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  if (!FINANCE_PROOF_EXTENSIONS.includes(ext as (typeof FINANCE_PROOF_EXTENSIONS)[number])) {
    return 'Allowed file types: PDF, PNG, JPG, JPEG, WEBP';
  }
  if (file.size > FINANCE_PROOF_MAX_BYTES) {
    return 'File size exceeds 15MB limit';
  }
  return null;
}
