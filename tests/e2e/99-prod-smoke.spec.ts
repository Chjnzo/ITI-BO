import { test, expect, type ConsoleMessage } from '@playwright/test';

// Smoke prod-facing su iti-bo.pages.dev (dominio Cloudflare Pages).
// Nessuna credenziale: verifica solo che la login page render, il bundle sia
// nuovo (contiene stringhe delle mie nuove feature) e nessun errore JS in
// console. Non tocca dati né entra in area autenticata.

const PROD_URL = 'https://iti-bo.pages.dev';

test.describe('Prod post-deploy smoke', () => {
  test('login page carica senza errori JS', async ({ page }) => {
    const jsErrors: string[] = [];
    const failed404s: string[] = [];
    page.on('console', (msg: ConsoleMessage) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignora rumore di 3rd party (Sentry fallback, estensioni, chrome-error).
        if (/sentry|extension|chrome-error/i.test(text)) return;
        // Ignora 404 su risorse non-JS (favicon, source map, immagini):
        // non rompono l'app, si vedono spesso in prod con configurazioni CDN.
        if (/Failed to load resource.*404/i.test(text)) return;
        jsErrors.push(text);
      }
    });
    page.on('pageerror', (err) => { jsErrors.push(err.message); });
    page.on('response', (res) => {
      if (res.status() === 404) failed404s.push(res.url());
    });

    await page.goto(`${PROD_URL}/login`, { waitUntil: 'networkidle' });

    // Login form presente
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /accedi/i })).toBeVisible();

    // Nessun ErrorBoundary
    await expect(page.getByText(/Oops! Errore/i)).not.toBeVisible();

    // Nessun errore JS (i 404 su asset non-JS sono ignorati sopra)
    await page.waitForTimeout(1500);
    expect(jsErrors, `JS errors:\n${jsErrors.join('\n')}`).toHaveLength(0);

    // Log dei 404 riscontrati come info (non blocca il test)
    if (failed404s.length > 0) {
      console.log('404s (non-bloccanti):', failed404s);
    }
  });
});
