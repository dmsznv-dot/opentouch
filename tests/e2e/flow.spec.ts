// [Mac] Requires the Electron binary. Run: npm run test:e2e
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

type Win = { __ctx: { store: { get(): { surfaces: { sourceId: string | null; corners: unknown }[]; sources: unknown[] } } } };

test('create → duplicate → save → reopen keeps the project', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'ot-e2e-')), 'show.otproj');
  const env = { ...process.env, OPENTOUCH_FAKE_DISPLAY: '1', OPENTOUCH_NO_CLOSE_PROMPT: '1' };
  let app = await electron.launch({ args: ['out/main/index.js'], env });
  let win = await app.firstWindow();
  await win.getByTestId('add-surface').click();
  await win.getByTestId('add-testpattern').click();
  await win.getByTestId('duplicate-surface').click();
  const saved = await win.evaluate(async (f) => {
    const w = window as unknown as Win & { opentouch: { project: { save(j: string, p: string): Promise<string> } } };
    await w.opentouch.project.save(JSON.stringify(w.__ctx.store.get()), f);
    return w.__ctx.store.get();
  }, file);
  await app.close();

  app = await electron.launch({ args: ['out/main/index.js'], env });
  win = await app.firstWindow();
  const reopened = await win.evaluate(async (f) => {
    const w = window as unknown as Win & { opentouch: { project: { read(p: string): Promise<string> } } };
    return JSON.parse(await w.opentouch.project.read(f));
  }, file);
  expect(reopened.surfaces).toHaveLength(2);
  expect(reopened.surfaces[0].sourceId).toBe(saved.surfaces[0].sourceId);
  expect(reopened.surfaces[1].corners).toEqual(saved.surfaces[1].corners);
  await app.close();
});
