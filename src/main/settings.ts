import { readFile, rename, writeFile } from 'node:fs/promises';
import type { Settings } from '../shared/ipc';

export const DEFAULT_SETTINGS: Settings = { lastProject: null, autostart: false, lastMode: 'edit' };

export async function loadSettings(file: string): Promise<Settings> {
  try {
    const data = JSON.parse(await readFile(file, 'utf8')) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...data };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(file: string, s: Settings): Promise<void> {
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(s, null, 2), 'utf8');
  await rename(tmp, file);
}
