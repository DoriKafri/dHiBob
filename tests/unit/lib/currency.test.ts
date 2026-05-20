import { describe, it, expect } from 'vitest';
import { currencySymbol, formatCurrency, convertCurrency } from '@/lib/currency';

describe('currency utility — PLN support', () => {
  // T-1: currencySymbol returns the PLN symbol
  it('PLN currency code resolves to zloty symbol', () => {
    expect(currencySymbol('PLN')).toBe('zł');
  });

  // T-2: currencySymbol is case-insensitive for PLN
  it('PLN symbol lookup works regardless of input case', () => {
    expect(currencySymbol('pln')).toBe('zł');
    expect(currencySymbol('Pln')).toBe('zł');
  });

  // T-3: formatCurrency formats a PLN amount correctly
  it('formatting an amount with PLN prepends the zloty symbol', () => {
    expect(formatCurrency(150000, 'PLN')).toBe('zł150,000');
  });

  // T-4: convertCurrency uses PLN fallback rate
  it('currency conversion from PLN to USD uses the correct fallback rate', () => {
    // PLN fallback rate is 0.24, USD is 1 → 1000 * 0.24 / 1 = 240
    expect(convertCurrency(1000, 'PLN', 'USD')).toBe(240);
  });

  // T-5: convertCurrency PLN-to-PLN is identity
  it('converting PLN to PLN returns the same amount', () => {
    expect(convertCurrency(5000, 'PLN', 'PLN')).toBe(5000);
  });

  // T-6: All 10 original currencies still have correct symbols
  it('adding PLN does not corrupt existing currency symbols', () => {
    const expected: Record<string, string> = {
      USD: '$',
      EUR: '€',
      GBP: '£',
      ILS: '₪',
      CAD: 'C$',
      AUD: 'A$',
      CHF: 'CHF',
      JPY: '¥',
      INR: '₹',
      BRL: 'R$',
    };
    for (const [code, symbol] of Object.entries(expected)) {
      expect(currencySymbol(code)).toBe(symbol);
    }
  });
});
