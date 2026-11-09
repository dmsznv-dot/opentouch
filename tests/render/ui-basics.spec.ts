import { expect, test, type Page } from '@playwright/test';

type Ctx = { store: { get(): { surfaces: { id: string; visible: boolean }[]; sources: { type: string }[] } }; editor: { get(): { selectedSurfaceId: string | null } } };
const project = (page: Page) => page.evaluate(() => (window as unknown as { __ctx: Ctx }).__ctx.store.get());
const editor = (page: Page) => page.evaluate(() => (window as unknown as { __ctx: Ctx }).__ctx.editor.get());

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/render/ui.html');
  await page.waitForFunction(() => '__ctx' in window, null, { timeout: 10_000 });
});

test('add surface selects it', async ({ page }) => {
  await page.getByTestId('add-surface').click();
  const p = await project(page);
  expect(p.surfaces).toHaveLength(1);
  expect((await editor(page)).selectedSurfaceId).toBe(p.surfaces[0].id);
});

test('duplicate and visibility toggle', async ({ page }) => {
  await page.getByTestId('add-surface').click();
  await page.getByTestId('duplicate-surface').click();
  let p = await project(page);
  expect(p.surfaces).toHaveLength(2);
  await page.getByTestId(`visible-${p.surfaces[0].id}`).click();
  p = await project(page);
  expect(p.surfaces[0].visible).toBe(false);
});

test('delete surface', async ({ page }) => {
  await page.getByTestId('add-surface').click();
  await page.getByTestId('delete-surface').click();
  expect((await project(page)).surfaces).toHaveLength(0);
});

test('add test pattern source appears in the list and binds to the selected empty surface', async ({ page }) => {
  await page.getByTestId('add-surface').click();
  await page.getByTestId('add-testpattern').click();
  const p = await project(page);
  expect(p.sources.map((s) => s.type)).toEqual(['testpattern']);
  await expect(page.getByTestId('source-list')).toContainText('Test pattern');
  expect((p.surfaces[0] as unknown as { sourceId: string }).sourceId).toBe((p.sources[0] as unknown as { id: string }).id);
});

test('add video via picker uses the file name', async ({ page }) => {
  await page.getByTestId('add-video').click();
  await expect(page.getByTestId('source-list')).toContainText('bars.webm');
});

test('dirty marker appears after a change', async ({ page }) => {
  await expect(page.getByTestId('dirty')).toHaveCount(0);
  await page.getByTestId('add-surface').click();
  await expect(page.getByTestId('dirty')).toHaveCount(1);
});

test('dragging a corner in the viewport moves it', async ({ page }) => {
  await page.getByTestId('add-surface').click();
  const c = page.getByTestId('output-canvas');
  const box = (await c.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.25);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.25, { steps: 5 });
  await page.mouse.up();
  const p = (await project(page)) as unknown as { surfaces: { corners: { x: number }[] }[] };
  expect(p.surfaces[0].corners[0].x).toBeGreaterThan(0.28);
});

test('inspector: opacity slider and grid toggle update the surface', async ({ page }) => {
  await page.getByTestId('add-surface').click();
  await page.getByTestId('opacity').fill('40');
  await page.getByTestId('grid-enabled').selectOption('on');
  const p = (await project(page)) as unknown as { surfaces: { opacity: number; grid: { cols: number } | null }[] };
  expect(p.surfaces[0].opacity).toBeCloseTo(0.4, 6);
  expect(p.surfaces[0].grid?.cols).toBe(4);
});

test('input tab: dragging the right edge crops the source', async ({ page }) => {
  await page.getByTestId('add-surface').click();
  await page.getByRole('button', { name: 'Input' }).click();
  const c = page.getByTestId('input-canvas');
  const box = (await c.boundingBox())!;
  await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  const p = (await project(page)) as unknown as { surfaces: { inputRect: { x: number; w: number } }[] };
  expect(p.surfaces[0].inputRect.x).toBe(0);
  expect(p.surfaces[0].inputRect.w).toBeGreaterThan(0.55);
  expect(p.surfaces[0].inputRect.w).toBeLessThan(0.65);
});
