import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app, dialog, ipcMain, type BrowserWindow } from 'electron';
import { deserializeProject, serializeProject } from '../core/project';
import { IPC, type Settings } from '../shared/ipc';
import { writeAutosave } from './autosave';
import { resolveMediaPath, toProjectRelative } from './project-io';
import { loadSettings, saveSettings } from './settings';

const PROJECT_FILTER = { name: 'OpenTouch project', extensions: ['otproj'] };

export const settingsFile = () => join(app.getPath('userData'), 'settings.json');
export const untitledFile = () => join(app.getPath('userData'), 'untitled.otproj');

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await loadSettings(settingsFile())), ...patch };
  await saveSettings(settingsFile(), next);
  return next;
}

async function writeAtomic(path: string, data: string): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, data, 'utf8');
  await rename(tmp, path);
}

export function registerProjectIpc(getEditor: () => BrowserWindow | null): void {
  ipcMain.handle(IPC.projectOpen, async () => {
    const win = getEditor();
    const r = win
      ? await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [PROJECT_FILTER] })
      : await dialog.showOpenDialog({ properties: ['openFile'], filters: [PROJECT_FILTER] });
    if (r.canceled || !r.filePaths[0]) return null;
    const path = r.filePaths[0];
    const json = await readFile(path, 'utf8');
    await updateSettings({ lastProject: path });
    return { path, json };
  });

  ipcMain.handle(IPC.projectRead, (_e, path: string) => readFile(path, 'utf8'));

  ipcMain.handle(IPC.projectSave, async (_e, json: string, path: string | null) => {
    let target = path;
    if (!target) {
      const win = getEditor();
      const opts = { defaultPath: 'Untitled.otproj', filters: [PROJECT_FILTER] };
      const r = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
      if (r.canceled || !r.filePath) return null;
      target = r.filePath.endsWith('.otproj') ? r.filePath : `${r.filePath}.otproj`;
    }
    await writeAtomic(target, serializeProject(toProjectRelative(deserializeProject(json), target)));
    await updateSettings({ lastProject: target });
    return target;
  });

  // Autosaves keep absolute media paths so they open from anywhere.
  ipcMain.handle(IPC.projectAutosave, (_e, json: string, path: string | null) => writeAutosave(path ?? untitledFile(), json));

  ipcMain.handle(IPC.projectResolveMedia, (_e, stored: string, projectFile: string | null) => resolveMediaPath(stored, projectFile));

  ipcMain.handle(IPC.projectToRelative, (_e, json: string, projectFile: string) =>
    serializeProject(toProjectRelative(deserializeProject(json), projectFile)),
  );
}
