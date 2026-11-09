import { expect, test } from '@playwright/test';
import { createProject, createSurface } from '../../src/core/project';
import { addSource, addSurface } from '../../src/core/ops';
import type { Project } from '../../src/core/types';
import { px, render } from './helpers';

const W = 64;
const H = 64;

function scene(path: string): Project {
  let p = createProject(W, H);
  p = addSource(p, { id: 'v', name: 'v', type: 'video', params: { path, loop: true, rate: 1, muted: true } });
  return addSurface(p, {
    ...createSurface('a', 'A'),
    sourceId: 'v',
    corners: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
  });
}

async function waitStatus(page: import('@playwright/test').Page, status: string) {
  await page.waitForFunction(
    (s) => (window as unknown as { __sources: Map<string, { status: string }> }).__sources.get('v')?.status === s,
    status,
    { timeout: 3000 },
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/render/harness.html');
  await page.waitForFunction(() => 'renderToPixels' in window, null, { timeout: 10_000 });
});

test('video source renders frames', async ({ page }) => {
  const p = scene('/tests/fixtures/bars.webm');
  await render(page, p, W, H);
  await waitStatus(page, 'ready');
  await page.waitForTimeout(500);
  const buf = await render(page, p, W, H);
  const [r, g, b] = px(buf, W, 32, 32);
  expect(r + g + b).toBeGreaterThan(0);
});

test('missing video -> error status and black frame', async ({ page }) => {
  const p = scene('/tests/fixtures/does-not-exist.webm');
  await render(page, p, W, H);
  await waitStatus(page, 'error');
  const buf = await render(page, p, W, H);
  expect(px(buf, W, 32, 32)).toEqual([0, 0, 0]);
});
