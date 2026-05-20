/**
 * Map a currency code to its display symbol. Used in salary tables,
 * compensation reports, and anywhere amounts are rendered with a
 * currency prefix.
 */
const SYMBOLS: Record<string, string> = {
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
  PLN: 'zł',
};

export function currencySymbol(code?: string | null): string {
  if (!code) return '$';
  return SYMBOLS[code.toUpperCase()] || code;
}

export function formatCurrency(amount: number, code?: string | null): string {
  if (amount === 0) return '—';
  return `${currencySymbol(code)}${amount.toLocaleString()}`;
}

/**
 * Hardcoded fallback rates to USD. Used when the live API is
 * unreachable or on first request before the cache is warm.
 */
const FALLBACK_RATES_TO_USD: Record<string, number> = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.27,
  ILS: 0.28,
  CAD: 0.73,
  AUD: 0.65,
  CHF: 1.12,
  JPY: 0.0067,
  INR: 0.012,
  BRL: 0.19,
  PLN: 0.24,
};

export type ExchangeRates = Record<string, number>;

/**
 * Convert an amount from one currency to another.
 * Accepts an optional live-rates object; falls back to hardcoded rates.
 */
export function convertCurrency(
  amount: number,
  from: string,
  to: string,
  rates?: ExchangeRates | null,
): number {
  if (from === to || amount === 0) return amount;
  const table = rates && Object.keys(rates).length > 0 ? rates : FALLBACK_RATES_TO_USD;
  const fromRate = table[from.toUpperCase()] ?? 1;
  const toRate = table[to.toUpperCase()] ?? 1;
  return Math.round((amount * fromRate) / toRate);
}

// ---------------------------------------------------------------------------
// Server-side live-rate fetcher with 24h in-memory cache.
// Only runs in Node.js (tRPC procedures). The client receives the
// cached rates via a tRPC query and passes them to convertCurrency().
// ---------------------------------------------------------------------------

let cachedRates: ExchangeRates | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Fetch today's exchange rates from the ECB via frankfurter.app (free,
 * no API key). Returns rates relative to USD. Caches for 24h.
 * Falls back to hardcoded rates on failure.
 */
export async function getExchangeRates(): Promise<ExchangeRates> {
  if (cachedRates && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedRates;
  }
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD');
    if (!res.ok) throw new Error(`frankfurter ${res.status}`);
    const data = await res.json();
    // data.rates is { EUR: 0.92, GBP: 0.79, ILS: 3.6, ... } (how many X per 1 USD)
    // We want rates TO USD: EUR→USD = 1/0.92 ≈ 1.087
    const ratesToUsd: ExchangeRates = { USD: 1 };
    for (const [code, perUsd] of Object.entries(data.rates as Record<string, number>)) {
      ratesToUsd[code] = 1 / perUsd;
    }
    cachedRates = ratesToUsd;
    cacheTimestamp = Date.now();
    console.log(`[exchange-rates] refreshed ${Object.keys(ratesToUsd).length} rates from ECB`);
    return cachedRates;
  } catch (err) {
    console.error('[exchange-rates] fetch failed, using fallback:', (err as Error).message);
    return FALLBACK_RATES_TO_USD;
  }
}
