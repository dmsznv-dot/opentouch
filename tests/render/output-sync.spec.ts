import { expect, test } from '@playwright/test';

test('opening the projector output writes its pixel size and display into the project (no undo step)', async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, {
      __display: { id: 7, label: 'Projector', bounds: { x: 1512, y: 0, width: 1280, height: 800 }, scaleFactor: 1, primary: false },
    });
  });
  await page.goto('/tests/render/ui.html');
  await page.waitForFunction(() => '__ctx' in window, null, { timeout: 10_000 });
  type C = { __ctx: { store: { get(): { output: { width: number; height: number; displayHint?: { id: number } } }; canUndo(): boolean }; engine: { getOutput(): { width: number; height: number } | null } } };
  await page.waitForFunction(() => (window as unknown as C).__ctx.engine.getOutput() !== null, null, { timeout: 5000 });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const c = (window as unknown as C).__ctx;
        const o = c.engine.getOutput()!;
        const out = c.store.get().output;
        return out.width === o.width && out.height === o.height && out.displayHint?.id === 7 && !c.store.canUndo();
      }),
    )
    .toBe(true);
});
