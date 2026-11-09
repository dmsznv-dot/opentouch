import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, autoUpdater, ipcMain, net } from 'electron';
import { IPC, type UpdateState } from '../shared/ipc';

const RELEASES = 'https://github.com/dmsznv-dot/opentouch/releases';
const VERSION = /^\d+\.\d+\.\d+$/;

function newerVersion(candidate: string, installed: string): boolean {
  if (!VERSION.test(candidate) || !VERSION.test(installed)) return false;
  const from = installed.split('.').map(Number);
  const to = candidate.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (to[i] !== from[i]) return to[i] > from[i];
  }
  return false;
}

function supportsUpdates(): boolean {
  if (!app.isPackaged || process.platform !== 'darwin' || !['arm64', 'x64'].includes(process.arch)) return false;
  try {
    const metadata = JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf8'));
    return metadata.opentouchUpdates === true || metadata.opentouchUpdates === 'true';
  } catch {
    return false;
  }
}

export function registerUpdater(canInstall: () => boolean): void {
  let state: UpdateState = { status: 'idle' };
  autoUpdater.on('error', (error) => {
    state = { status: 'error', detail: error.message };
  });
  autoUpdater.on('update-not-available', () => { state = { status: 'current' }; });
  autoUpdater.on('update-downloaded', () => {
    if (state.status === 'downloading') state = { status: 'ready', version: state.version };
  });

  ipcMain.handle(IPC.updateState, () => state);
  ipcMain.handle(IPC.updateCheck, async () => {
    if (state.status === 'checking' || state.status === 'downloading' || state.status === 'ready') return state;
    if (!supportsUpdates()) {
      state = { status: 'unavailable', detail: 'In-app updates require the signed OpenTouch release.' };
      return state;
    }

    state = { status: 'checking' };
    try {
      const filename = `updates-${process.arch}.json`;
      const response = await net.fetch(`${RELEASES}/latest/download/${filename}`, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`Could not read the release feed (HTTP ${response.status}).`);
      const { currentRelease } = await response.json() as { currentRelease?: unknown };
      if (typeof currentRelease !== 'string' || !VERSION.test(currentRelease)) throw new Error('Invalid release version.');
      if (!newerVersion(currentRelease, app.getVersion())) {
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
  ipcMain.handle(IPC.updateInstall, () => {
    if (state.status !== 'ready') return 'Download an update first.';
    if (!canInstall()) return 'Save the project before installing the update.';
    try {
      autoUpdater.quitAndInstall();
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  });
}
