import { stat } from 'node:fs/promises';
import { app, dialog, ipcMain, type BrowserWindow } from 'electron';
import { IPC } from '../shared/ipc';
import { latestAutosave } from './autosave';
import { settingsFile, untitledFile, updateSettings } from './ipc-project';
import { loadSettings } from './settings';
import { crashAutosaveUsable, decideStartup, RestartLimiter } from './startup-logic';

const RUN_STARTED_AT = Date.now();

async function mtime(p: string): Promise<number | null> {
  try {
    return (await stat(p)).mtimeMs;
  } catch {
    return null;
  }
}

/** App-level IPC (mode, project path, settings, autostart, restore) and the renderer crash watchdog. */
export function installLifecycle(getEditor: () => BrowserWindow | null): { watch(win: BrowserWindow): void } {
  let crashed = false;
  let currentProject: string | null = null;
  const limiter = new RestartLimiter(3, 60_000);

  ipcMain.handle(IPC.appRestoreState, async () => {
    const s = await loadSettings(settingsFile());
    let autosave = crashed ? await latestAutosave(currentProject ?? untitledFile()) : null;
    if (autosave) {
      const a = await mtime(autosave);
      const p = currentProject ? await mtime(currentProject) : null;
      if (a === null || !crashAutosaveUsable(a, p, RUN_STARTED_AT)) autosave = null;
    }
    const state = decideStartup(s, autosave, crashed, currentProject);
    crashed = false;
    return state;
  });
  ipcMain.on(IPC.appSetMode, (_e, mode: 'edit' | 'show') => void updateSettings({ lastMode: mode }));
  ipcMain.on(IPC.appSetProjectPath, (_e, path: string | null) => {
    currentProject = path;
    if (path) void updateSettings({ lastProject: path });
  });
  ipcMain.handle(IPC.appGetSettings, () => loadSettings(settingsFile()));
  ipcMain.handle(IPC.appSetAutostart, async (_e, on: boolean) => {
    if (process.platform === 'darwin' || process.platform === 'win32') app.setLoginItemSettings({ openAtLogin: on });
    return updateSettings({ autostart: on });
  });

  return {
    watch(win: BrowserWindow) {
      win.webContents.on('render-process-gone', (_e, details) => {
        if (details.reason === 'clean-exit') return;
        // Close the projector window so it does not keep a frozen frame; the renderer reopens it.
        for (const child of win.getChildWindows()) child.close();
        const editor = getEditor();
        if (!editor || editor.isDestroyed()) return;
        if (limiter.allow(Date.now())) {
          crashed = true;
          editor.webContents.reload();
        } else {
          void dialog.showMessageBox(editor, {
            type: 'error',
            message: 'OpenTouch renderer keeps crashing',
            detail: 'Restarted 3 times in the last minute. Your latest autosave is next to the project file.',
          });
        }
      });
    },
  };
}
