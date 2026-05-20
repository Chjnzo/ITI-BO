// Strips every non-digit character from a string (used for phone comparison)
export const stripDigits = (s: string): string => s.replace(/\D/g, '');

// Escapes PostgREST ILIKE special characters
export const escapeLike = (s: string): string => s.replace(/[%_\\]/g, '\\$&');

/**
 * Builds an array of PostgREST OR-clause strings for a lead name/phone search.
 *
 * Strategy:
 * - Split the query into whitespace tokens → each token must match at least one
 *   field (AND between tokens, OR within each token's fields).
 * - If the whole query is phone-like (only digits/spaces/dashes/+), also add a
 *   digit-sequence pattern so "3331234567" matches "333 123 4567" stored in DB.
 */
export function buildLeadSearchClauses(q: string): string[] {
  const trimmed = q.trim();
  if (!trimmed) return [];

  const tokens = trimmed.split(/\s+/).map(escapeLike);

  // Phone-digit pattern: take the last 9 digits and join with % wildcards.
  // e.g. "3331234567" → "%3%3%3%1%2%3%4%5%6%7%" — matches any formatting.
  const digits = stripDigits(trimmed);
  const phonePattern =
    digits.length >= 4 && /^[\d\s\-()+]+$/.test(trimmed)
      ? '%' + digits.slice(-9).split('').join('%') + '%'
      : null;

  return tokens.map((token, i) => {
    const clauses = [
      `nome.ilike.%${token}%`,
      `cognome.ilike.%${token}%`,
      `telefono.ilike.%${token}%`,
    ];
    // Add digit-sequence pattern only on the first (and usually only) token
    if (phonePattern && i === 0) {
      clauses.push(`telefono.ilike.${phonePattern}`);
    }
    return clauses.join(',');
  });
}

/**
 * Client-side check: does a combobox item match the typed query?
 * Handles phone numbers stored with spaces/dashes vs. query typed without.
 */
export function comboboxItemMatches(q: string, label: string, sublabel?: string): boolean {
  const ql = q.toLowerCase();
  if (label.toLowerCase().includes(ql)) return true;
  if (sublabel) {
    if (sublabel.toLowerCase().includes(ql)) return true;
    // Phone normalisation: compare digit sequences
    const qDigits = stripDigits(q);
    if (qDigits.length >= 4 && stripDigits(sublabel).includes(qDigits)) return true;
  }
  return false;
}
