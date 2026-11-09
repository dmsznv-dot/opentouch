import { expect, test } from '@playwright/test';
import { createProject, createSurface } from '../../src/core/project';
import { addSurface, setGridSize, updateSurface } from '../../src/core/ops';
import type { OverlayState } from '../../src/renderer/gl/renderer';
import { px, render } from './helpers';

const W = 200;
const H = 200;
const overlay: OverlayState = { selectedSurfaceId: 'a', selectedPoints: [], level: 'corners', draftMask: null, marquee: null };

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/render/harness.html');
  await page.waitForFunction(() => 'renderToPixels' in window, null, { timeout: 10_000 });
});

test('no overlay: frame is black for a surface without source', async ({ page }) => {
  const p = addSurface(createProject(W, H), createSurface('a', 'A'));
  const buf = await render(page, p, W, H);
  expect(px(buf, W, 50, 50)).toEqual([0, 0, 0]);
});

test('overlay draws the selected surface corner handle', async ({ page }) => {
  const p = addSurface(createProject(W, H), createSurface('a', 'A'));
  const buf = await render(page, p, W, H, { overlay });
  const [r, g, b] = px(buf, W, 50, 50);
  expect(r + g + b).toBeGreaterThan(300);
});

test('selected point is orange', async ({ page }) => {
  const p = addSurface(createProject(W, H), createSurface('a', 'A'));
  const buf = await render(page, p, W, H, {
    overlay: { ...overlay, selectedPoints: [{ surfaceId: 'a', kind: 'corner', index: 2 }] },
  });
  const [r, g, b] = px(buf, W, 150, 150);
  expect(r).toBeGreaterThan(200);
  expect(b).toBeLessThan(80);
  expect(g).toBeGreaterThan(80);
});

test('grid level shows interior grid nodes', async ({ page }) => {
  const p = setGridSize(addSurface(createProject(W, H), createSurface('a', 'A')), 'a', 2, 2);
  const buf = await render(page, p, W, H, { overlay: { ...overlay, level: 'grid' } });
  const [r, g, b] = px(buf, W, 100, 100);
  expect(r + g + b).toBeGreaterThan(300);
});

test('invalid surface gets a red outline', async ({ page }) => {
  const p = updateSurface(addSurface(createProject(W, H), createSurface('a', 'A')), 'a', {
    corners: [
      { x: 0.2, y: 0.2 },
      { x: 0.8, y: 0.8 },
      { x: 0.8, y: 0.2 },
      { x: 0.2, y: 0.8 },
    ],
  });
  const buf = await render(page, p, W, H, { overlay: { ...overlay, selectedSurfaceId: null } });
  let red = 0;
  for (let k = 0; k < buf.length; k += 4) if (buf[k] > 200 && buf[k + 1] < 100 && buf[k + 2] < 100) red++;
  expect(red).toBeGreaterThan(50);
});
