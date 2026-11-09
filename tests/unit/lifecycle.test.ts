import { describe, expect, test } from 'vitest';
import { decideStartup, RestartLimiter } from '../../src/main/startup-logic';
import type { Settings } from '../../src/shared/ipc';

const s = (p: Partial<Settings> = {}): Settings => ({ lastProject: null, autostart: false, lastMode: 'edit', ...p });

describe('decideStartup', () => {
  test('after a crash: latest autosave in the last mode', () => {
    expect(decideStartup(s({ lastProject: '/p/a.otproj', lastMode: 'show' }), '/p/a.otproj.autosave.1', true, '/p/a.otproj')).toEqual({
      open: '/p/a.otproj.autosave.1',
      mode: 'show',
      fromAutosave: true,
      projectPath: '/p/a.otproj',
    });
  });
  test('autostart with a last project: open it in show mode', () => {
    expect(decideStartup(s({ autostart: true, lastProject: '/p/a.otproj' }), null, false, null)).toEqual({
      open: '/p/a.otproj',
      mode: 'show',
      fromAutosave: false,
      projectPath: '/p/a.otproj',
    });
  });
  test('normal start: empty project in edit mode', () => {
    expect(decideStartup(s({ lastProject: '/p/a.otproj' }), null, false, null)).toEqual({ open: null, mode: 'edit', fromAutosave: false, projectPath: null });
  });
  test('crash without an autosave falls back to the project file', () => {
    expect(decideStartup(s({ lastMode: 'show' }), null, true, '/p/a.otproj')).toEqual({ open: '/p/a.otproj', mode: 'show', fromAutosave: false, projectPath: '/p/a.otproj' });
  });
});

describe('RestartLimiter', () => {
  test('allows 3 restarts per 60 s', () => {
    const r = new RestartLimiter(3, 60_000);
    expect([r.allow(0), r.allow(1000), r.allow(2000), r.allow(3000)]).toEqual([true, true, true, false]);
    expect(r.allow(61_500)).toBe(true);
  });
});
