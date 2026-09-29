import { defineConfig, devices } from '@playwright/test';

// Smoke E2E per il flusso "windows v3" (Contatti/Gestione/Task/Agenda) —
// punta al dev server locale su :8080 con lo stack Supabase locale (:54421).
// Non parte automaticamente il server: assumo sia già su (vedi
// docs/riferimento/ambiente_locale.md). Un `webServer` che lo lanci qui
// causerebbe conflitto quando lo tengo già up manualmente.
//
// Utente di test: agente@locale.test / locale123 (seed).

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false, // condividono lo stesso DB locale → serializzo per evitare race
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
