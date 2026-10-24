import { describe, it, expect } from 'vitest';
import {
  majorToMinor,
  minorToMajor,
  formatMinorMoney,
  numberToWordsPakistani,
  amountInWords,
  getCurrencySymbol,
} from '../money';
import { userCan } from '../../hooks/usePermissions';

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

  it('formats amount in words with proper suffix and paisa/cents', () => {
    const pkrWords = amountInWords(12000000, 'PKR');
    expect(pkrWords).toBe('Rupees One Lakh Twenty Thousand Only');

    const usdWords = amountInWords(500000, 'USD');
    expect(usdWords).toBe('US Dollars Five Thousand Only');

    const gbpWords = amountInWords(350000, 'GBP');
    expect(gbpWords).toBe('British Pounds Three Thousand Five Hundred Only');
  });

  it('returns appropriate currency symbols', () => {
    expect(getCurrencySymbol('PKR')).toBe('₨');
    expect(getCurrencySymbol('USD')).toBe('$');
    expect(getCurrencySymbol('GBP')).toBe('£');
  });
});

describe('Finance Permission Enforcement', () => {
  it('grants admin full manage rights on finance', () => {
    const adminUser = { role: 'admin', is_active: true };
    expect(userCan(adminUser, 'finance', 'view')).toBe(true);
    expect(userCan(adminUser, 'finance', 'create')).toBe(true);
    expect(userCan(adminUser, 'finance', 'manage')).toBe(true);
  });

  it('grants operations view rights on finance by default', () => {
    const opsUser = { role: 'operations', is_active: true };
    expect(userCan(opsUser, 'finance', 'view')).toBe(true);
    expect(userCan(opsUser, 'finance', 'create')).toBe(false);
    expect(userCan(opsUser, 'finance', 'manage')).toBe(false);
  });

  it('denies client and standard team roles finance access by default', () => {
    const clientUser = { role: 'client', is_active: true };
    expect(userCan(clientUser, 'finance', 'view')).toBe(false);

    const devUser = { role: 'developer', is_active: true };
    expect(userCan(devUser, 'finance', 'view')).toBe(false);
  });
});
