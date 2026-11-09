import { expect, test, type Page } from '@playwright/test';
import { createProject, createSurface, serializeProject } from '../../src/core/project';
import { addSource, addSurface } from '../../src/core/ops';

type Ctx = {
  store: { get(): { sources: { id: string; params: { path: string } }[]; surfaces: unknown[] }; isDirty(): boolean };
  editor: { get(): { projectPath: string | null; message: string | null; mode: string } };
  engine: { sourceStatus(id: string): { status: string } | null };
};
const ctx = <T,>(page: Page, f: (c: Ctx) => T) => page.evaluate(f as never) as Promise<T>;

function projectWithVideo(path: string) {
  let p = createProject();
  p = addSource(p, { id: 'v1', name: 'clip', type: 'video', params: { path, loop: true, rate: 1, muted: true } });
  return serializeProject(addSurface(p, { ...createSurface('s1', 'S'), sourceId: 'v1' }));
}

async function openWith(page: Page, json: string) {
  await page.evaluate((j) => Object.assign(window, { __nextOpen: { path: '/show/a.otproj', json: j } }), json);
  await page.getByRole('button', { name: 'Open' }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/render/ui.html');
  await page.waitForFunction(() => '__ctx' in window, null, { timeout: 10_000 });
});

test('save clears the dirty marker and names the project', async ({ page }) => {
  await page.getByTestId('add-surface').click();
  await expect(page.getByTestId('dirty')).toHaveCount(1);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('dirty')).toHaveCount(0);
  await expect(page.locator('.topbar')).toContainText('show.otproj');
});

test('opening a project with missing media offers relink', async ({ page }) => {
  await openWith(page, projectWithVideo('media/missing.mp4'));
  await expect(page.getByRole('button', { name: 'Relink' })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __ctx: Ctx }).__ctx.engine.sourceStatus('v1')?.status)).toBe('missing');
  await page.getByRole('button', { name: 'Relink' }).click();
  await expect(page.getByRole('button', { name: 'Relink' })).toHaveCount(0);
  const path = await page.evaluate(() => (window as unknown as { __ctx: Ctx }).__ctx.store.get().sources[0].params.path);
  expect(path).toBe('/tests/fixtures/bars.webm');
});

test('opening a valid project loads it clean', async ({ page }) => {
  await openWith(page, projectWithVideo('/tests/fixtures/bars.webm'));
  await expect(page.locator('.topbar')).toContainText('a.otproj');
  expect(await page.evaluate(() => (window as unknown as { __ctx: Ctx }).__ctx.store.isDirty())).toBe(false);
});

test('corrupted and too-new files show a message and keep the current project', async ({ page }) => {
  await page.getByTestId('add-surface').click();
  await openWith(page, '{');
  await expect(page.locator('.message')).toContainText('повреждён');
  await openWith(page, JSON.stringify({ version: 99, output: { width: 1, height: 1 }, sources: [], surfaces: [] }));
  await expect(page.locator('.message')).toContainText('более новой версией');
  expect(await page.evaluate(() => (window as unknown as { __ctx: Ctx }).__ctx.store.get().surfaces.length)).toBe(1);
});

test('autosave writes only when something changed since the last write', async ({ page }) => {
  await page.evaluate(() => (window as unknown as { __startAutosave(ms: number): void }).__startAutosave(50));
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => (window as unknown as { __autosaves: unknown[] }).__autosaves.length)).toBe(0);
  await page.getByTestId('add-surface').click();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as unknown as { __autosaves: unknown[] }).__autosaves.length)).toBe(1);
});

test('startup restore: crash autosave opens in the last mode and stays dirty', async ({ page }) => {
  await page.evaluate((json) => {
    Object.assign(window, {
      __files: { '/show/a.otproj.autosave.1': json },
      __restoreState: { open: '/show/a.otproj.autosave.1', mode: 'show', fromAutosave: true, projectPath: '/show/a.otproj' },
    });
  }, projectWithVideo('/tests/fixtures/bars.webm'));
  await page.evaluate(() => (window as unknown as { __restore(): Promise<void> }).__restore());
  const st = await page.evaluate(() => {
    const c = (window as unknown as { __ctx: Ctx }).__ctx;
    return { mode: c.editor.get().mode, path: c.editor.get().projectPath, dirty: c.store.isDirty(), n: c.store.get().surfaces.length };
  });
  expect(st).toEqual({ mode: 'show', path: '/show/a.otproj', dirty: true, n: 1 });
});

test('startup restore: unreadable file shows a message', async ({ page }) => {
  await page.evaluate(() => Object.assign(window, { __restoreState: { open: '/gone.otproj', mode: 'show', fromAutosave: false, projectPath: '/gone.otproj' } }));
  await page.evaluate(() => (window as unknown as { __restore(): Promise<void> }).__restore());
  await expect(page.locator('.message')).toContainText('/gone.otproj');
});
