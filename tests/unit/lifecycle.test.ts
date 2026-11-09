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

import { crashAutosaveUsable } from '../../src/main/startup-logic';

describe('crashAutosaveUsable', () => {
  const start = 1_000;
  test('autosave written in this run and newer than the project file is used', () => {
    expect(crashAutosaveUsable(5_000, 4_000, start)).toBe(true);
  });
  test('autosave older than the saved project file is ignored', () => {
    expect(crashAutosaveUsable(4_000, 5_000, start)).toBe(false);
  });
  test('autosave left over from an earlier session is ignored', () => {
    expect(crashAutosaveUsable(900, null, start)).toBe(false);
  });
  test('untitled project: any autosave from this run is used', () => {
    expect(crashAutosaveUsable(2_000, null, start)).toBe(true);
  });
});
