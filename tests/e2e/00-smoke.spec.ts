import { test, expect } from '@playwright/test';
import { loginAgente } from './helpers/auth';

// Verifica minima: le pagine principali caricano senza triggerare
// l'ErrorBoundary globale ("Oops! Errore"). Non asserisce contenuti — solo
// che il render non crashi. È il canary contro regressioni tipo "PostgREST
// null vs array" o "colonna mancante" che rompono tutto silenziosamente.

const ROTTE = [
  { url: '/', nome: 'Dashboard' },
  { url: '/tasks', nome: 'Tasks' },
  { url: '/gestione', nome: 'Gestione' },
  { url: '/contatti', nome: 'Contatti' },
  { url: '/agenda', nome: 'Agenda' },
  { url: '/immobili', nome: 'Immobili' },
];

test.describe('Smoke: pagine caricano senza crash', () => {
  test.beforeEach(async ({ page }) => {
    await loginAgente(page);
  });

  for (const rotta of ROTTE) {
    test(`${rotta.nome} (${rotta.url}) non crasha`, async ({ page }) => {
      await page.goto(rotta.url);
      // Non deve apparire il fallback ErrorBoundary.
      await expect(page.getByText(/Oops! Errore/i)).not.toBeVisible({ timeout: 5000 });
      // La sidebar (segno di layout autenticato) è presente.
      await expect(page.locator('nav, aside').first()).toBeVisible();
    });
  }
});
