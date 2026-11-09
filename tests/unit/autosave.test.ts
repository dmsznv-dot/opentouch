import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { autosaveName, latestAutosave, writeAutosave } from '../../src/main/autosave';
import { loadSettings, saveSettings } from '../../src/main/settings';

describe('autosave', () => {
  test('name', () => {
    expect(autosaveName('/a/b.otproj', 3)).toBe('/a/b.otproj.autosave.3');
  });

  test('keeps the 5 most recent copies, .1 is newest', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ot-auto-'));
    const file = join(dir, 'show.otproj');
    expect(await latestAutosave(file)).toBeNull();
    for (let i = 1; i <= 7; i++) await writeAutosave(file, `v${i}`);
    expect(readdirSync(dir).filter((f) => f.includes('.autosave.')).sort()).toEqual([1, 2, 3, 4, 5].map((n) => `show.otproj.autosave.${n}`));
    expect(readFileSync(autosaveName(file, 1), 'utf8')).toBe('v7');
    expect(readFileSync(autosaveName(file, 5), 'utf8')).toBe('v3');
    expect(await latestAutosave(file)).toBe(autosaveName(file, 1));
    expect(existsSync(file)).toBe(false);
  });
});

describe('settings', () => {
  test('defaults and roundtrip', async () => {
    const f = join(mkdtempSync(join(tmpdir(), 'ot-set-')), 'settings.json');
    expect(await loadSettings(f)).toEqual({ lastProject: null, autostart: false, lastMode: 'edit' });
    await saveSettings(f, { lastProject: '/x/Видео.otproj', autostart: true, lastMode: 'show' });
    expect(await loadSettings(f)).toEqual({ lastProject: '/x/Видео.otproj', autostart: true, lastMode: 'show' });
  });
});
