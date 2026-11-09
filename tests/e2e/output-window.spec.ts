// [Mac] Requires the Electron binary. Run: npm run test:e2e
import { _electron as electron, expect, test } from '@playwright/test';

test('output window: black, no cursor, and the editor actually draws into it (production file:// build)', async () => {
  const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, OPENTOUCH_FAKE_DISPLAY: '1', OPENTOUCH_NO_CLOSE_PROMPT: '1' } });
  const editor = await app.firstWindow();
  await editor.getByTestId('add-surface').click();
  await editor.getByTestId('add-testpattern').click();
  await expect.poll(() => app.windows().length).toBe(2);
  const out = app.windows().find((w) => w !== editor)!;
  await out.waitForLoadState();
  expect(await out.evaluate(() => getComputedStyle(document.body).cursor)).toBe('none');
  const bg = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w) => w.getBackgroundColor()));
  expect(bg.some((c) => c.toUpperCase() === '#000000')).toBe(true);
  // Centre of the default surface shows the test pattern; a far corner stays black.
  const sample = await editor.evaluate(() => {
    const w = window as unknown as { __ctx: { engine: { renderOnce(): void; getOutput(): { canvas: HTMLCanvasElement } | null } } };
    w.__ctx.engine.renderOnce();
    const c = w.__ctx.engine.getOutput()!.canvas;
    const t = document.createElement('canvas');
    t.width = c.width;
    t.height = c.height;
    const g = t.getContext('2d')!;
    g.drawImage(c, 0, 0);
    const at = (x: number, y: number) => Array.from(g.getImageData(Math.floor(x * c.width), Math.floor(y * c.height), 1, 1).data);
    return { centre: at(0.5, 0.5), corner: at(0.02, 0.02) };
  });
  expect(sample.centre.slice(0, 3).reduce((a, b) => a + b)).toBeGreaterThan(0);
  expect(sample.corner.slice(0, 3)).toEqual([0, 0, 0]);
  await app.close();
});
