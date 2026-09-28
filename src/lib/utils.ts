import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Mostra i recapiti telefonici del contatto post-pivot: telefono + cellulare
 * insieme se entrambi presenti (richiesta clienti 2026-09-28), altrimenti
 * quello disponibile, altrimenti fallback (default "N/D").
 */
export function formatTelefoni(
  telefono?: string | null,
  cellulare?: string | null,
  fallback = 'N/D',
): string {
  const t = telefono?.trim();
  const c = cellulare?.trim();
  if (t && c) return `${t} · ${c}`;
  return t || c || fallback;
}
