import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, autoUpdater, ipcMain, net, shell } from 'electron';
import { IPC, type UpdateState } from '../shared/ipc';
import { compareVersions, downloadPreview, findPreviewUpdate } from './preview-update';

const RELEASES = 'https://github.com/dmsznv-dot/opentouch/releases';
const VERSION = /^\d+\.\d+\.\d+$/;

function usesSignedUpdater(): boolean {
  try {
    const metadata = JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf8'));
    return metadata.opentouchUpdates === true || metadata.opentouchUpdates === 'true';
  } catch {
    return false;
  }
}

export function registerUpdater(canInstall: () => boolean): void {
  let state: UpdateState = { status: 'idle' };
  let installer: string | null = null;
  autoUpdater.on('error', (error) => {
    state = { status: 'error', detail: error.message };
  });
  autoUpdater.on('update-not-available', () => { state = { status: 'current' }; });
  autoUpdater.on('update-downloaded', () => {
    if (state.status === 'downloading') state = { status: 'ready', version: state.version, method: 'restart' };
  });

  ipcMain.handle(IPC.updateState, () => state);
  ipcMain.handle(IPC.updateCheck, async () => {
    if (state.status === 'checking' || state.status === 'downloading' || state.status === 'ready') return state;
    if (!app.isPackaged || process.platform !== 'darwin' || !['arm64', 'x64'].includes(process.arch)) {
      state = { status: 'unavailable', detail: 'Updates are available in packaged macOS builds.' };
      return state;
    }

    state = { status: 'checking' };
    try {
      if (!usesSignedUpdater()) {
        const fetch = (url: string, init?: RequestInit) => net.fetch(url, init);
        const preview = await findPreviewUpdate(fetch, app.getVersion(), process.arch);
        if (!preview) {
          state = { status: 'current' };
          return state;
        }
        state = { status: 'downloading', version: preview.version };
        installer = await downloadPreview(fetch, preview, app.getPath('temp'));
        state = { status: 'ready', version: preview.version, method: 'dmg' };
        return state;
      }
      const filename = `updates-${process.arch}.json`;
      const response = await net.fetch(`${RELEASES}/latest/download/${filename}`, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`Could not read the release feed (HTTP ${response.status}).`);
      const { currentRelease } = await response.json() as { currentRelease?: unknown };
      if (typeof currentRelease !== 'string' || !VERSION.test(currentRelease)) throw new Error('Invalid release version.');
      if (compareVersions(currentRelease, app.getVersion()) <= 0) {
        state = { status: 'current' };
      } else {
        autoUpdater.setFeedURL({ url: `${RELEASES}/download/v${currentRelease}/${filename}`, serverType: 'json' });
        state = { status: 'downloading', version: currentRelease };
        autoUpdater.checkForUpdates();
      }
    } catch (error) {
      state = { status: 'error', detail: error instanceof Error ? error.message : String(error) };
    }
    return state;
  });
  ipcMain.handle(IPC.updateInstall, async () => {
    if (state.status !== 'ready') return 'Download an update first.';
    if (!canInstall()) return 'Save the project before installing the update.';
    try {
      if (state.method === 'dmg') {
        if (!installer) return 'Download the installer first.';
        const error = await shell.openPath(installer);
        return error || null;
      }
      autoUpdater.quitAndInstall();
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  });
}
