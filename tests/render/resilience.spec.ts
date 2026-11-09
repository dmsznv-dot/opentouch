import { expect, test } from '@playwright/test';
import { createProject, createSurface } from '../../src/core/project';
import { addSource, addSurface } from '../../src/core/ops';
import { px, render } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/render/harness.html');
  await page.waitForFunction(() => 'renderToPixels' in window, null, { timeout: 10_000 });
});

test('a source that throws renders its surface black and does not break the frame', async ({ page }) => {
  let p = createProject(100, 100);
  p = addSource(p, { id: 'tp', name: 'tp', type: 'testpattern', params: { pattern: 'corners' } });
  p = addSource(p, { id: 'boom', name: 'boom', type: 'testpattern', params: { pattern: 'grid' } });
  p = addSurface(p, { ...createSurface('a', 'A'), sourceId: 'tp' });
  p = addSurface(p, {
    ...createSurface('b', 'B'),
    sourceId: 'boom',
    corners: [
      { x: 0.8, y: 0.8 },
      { x: 0.95, y: 0.8 },
      { x: 0.95, y: 0.95 },
      { x: 0.8, y: 0.95 },
    ],
  });
  await render(page, p, 100, 100);
  await page.evaluate(() => {
    const s = (window as unknown as { __sources: Map<string, { update: () => boolean }> }).__sources.get('boom')!;
    s.update = () => {
      throw new Error('decoder exploded');
    };
  });
  const buf = await render(page, p, 100, 100);
  expect(px(buf, 100, 30, 30)).toEqual([255, 0, 0]);
  expect(px(buf, 100, 88, 88)).toEqual([0, 0, 0]);
});

test('an exception in one frame callback does not stop the output clock', async ({ page }) => {
  page.on('pageerror', () => {});
  const frames = await page.evaluate(() => (window as unknown as { __frameResilience(): Promise<number> }).__frameResilience());
  expect(frames).toBeGreaterThan(5);
});
