import { expect, test } from '@playwright/test';
import { createProject, createSurface } from '../../src/core/project';
import { addMask, addSource, addSurface } from '../../src/core/ops';
import type { Mask, Project, Vec2 } from '../../src/core/types';
import { px, render } from './helpers';

const W = 200;
const H = 200;

function full(): Project {
  let p = createProject(W, H);
  p = addSource(p, { id: 'tp', name: 'tp', type: 'testpattern', params: { pattern: 'corners' } });
  return addSurface(p, {
    ...createSurface('a', 'A'),
    sourceId: 'tp',
    corners: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
  });
}

const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
const circle = (cx: number, cy: number, r: number): Vec2[] =>
  Array.from({ length: 32 }, (_, k) => ({ x: cx + r * Math.cos((k / 32) * 2 * Math.PI), y: cy + r * Math.sin((k / 32) * 2 * Math.PI) }));
const mask = (id: string, mode: Mask['mode'], points: Vec2[], feather = 0): Mask => ({ id, mode, points, feather });
const lum = (c: number[]) => c[0] + c[1] + c[2];

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/render/harness.html');
  await page.waitForFunction(() => 'renderToPixels' in window, null, { timeout: 10_000 });
});

test('include rectangle clips the surface', async ({ page }) => {
  const p = addMask(full(), 'a', mask('m', 'include', rect(0.25, 0.25, 0.75, 0.75)));
  const buf = await render(page, p, W, H);
  expect(px(buf, W, 20, 20)).toEqual([0, 0, 0]);
  expect(px(buf, W, 180, 180)).toEqual([0, 0, 0]);
  expect(px(buf, W, 60, 60)).toEqual([255, 0, 0]);
  expect(px(buf, W, 140, 140)).toEqual([0, 0, 255]);
});

test('exclude circle cuts a hole inside include', async ({ page }) => {
  let p = addMask(full(), 'a', mask('m', 'include', rect(0.1, 0.1, 0.9, 0.9)));
  p = addMask(p, 'a', mask('e', 'exclude', circle(0.3, 0.3, 0.1)));
  const buf = await render(page, p, W, H);
  expect(px(buf, W, 60, 60)).toEqual([0, 0, 0]);
  expect(px(buf, W, 30, 30)).toEqual([255, 0, 0]);
});

test('exclude without include keeps the rest', async ({ page }) => {
  const p = addMask(full(), 'a', mask('e', 'exclude', rect(0, 0, 0.5, 0.5)));
  const buf = await render(page, p, W, H);
  expect(px(buf, W, 50, 50)).toEqual([0, 0, 0]);
  expect(px(buf, W, 150, 50)).toEqual([0, 255, 0]);
});

test('feather produces a soft edge', async ({ page }) => {
  const p = addMask(full(), 'a', mask('m', 'include', rect(0.25, 0.25, 0.75, 0.75), 10));
  const buf = await render(page, p, W, H);
  const row = Array.from({ length: 40 }, (_, k) => lum(px(buf, W, 30 + k, 100)));
  const max = lum(px(buf, W, 100, 100));
  expect(row.some((v) => v > 0 && v < max)).toBe(true);
  expect(lum(px(buf, W, 5, 100))).toBe(0);
});

test('mask with fewer than 3 points is ignored', async ({ page }) => {
  const plain = await render(page, full(), W, H);
  const p = addMask(full(), 'a', mask('m', 'include', [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }]));
  const buf = await render(page, p, W, H);
  expect(Array.from(buf)).toEqual(Array.from(plain));
});

test('a masked surface on top does not black out the surface below', async ({ page }) => {
  let p = full();
  p = addSurface(p, { ...p.surfaces[0], id: 'top', name: 'top' });
  p = addMask(p, 'top', mask('m', 'include', rect(0.4, 0.4, 0.6, 0.6)));
  const buf = await render(page, p, W, H);
  expect(px(buf, W, 20, 20)).toEqual([255, 0, 0]);
  expect(px(buf, W, 180, 20)).toEqual([0, 255, 0]);
});

test('feather is defined in output pixels, independent of render size', async ({ page }) => {
  const p = addMask(full(), 'a', mask('m', 'include', rect(0.25, 0.25, 0.75, 0.75), 20)); // output is 200 px wide
  const softWidth = (buf: Uint8Array, w: number) => {
    const max = lum(px(buf, w, w / 2, w / 2));
    let n = 0;
    for (let x = 0; x < w / 2; x++) {
      const v = lum(px(buf, w, x, w / 2));
      if (v > 0 && v < max) n++;
    }
    return n / w;
  };
  const big = softWidth(await render(page, p, 200, 200), 200);
  const small = softWidth(await render(page, p, 100, 100), 100);
  expect(Math.abs(big - small)).toBeLessThan(0.03);
});
