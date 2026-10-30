import { describe, it, expect } from 'vitest';
import {
  majorToMinor,
  minorToMajor,
  formatMinorMoney,
  numberToWordsPakistani,
  amountInWords,
  getCurrencySymbol,
  formatMajorGrouped,
  parseMajorGrouped,
} from '../money';
import { userCan } from '../../hooks/usePermissions';
import { validateFinanceProofFile, FINANCE_PROOF_MAX_BYTES } from '../financeProof';
import { resolveInvoiceStatus } from '../../components/finance/financeUi';
import { formatInvoiceDate } from '../formatInvoiceDate';
import { formatInvoiceNumber } from '../formatInvoiceNumber';
import {
  invoiceEditBlockedMessage,
  publicInvoicePath,
  publicInvoiceUrl,
  toWhatsAppNumber,
  whatsAppShareUrl,
} from '../invoiceShare';

describe('Finance Money & Conversion Utilities', () => {
  it('converts major units to minor integer paisa/cents accurately', () => {
    expect(majorToMinor(100)).toBe(10000);
    expect(majorToMinor(120.5)).toBe(12050);
    expect(majorToMinor(0.99)).toBe(99);
    expect(majorToMinor(0)).toBe(0);
  });

  it('converts minor units back to major float correctly', () => {
    expect(minorToMajor(10000)).toBe(100);
    expect(minorToMajor(12050)).toBe(120.5);
    expect(minorToMajor(99)).toBe(0.99);
  });

  it('formats minor money amounts with proper currency and thousand commas', () => {
    // PKR
    const pkrFormatted = formatMinorMoney(12000000, 'PKR'); // 120,000.00
    expect(pkrFormatted).toContain('120,000');
    expect(pkrFormatted).toContain('PKR');

    // USD
    const usdFormatted = formatMinorMoney(500000, 'USD'); // $5,000.00
    expect(usdFormatted).toContain('5,000');
    expect(usdFormatted).toContain('USD');

    // GBP
    const gbpFormatted = formatMinorMoney(350000, 'GBP'); // £3,500.00
    expect(gbpFormatted).toContain('3,500');
    expect(gbpFormatted).toContain('GBP');
  });

  it('converts Pakistani rupee amounts to words using Lakhs and Crores', () => {
    expect(numberToWordsPakistani(120000)).toBe('One Lakh Twenty Thousand');
    expect(numberToWordsPakistani(15000000)).toBe('One Crore Fifty Lakh');
    expect(numberToWordsPakistani(5000)).toBe('Five Thousand');
    expect(numberToWordsPakistani(0)).toBe('Zero');
  });

  it('formats amount in words with western thousands and currency suffix', () => {
    const pkrWords = amountInWords(19350000, 'PKR');
    expect(pkrWords).toBe('One Hundred Ninety Three Thousand And Five Hundred Rupees Only');

    expect(amountInWords(12000000, 'PKR')).toBe('One Hundred Twenty Thousand Rupees Only');

    const usdWords = amountInWords(500000, 'USD');
    expect(usdWords).toBe('Five Thousand US Dollars Only');

    const gbpWords = amountInWords(350000, 'GBP');
    expect(gbpWords).toBe('Three Thousand And Five Hundred British Pounds Only');
  });

  it('groups thousand separators in amount fields and parses them back', () => {
    expect(formatMajorGrouped(120000)).toBe('120,000');
    expect(formatMajorGrouped('120000.5')).toBe('120,000.5');
    expect(parseMajorGrouped('120,000')).toBe(120000);
    expect(parseMajorGrouped('1,250.50')).toBe(1250.5);
  });

  it('returns appropriate currency symbols', () => {
    expect(getCurrencySymbol('PKR')).toBe('₨');
    expect(getCurrencySymbol('USD')).toBe('$');
    expect(getCurrencySymbol('GBP')).toBe('£');
  });
});

describe('Finance proof upload validation', () => {
  it('rejects disallowed types and oversized files', () => {
    const gif = new File([new Uint8Array([1, 2, 3])], 'slip.gif', { type: 'image/gif' });
    expect(validateFinanceProofFile(gif)).toMatch(/Allowed file types/i);

    const huge = new File([new Uint8Array(8)], 'slip.pdf', { type: 'application/pdf' });
    Object.defineProperty(huge, 'size', { value: FINANCE_PROOF_MAX_BYTES + 1 });
    expect(validateFinanceProofFile(huge)).toMatch(/15MB/i);
  });

  it('rejects empty files and mismatched MIME types', () => {
    const empty = new File([], 'slip.pdf', { type: 'application/pdf' });
    expect(validateFinanceProofFile(empty)).toMatch(/empty/i);

    const exeAsPdf = new File([new Uint8Array([1, 2, 3])], 'slip.pdf', { type: 'application/x-msdownload' });
    expect(validateFinanceProofFile(exeAsPdf)).toMatch(/Allowed file types/i);
  });

  it('accepts a PDF or JPEG under the size cap', () => {
    const pdf = new File([new Uint8Array([1, 2, 3])], 'slip.pdf', { type: 'application/pdf' });
    expect(validateFinanceProofFile(pdf)).toBeNull();
    const jpg = new File([new Uint8Array([1, 2, 3])], 'slip.JPG', { type: 'image/jpeg' });
    expect(validateFinanceProofFile(jpg)).toBeNull();
  });
});

describe('Invoice status resolution', () => {
  it('marks past-due open invoices as overdue and keeps on-hold invoices off that bucket', () => {
    expect(
      resolveInvoiceStatus({
        status: 'issued',
        balance_due: 1000,
        due_date: '2000-01-01',
      }),
    ).toBe('overdue');
    expect(
      resolveInvoiceStatus({
        status: 'void',
        balance_due: 1000,
        due_date: '2000-01-01',
      }),
    ).toBe('void');
    expect(
      resolveInvoiceStatus({
        status: 'deleted',
        balance_due: 1000,
        due_date: '2000-01-01',
      }),
    ).toBe('deleted');
  });
});

describe('Finance Permission Enforcement', () => {
  it('grants admin full manage rights on finance', () => {
    const adminUser = { role: 'admin', is_active: true };
    expect(userCan(adminUser, 'finance', 'view')).toBe(true);
    expect(userCan(adminUser, 'finance', 'create')).toBe(true);
    expect(userCan(adminUser, 'finance', 'manage')).toBe(true);
  });

  it('grants operations full finance access and denies every other non-admin role', () => {
    const opsUser = { role: 'operations', is_active: true };
    expect(userCan(opsUser, 'finance', 'view')).toBe(true);
    expect(userCan(opsUser, 'finance', 'create')).toBe(true);
    expect(userCan(opsUser, 'finance', 'manage')).toBe(true);

    const hrUser = {
      role: 'hr',
      is_active: true,
      permissions: { levels: { finance: 'manage' }, modules: { finance: true } },
    };
    expect(userCan(hrUser, 'finance', 'view')).toBe(false);
  });

  it('denies client and standard team roles finance access by default', () => {
    const clientUser = { role: 'client', is_active: true };
    expect(userCan(clientUser, 'finance', 'view')).toBe(false);

    const devUser = { role: 'developer', is_active: true };
    expect(userCan(devUser, 'finance', 'view')).toBe(false);
  });
});

describe('Invoice number display', () => {
  it('shortens a four-digit year to two digits', () => {
    expect(formatInvoiceNumber('INV-2026-0005')).toBe('INV-26-0005');
    expect(formatInvoiceNumber('INV-26-0005')).toBe('INV-26-0005');
    expect(formatInvoiceNumber('DRAFT-abc')).toBe('DRAFT-abc');
    expect(formatInvoiceNumber(null)).toBe('');
  });
});

describe('Invoice date display', () => {
  it('formats ISO dates as DD-MM-YYYY and leaves blanks as an em dash', () => {
    expect(formatInvoiceDate('2026-11-02')).toBe('02-11-2026');
    expect(formatInvoiceDate('2026-11-02T12:00:00Z')).toBe('02-11-2026');
    expect(formatInvoiceDate(null)).toBe('—');
    expect(formatInvoiceDate('not-a-date')).toBe('not-a-date');
  });
});

describe('Invoice share helpers', () => {
  it('builds an origin-based public invoice URL', () => {
    expect(publicInvoicePath('inv_tok_abc')).toBe('/invoice/inv_tok_abc');
    expect(publicInvoiceUrl('inv_tok_abc', 'https://dataviz.oneworklane.com')).toBe(
      'https://dataviz.oneworklane.com/invoice/inv_tok_abc',
    );
  });

  it('normalizes Pakistan phone numbers for WhatsApp', () => {
    expect(toWhatsAppNumber('03001234567')).toBe('923001234567');
    expect(toWhatsAppNumber('+92 300 1234567')).toBe('923001234567');
    expect(whatsAppShareUrl('hi', '03001234567')).toBe('https://wa.me/923001234567?text=hi');
    expect(whatsAppShareUrl('hi')).toBe('https://wa.me/?text=hi');
  });

  it('blocks edit for paid/void/deleted unless admin', () => {
    expect(invoiceEditBlockedMessage('paid', false)).toMatch(/fully paid/i);
    expect(invoiceEditBlockedMessage('void', false)).toMatch(/on hold/i);
    expect(invoiceEditBlockedMessage('paid', true)).toBeNull();
    expect(invoiceEditBlockedMessage('issued', false)).toBeNull();
  });
});
