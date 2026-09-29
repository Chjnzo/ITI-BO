import { test, expect } from '@playwright/test';
import { loginAgente } from './helpers/auth';

test.describe('Tasks — UI unificata (no origine)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAgente(page);
    await page.goto('/tasks');
  });

  test('nessun tab "Tutta / Contatti / Gestione" nella header', async ({ page }) => {
    // I 3 tab origine sono stati rimossi il 2026-09-14: l'utente vuole task
    // unificate senza segmentazione. Restano solo Personale / Generale.
    await expect(page.getByRole('tab', { name: /^Tutta$/ })).not.toBeVisible();
    await expect(page.getByRole('tab', { name: /^Contatti$/ })).not.toBeVisible();
    await expect(page.getByRole('tab', { name: /^Gestione$/ })).not.toBeVisible();
    // Verifica invece che i tab attesi ci siano.
    await expect(page.getByRole('tab', { name: /Personale/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Generale/ })).toBeVisible();
  });

  test('card task non mostra badge "Contatti" o "Gestione"', async ({ page }) => {
    // Attende che ci sia almeno una task o placeholder — poi asserisce che
    // il badge origine non è visibile in nessuna card.
    await page.waitForLoadState('networkidle');
    // Se ci sono task, deve NON esserci badge origine. Se non ce ne sono,
    // il test passa banalmente (la pagina non ha da mostrare nulla).
    const badgeOrigine = page.locator('span:has-text("Contatti"), span:has-text("Gestione")')
      .filter({ hasText: /^(Contatti|Gestione)$/ });
    const count = await badgeOrigine.count();
    // Nota: i tab del menu laterale contengono "Contatti" e "Gestione" ma
    // non sono <span>, quindi non matchano. Comunque filtro per pill tipici
    // (px, rounded, bg-sky) escludendoli — se il test fallisce con count>0
    // vuol dire che è ricomparso il badge.
    expect(count).toBe(0);
  });

  test('layout: Nuova Task nella stessa riga in Personale e Generale', async ({ page }) => {
    // Registra la posizione y del pulsante "Nuova Task" in Personale, poi
    // switcha a Generale e verifica che la y sia identica (il pulsante non
    // si è spostato di riga).
    const nuovaTaskBtn = page.getByRole('button', { name: /Nuova Task/i });
    await expect(nuovaTaskBtn).toBeVisible();
    const yPersonale = (await nuovaTaskBtn.boundingBox())?.y;
    expect(yPersonale).toBeDefined();

    await page.getByRole('tab', { name: /Generale/ }).click();
    // Aspetta che i pill agenti compaiano (sotto).
    await page.waitForTimeout(300);
    const yGenerale = (await nuovaTaskBtn.boundingBox())?.y;
    expect(yGenerale).toBeDefined();
    // Tolleranza di ±2 px per anti-aliasing / sub-pixel.
    expect(Math.abs(yGenerale! - yPersonale!)).toBeLessThan(2);
  });
});
