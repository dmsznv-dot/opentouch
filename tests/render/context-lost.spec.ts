import { expect, test } from '@playwright/test';
import { createProject, createSurface } from '../../src/core/project';
import { addMask, addSource, addSurface } from '../../src/core/ops';
import { classify, render } from './helpers';

const W = 160;
const H = 90;

test('renderer recovers after the WebGL context is lost and restored', async ({ page }) => {
  await page.goto('/tests/render/harness.html');
  await page.waitForFunction(() => 'renderToPixels' in window, null, { timeout: 10_000 });
  let p = createProject(W, H);
  p = addSource(p, { id: 'tp', name: 'tp', type: 'testpattern', params: { pattern: 'checker' } });
  p = addSurface(p, { ...createSurface('a', 'A'), sourceId: 'tp' });
  p = addMask(p, 'a', { id: 'm', mode: 'exclude', points: [{ x: 0.4, y: 0.4 }, { x: 0.5, y: 0.4 }, { x: 0.5, y: 0.5 }], feather: 0 });
  const before = await render(page, p, W, H);
  await page.evaluate(() => (window as unknown as { __loseContext(): Promise<void> }).__loseContext());
  await page.waitForTimeout(500);
  const after = await render(page, p, W, H);
  const cls = classify(p, W, H);
  let lit = 0;
  let litOut = 0;
  for (let k = 0; k < cls.length; k++) {
    const on = after[4 * k] || after[4 * k + 1] || after[4 * k + 2];
    if (cls[k] === 'in' && on) lit++;
    if (cls[k] === 'out' && on) litOut++;
  }
  expect(litOut).toBe(0);
  expect(lit).toBeGreaterThan(500);
  expect(Array.from(after)).toEqual(Array.from(before));
});
