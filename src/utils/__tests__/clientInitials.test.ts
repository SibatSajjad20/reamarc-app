import { describe, expect, it } from 'vitest';
import { clientInitials } from '../clientInitials';

describe('clientInitials', () => {
  it.each([
    ['Sample Client A', 'SA'],
    ['Apex Transfers LLC', 'AT'],
    ['E2E Client', 'EC'],
    ['Eat 24/7', 'EA'],
    ['nova', 'NO'],
    ['', '?'],
  ])('%s → %s', (name, expected) => {
    expect(clientInitials(name)).toBe(expected);
  });
});
