// [Mac] Requires the Electron binary. Run: npm run test:e2e
import { _electron as electron, expect, test } from '@playwright/test';

test('renderer crash reloads the editor, restores the project and brings the output back', async () => {
  const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, OPENTOUCH_FAKE_DISPLAY: '1', OPENTOUCH_NO_CLOSE_PROMPT: '1' } });
  const win = await app.firstWindow();
  await win.getByTestId('add-surface').click();
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(2); // output opened
  await win.evaluate(async () => {
    const w = window as unknown as { opentouch: { project: { autosave(j: string, p: null): Promise<void> } }; __ctx: { store: { get(): unknown } } };
    await w.opentouch.project.autosave(JSON.stringify(w.__ctx.store.get()), null);
  });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.getTitle() === 'OpenTouch')!.webContents.forcefullyCrashRenderer());

  // Playwright's page object for the crashed renderer stays dead, so inspect the reloaded editor from the main process.
  const editorRows = () =>
    app.evaluate(async ({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((x) => x.getTitle() === 'OpenTouch');
      if (!w || w.webContents.isCrashed() || w.webContents.isLoading()) return -1;
      return w.webContents.executeJavaScript("document.querySelectorAll('.row').length");
    });
  await expect.poll(editorRows, { timeout: 15_000 }).toBe(1);
  // Output window reopened and the black curtain dropped: editor (#111111) + one black output window.
  await expect
    .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w) => w.getBackgroundColor().toUpperCase()).sort().join(',')), { timeout: 15_000 })
    .toBe('#000000,#111111');
  await app.close();
});
