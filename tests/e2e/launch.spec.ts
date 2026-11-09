// [Mac] Requires the Electron binary (npm install without ELECTRON_SKIP_BINARY_DOWNLOAD).
import { _electron as electron, expect, test } from '@playwright/test';

test('app launches with the editor window', async () => {
  const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, OPENTOUCH_NO_CLOSE_PROMPT: '1' } });
  const win = await app.firstWindow();
  await expect(win).toHaveTitle('OpenTouch');
  await app.close();
});
