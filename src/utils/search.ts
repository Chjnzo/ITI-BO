// Strips every non-digit character from a string (used for phone comparison)
export const stripDigits = (s: string): string => s.replace(/\D/g, '');

// Escapes PostgREST ILIKE special characters
export const escapeLike = (s: string): string => s.replace(/[%_\\]/g, '\\$&');

// Regex per riconoscere una query composta SOLO da cifre, spazi, trattini,
// parentesi, punti o +. Se una query è tutta phone-like non ha senso cercarla
// su nome/cognome/email/via: usiamo la sola digit-sequence su telefono e
// cellulare, così qualunque formato in input matcha qualunque formato in DB.
const PHONE_LIKE_RE = /^[\d\s\-().+]+$/;

// Genera il pattern ILIKE "digit sequence" per matchare un numero di telefono
// indipendentemente dagli spazi/dashes con cui è salvato in DB. Prende le
// ultime 9 cifre (più che sufficienti per un mobile italiano senza prefisso
// internazionale) e le intervalla con `%`.
// Esempio: "3280886930" → "%2%8%0%8%8%6%9%3%0%".
const digitSequencePattern = (digits: string): string =>
  '%' + digits.slice(-9).split('').join('%') + '%';

/**
 * Builds an array of PostgREST OR-clause strings for a contact search.
 *
 * Strategy:
 * - Se la query è **completamente phone-like** (solo cifre + separatori):
 *   ritorna un unico clause con la digit-sequence su telefono/cellulare.
 *   Copre tutti i formati sia in input ("328 088 6930", "328-088-6930",
 *   "3280886930", "328 0886 930") sia in DB. NON si cerca su nome/cognome/
 *   email/via perché non ha senso.
 * - Altrimenti (query mista o testuale): split per whitespace, ogni token
 *   deve matchare almeno un campo (AND tra token, OR dentro i campi del
 *   token). I campi coperti sono nome/cognome/telefono/cellulare + extra.
 *
 * @param q  Testo digitato dall'utente.
 * @param extraFields  Colonne aggiuntive da coprire, specifiche della tabella
 *   (es. `['via_immobile', 'citta_immobile']` per proprietari). Vengono
 *   incluse in ogni token con lo stesso ILIKE dei campi base — solo in
 *   modalità "testuale", non quando la query è phone-like.
 */
export function buildLeadSearchClauses(q: string, extraFields: string[] = []): string[] {
  const trimmed = q.trim();
  if (!trimmed) return [];

  const digits = stripDigits(trimmed);

  // Query interamente phone-like: singolo clause su telefono/cellulare con
  // digit-sequence. Ignora la tokenizzazione — così "328 0886 930" (input)
  // matcha "328 088 6930" (DB) e viceversa, senza dipendere dal fatto che
  // ogni token separato si trovi consecutivo nella stringa salvata.
  if (digits.length >= 4 && PHONE_LIKE_RE.test(trimmed)) {
    const pattern = digitSequencePattern(digits);
    return [
      [`telefono.ilike.${pattern}`, `cellulare.ilike.${pattern}`].join(','),
    ];
  }

  // Query testuale (o mista): comportamento a token.
  const tokens = trimmed.split(/\s+/).map(escapeLike);
  return tokens.map((token) => {
    const clauses = [
      `nome.ilike.%${token}%`,
      `cognome.ilike.%${token}%`,
      `telefono.ilike.%${token}%`,
      `cellulare.ilike.%${token}%`,
      ...extraFields.map((f) => `${f}.ilike.%${token}%`),
    ];
    return clauses.join(',');
  });
}

/**
 * Ritorna `true` se la stringa è composta solo da cifre e separatori tipici di
 * un numero di telefono (spazi, trattini, punti, parentesi, +) e contiene
 * almeno 4 cifre. Usato dai filtri client-side per applicare la stessa
 * normalizzazione digit-only del server-side quando l'utente cerca per
 * telefono.
 */
export const isPhoneLikeQuery = (q: string): boolean => {
  const trimmed = q.trim();
  return trimmed.length > 0 && PHONE_LIKE_RE.test(trimmed) && stripDigits(trimmed).length >= 4;
};

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
