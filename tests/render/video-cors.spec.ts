import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { createProject, createSurface } from '../../src/core/project';
import { addSource, addSurface } from '../../src/core/ops';
import { createMediaResponse } from '../../src/main/media-protocol';
import { px, render } from './helpers';

// In Electron the page (file:// or http://localhost) and media (otmedia://) are different origins.
// Serve the fixture from another origin through the real protocol handler and make sure WebGL can upload it.
test('video from another origin (otmedia handler) reaches the surface', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route('http://media.test/**', async (route) => {
    const file = resolve('tests/fixtures/bars.webm');
    const r = await createMediaResponse(file, route.request().headers()['range'] ?? null);
    await route.fulfill({
      status: r.status,
      headers: Object.fromEntries(r.headers.entries()),
      body: Buffer.from(await r.arrayBuffer()),
    });
  });
  await page.goto('/tests/render/harness.html');
  await page.waitForFunction(() => 'renderToPixels' in window, null, { timeout: 10_000 });
  let p = createProject(64, 64);
  p = addSource(p, { id: 'v', name: 'v', type: 'video', params: { path: 'http://media.test/bars.webm', loop: true, rate: 1, muted: true } });
  p = addSurface(p, {
    ...createSurface('a', 'A'),
    sourceId: 'v',
    corners: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
  });
  await render(page, p, 64, 64);
  await page.waitForFunction(() => (window as unknown as { __sources: Map<string, { status: string }> }).__sources.get('v')?.status === 'ready', null, { timeout: 3000 });
  await page.waitForTimeout(300);
  const buf = await render(page, p, 64, 64);
  const [r, g, b] = px(buf, 64, 32, 32);
  expect(r + g + b).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
