import { expect, test } from '@playwright/test';
import { createProject, createSurface } from '../../src/core/project';
import { addSource, addSurface, updateSurface } from '../../src/core/ops';
import type { Project } from '../../src/core/types';
import { classify, px, render } from './helpers';

const W = 320;
const H = 180;

function scene(pattern: 'checker' | 'corners' = 'checker'): Project {
  let p = createProject(W, H);
  p = addSource(p, { id: 'tp', name: 'tp', type: 'testpattern', params: { pattern } });
  p = addSurface(p, { ...createSurface('a', 'A'), sourceId: 'tp' });
  p = addSurface(p, {
    ...createSurface('b', 'B'),
    sourceId: 'tp',
    corners: [
      { x: 0.55, y: 0.1 },
      { x: 0.95, y: 0.2 },
      { x: 0.9, y: 0.95 },
      { x: 0.6, y: 0.8 },
    ],
  });
  return p;
}

function allBlack(buf: Uint8Array): boolean {
  for (let k = 0; k < buf.length; k += 4) if (buf[k] || buf[k + 1] || buf[k + 2]) return false;
  return true;
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  (page as unknown as { errors: string[] }).errors = errors;
  await page.goto('/tests/render/harness.html');
  await page.waitForFunction(() => 'renderToPixels' in window, null, { timeout: 10_000 });
});

test.afterEach(async ({ page }) => {
  expect((page as unknown as { errors: string[] }).errors).toEqual([]);
});

test('pixels outside every surface are exactly 0,0,0', async ({ page }) => {
  const p = scene();
  const buf = await render(page, p, W, H);
  const cls = classify(p, W, H);
  let inside = 0;
  let lit = 0;
  const litOutside: string[] = [];
  for (let k = 0; k < cls.length; k++) {
    const [r, g, b] = [buf[4 * k], buf[4 * k + 1], buf[4 * k + 2]];
    if (cls[k] === 'out' && (r || g || b)) litOutside.push(`${k % W},${Math.floor(k / W)}=${r},${g},${b}`);
    if (cls[k] === 'in') {
      inside++;
      if (r || g || b) lit++;
    }
  }
  expect(litOutside).toEqual([]);
  expect(inside).toBeGreaterThan(1000);
  expect(lit / inside).toBeGreaterThan(0.9);
});

test('hidden surfaces render nothing', async ({ page }) => {
  let p = scene();
  p = updateSurface(updateSurface(p, 'a', { visible: false }), 'b', { visible: false });
  expect(allBlack(await render(page, p, W, H))).toBe(true);
});

test('opacity 0 renders nothing', async ({ page }) => {
  let p = scene();
  p = updateSurface(updateSurface(p, 'a', { opacity: 0 }), 'b', { opacity: 0 });
  expect(allBlack(await render(page, p, W, H))).toBe(true);
});

test('degenerate quad renders nothing', async ({ page }) => {
  let p = scene();
  p = { ...p, surfaces: [p.surfaces[0]] };
  p = updateSurface(p, 'a', {
    corners: [
      { x: 0.1, y: 0.1 },
      { x: 0.5, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.1, y: 0.9 },
    ],
  });
  expect(allBlack(await render(page, p, W, H))).toBe(true);
});

test('surface without source renders black', async ({ page }) => {
  let p = scene();
  p = updateSurface(updateSurface(p, 'a', { sourceId: null }), 'b', { sourceId: null });
  expect(allBlack(await render(page, p, W, H))).toBe(true);
});

test('axis orientation: corners pattern on a full-screen surface', async ({ page }) => {
  let p = scene('corners');
  p = { ...p, surfaces: [p.surfaces[0]] };
  p = updateSurface(p, 'a', {
    corners: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
  });
  const buf = await render(page, p, W, H);
  expect(px(buf, W, 5, 5)).toEqual([255, 0, 0]);
  expect(px(buf, W, W - 5, 5)).toEqual([0, 255, 0]);
  expect(px(buf, W, W - 5, H - 5)).toEqual([0, 0, 255]);
  expect(px(buf, W, 5, H - 5)).toEqual([255, 255, 0]);
});

test('test pattern mode "all" replaces content', async ({ page }) => {
  let p = scene();
  p = updateSurface(updateSurface(p, 'a', { sourceId: null }), 'b', { sourceId: null });
  const buf = await render(page, p, W, H, { testPattern: 'all' });
  expect(allBlack(buf)).toBe(false);
});

test('clip framing rotates and zooms content inside the same surface', async ({ page }) => {
  const p = scene('corners');
  p.surfaces = [p.surfaces[0]];
  const originalCorners = p.surfaces[0].corners;
  const rotated = updateSurface(p, 'a', { cropToFill: true, framing: { rotation: 90, zoom: 1, x: 0, y: 0 } });
  expect(rotated.surfaces[0].corners).toBe(originalCorners);
  const buf = await render(page, rotated, W, H);
  expect(px(buf, W, 85, 50)).toEqual([255, 255, 0]);
  expect(px(buf, W, 235, 50)).toEqual([255, 0, 0]);
  expect(px(buf, W, 235, 130)).toEqual([0, 255, 0]);
  expect(px(buf, W, 85, 130)).toEqual([0, 0, 255]);
  expect(px(buf, W, 75, 50)).toEqual([0, 0, 0]);

  const zoomed = updateSurface(p, 'a', { framing: { rotation: 0, zoom: 2, x: 0.5, y: 0 } });
  const cropped = await render(page, zoomed, W, H);
  expect(px(cropped, W, 85, 50)).toEqual([255, 0, 0]);
  expect(px(cropped, W, 235, 50)).toEqual([255, 0, 0]);
  expect(px(cropped, W, 235, 130)).toEqual([255, 255, 0]);
});
