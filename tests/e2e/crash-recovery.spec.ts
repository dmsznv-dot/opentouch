// [Mac] Requires the Electron binary. Run: npm run test:e2e
import { _electron as electron, expect, test } from '@playwright/test';

test('renderer crash reloads the editor, restores the project and brings the output back', async () => {
  const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, OPENTOUCH_FAKE_DISPLAY: '1' } });
  const win = await app.firstWindow();
  await win.getByTestId('add-surface').click();
  await expect.poll(() => app.windows().length).toBe(2); // output window opened automatically
  await win.evaluate(async () => {
    const w = window as unknown as { opentouch: { project: { autosave(j: string, p: null): Promise<void> } }; __ctx: { store: { get(): unknown } } };
    await w.opentouch.project.autosave(JSON.stringify(w.__ctx.store.get()), null);
  });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.getTitle() === 'OpenTouch')!.webContents.forcefullyCrashRenderer());
  await expect.poll(async () => (await app.firstWindow()).locator('.row').count(), { timeout: 10_000 }).toBe(1);
  // Output window reopened; curtain dropped; all remaining windows black-backed.
  await expect.poll(() => app.windows().length, { timeout: 10_000 }).toBe(2);
  const colors = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w) => w.getBackgroundColor()));
  expect(colors.filter((c) => c.toUpperCase() === '#000000')).toHaveLength(1);
  await app.close();
});
