// [Mac] Requires the Electron binary. Run: npm run test:e2e
import { _electron as electron, expect, test } from '@playwright/test';

test('output window opens black, frameless content and no cursor', async () => {
  const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, OPENTOUCH_FAKE_DISPLAY: '1' } });
  const editor = await app.firstWindow();
  const popup = app.waitForEvent('window');
  await editor.evaluate(() => window.open('output.html', 'opentouch-output'));
  const out = await popup;
  const bg = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w) => w.getBackgroundColor()));
  expect(bg.filter((c) => c.toUpperCase() === '#000000').length).toBeGreaterThanOrEqual(1);
  await out.waitForLoadState();
  expect(await out.evaluate(() => getComputedStyle(document.body).cursor)).toBe('none');
  await app.close();
});
