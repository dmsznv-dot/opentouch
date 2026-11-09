import type { EventEmitter } from 'node:events';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IPC } from '../../src/shared/ipc';

const electron = vi.hoisted(() => ({
  app: { isPackaged: true, getAppPath: () => '/fake', getVersion: () => '0.2.9' },
  fetch: vi.fn(),
  handlers: new Map<string, () => unknown>(),
}));
const { updater, setFeedURL, checkForUpdates, quitAndInstall } = vi.hoisted(() => ({
  updater: {} as EventEmitter,
  setFeedURL: vi.fn(),
  checkForUpdates: vi.fn(),
  quitAndInstall: vi.fn(),
}));
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events');
  Object.setPrototypeOf(updater, EventEmitter.prototype);
  Object.assign(updater, { setFeedURL, checkForUpdates, quitAndInstall });
  return {
    app: electron.app,
    autoUpdater: updater,
    net: { fetch: electron.fetch },
    ipcMain: { handle: (key: string, handler: () => unknown) => electron.handlers.set(key, handler) },
  };
});
vi.mock('node:fs', () => ({ readFileSync: () => '{"opentouchUpdates":true}' }));

import { registerUpdater } from '../../src/main/updater';

beforeEach(() => {
  vi.clearAllMocks();
  updater.removeAllListeners();
  electron.handlers.clear();
  electron.app.isPackaged = true;
  vi.stubGlobal('process', Object.create(process, {
    platform: { value: 'darwin' },
    arch: { value: 'arm64' },
  }));
});

afterEach(() => vi.unstubAllGlobals());

const invoke = (key: string) => electron.handlers.get(key)!();

it('downloads an architecture-specific update and waits for a saved project before installing', async () => {
  let canInstall = false;
  electron.fetch.mockResolvedValue({ ok: true, json: async () => ({ currentRelease: '0.2.10' }) });
  registerUpdater(() => canInstall);
  expect(await invoke(IPC.updateCheck)).toEqual({ status: 'downloading', version: '0.2.10' });
  expect(setFeedURL).toHaveBeenCalledWith({ url: expect.stringContaining('/download/v0.2.10/updates-arm64.json'), serverType: 'json' });
  expect(checkForUpdates).toHaveBeenCalledOnce();
  updater.emit('update-downloaded');
  expect(invoke(IPC.updateState)).toEqual({ status: 'ready', version: '0.2.10' });
  expect(invoke(IPC.updateInstall)).toContain('Save');
  expect(quitAndInstall).not.toHaveBeenCalled();
  canInstall = true;
  expect(invoke(IPC.updateInstall)).toBeNull();
  expect(quitAndInstall).toHaveBeenCalledOnce();
});

it('never downloads an older release or checks from a development build', async () => {
  electron.fetch.mockResolvedValue({ ok: true, json: async () => ({ currentRelease: '0.2.8' }) });
  registerUpdater(() => true);
  expect(await invoke(IPC.updateCheck)).toEqual({ status: 'current' });
  expect(checkForUpdates).not.toHaveBeenCalled();
  electron.app.isPackaged = false;
  expect(await invoke(IPC.updateCheck)).toMatchObject({ status: 'unavailable' });
  expect(electron.fetch).toHaveBeenCalledOnce();
});
