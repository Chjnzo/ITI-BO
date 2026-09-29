import { Page, expect } from '@playwright/test';

// Login con utente seed dello stack locale (supabase/seed.sql).
// Non usa un fixture "storageState" globale perché ogni test parte fresco
// (i test modificano dati e non voglio che l'ordine influisca sul login).
export async function loginAgente(page: Page): Promise<void> {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill('agente@locale.test');
  await page.locator('input[type="password"]').fill('locale123');
  await page.getByRole('button', { name: /^Accedi/i }).click();
  // Aspetta il redirect al dashboard o comunque una pagina admin autenticata.
  await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
}
