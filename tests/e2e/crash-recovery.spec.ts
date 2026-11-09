// [Mac] Requires the Electron binary. Run: npm run test:e2e
import { _electron as electron, expect, test } from '@playwright/test';

test('renderer crash reloads the editor and restores the project from autosave', async () => {
  const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, OPENTOUCH_FAKE_DISPLAY: '1' } });
  const win = await app.firstWindow();
  await win.getByTestId('add-surface').click();
  // Force an autosave right away instead of waiting 30 s.
  await win.evaluate(async () => {
    const api = (window as unknown as { opentouch: { project: { autosave(j: string, p: null): Promise<void> } } }).opentouch;
    const ctx = (window as unknown as { __ctx?: { store: { get(): unknown } } }).__ctx;
    await api.project.autosave(JSON.stringify(ctx?.store.get()), null);
  });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.forcefullyCrashRenderer());
  await win.waitForTimeout(3000);
  const w2 = await app.firstWindow();
  await expect(w2.getByTestId('add-surface')).toBeVisible();
  await expect(w2.locator('.row')).toHaveCount(1);
  await app.close();
});
