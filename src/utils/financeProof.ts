export const FINANCE_PROOF_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'webp'] as const;
export const FINANCE_PROOF_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp';
export const FINANCE_PROOF_MAX_BYTES = 15 * 1024 * 1024;
export const FINANCE_PROOF_MIME = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
] as const;

export function validateFinanceProofFile(file: File): string | null {
  const name = file.name || 'upload';
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  if (!FINANCE_PROOF_EXTENSIONS.includes(ext as (typeof FINANCE_PROOF_EXTENSIONS)[number])) {
    return 'Allowed file types: PDF, PNG, JPG, JPEG, WEBP';
  }
  if (file.size <= 0) {
    return 'File is empty';
  }
  if (file.size > FINANCE_PROOF_MAX_BYTES) {
    return 'File size exceeds 15MB limit';
  }
  const mime = (file.type || '').toLowerCase();
  if (mime && !FINANCE_PROOF_MIME.includes(mime as (typeof FINANCE_PROOF_MIME)[number])) {
    return 'Allowed file types: PDF, PNG, JPG, JPEG, WEBP';
  }
  return null;
}
