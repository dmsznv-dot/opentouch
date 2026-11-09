import { expect, test } from '@playwright/test';
import { createProject, createSurface } from '../../src/core/project';
import { addSource, addSurface } from '../../src/core/ops';

function project() {
  let p = createProject(320, 180);
  p = addSource(p, { id: 'tp', name: 'tp', type: 'testpattern', params: { pattern: 'corners' } });
  return addSurface(p, { ...createSurface('a', 'A'), sourceId: 'tp' });
}

type Probe = { output: number[] | null; editor: number[]; outputClosed: boolean };
type EngineWin = {
  startEngine(json: string): Promise<void>;
  probe(x: number, y: number): Probe;
  setMode(m: 'edit' | 'show'): void;
  closeOutput(): void;
};

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/render/harness.html');
  await page.waitForFunction(() => 'startEngine' in window, null, { timeout: 10_000 });
});

test('engine renders to projector output and editor preview', async ({ page }) => {
  await page.evaluate((json) => (window as unknown as EngineWin).startEngine(json), JSON.stringify(project()));
  await page.waitForTimeout(500);
  // inside surface (centre) — lit on both
  let r = await page.evaluate(() => (window as unknown as EngineWin).probe(0.4, 0.4));
  expect(r.output!.slice(0, 3).reduce((a, b) => a + b)).toBeGreaterThan(0);
  expect(r.editor.slice(0, 3).reduce((a, b) => a + b)).toBeGreaterThan(0);
  // outside — black on output (edit mode has overlay lines only at the surface border)
  r = await page.evaluate(() => (window as unknown as EngineWin).probe(0.05, 0.05));
  expect(r.output!.slice(0, 3)).toEqual([0, 0, 0]);
});

test('show mode hides overlay on output but keeps it in the preview', async ({ page }) => {
  await page.evaluate((json) => (window as unknown as EngineWin).startEngine(json), JSON.stringify(project()));
  // corner handle of surface a sits at (0.25, 0.25)
  let r = await page.evaluate(() => (window as unknown as EngineWin).probe(0.25, 0.25));
  const sum = (a: number[] | null) => (a ? a[0] + a[1] + a[2] : 0);
  expect(sum(r.output)).toBeGreaterThan(600); // white handle on output in edit mode
  await page.evaluate(() => (window as unknown as EngineWin).setMode('show'));
  r = await page.evaluate(() => (window as unknown as EngineWin).probe(0.25, 0.25));
  expect(sum(r.output)).toBeLessThan(600);
  expect(sum(r.editor)).toBeGreaterThan(600);
});

test('closing the projector window is reported and the preview keeps rendering', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.evaluate((json) => (window as unknown as EngineWin).startEngine(json), JSON.stringify(project()));
  await page.evaluate(() => (window as unknown as EngineWin).closeOutput());
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => (window as unknown as EngineWin).probe(0.4, 0.4));
  expect(r.outputClosed).toBe(true);
  expect(r.output).toBeNull();
  expect(r.editor.slice(0, 3).reduce((a, b) => a + b)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
