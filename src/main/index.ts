import { join } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, protocol } from 'electron';
import { IPC } from '../shared/ipc';
import { pathFromMediaUrl } from '../shared/media-url';
import { DisplayManager } from './displays';
import { createMediaResponse } from './media-protocol';
import { installOutputWindowHandler } from './output-window';
import { registerProjectIpc } from './ipc-project';
import { installLifecycle } from './lifecycle';

protocol.registerSchemesAsPrivileged([
  { scheme: 'otmedia', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true } },
]);

const VIDEO_FILTER = { name: 'Video', extensions: ['mp4', 'mov', 'm4v', 'webm'] };

let editor: BrowserWindow | null = null;

function createEditorWindow(displays: DisplayManager): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    title: 'OpenTouch',
    backgroundColor: '#111111',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.once('ready-to-show', () => win.show());
  installOutputWindowHandler(win, displays);
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void win.loadFile(join(__dirname, '../renderer/index.html'));
  return win;
}

function registerIpc(displays: DisplayManager): void {
  ipcMain.handle(IPC.displaysList, () => displays.state());
  ipcMain.handle(IPC.displaysSelect, (_e, id: number | null) => displays.select(id));
  displays.on('changed', (s) => editor?.webContents.send(IPC.displaysChanged, s));
  ipcMain.handle(IPC.mediaPick, async () => {
    const r = await dialog.showOpenDialog(editor!, { properties: ['openFile', 'multiSelections'], filters: [VIDEO_FILTER] });
    return r.canceled ? [] : r.filePaths;
  });
  ipcMain.handle(IPC.mediaRelink, async () => {
    const r = await dialog.showOpenDialog(editor!, { properties: ['openFile'], filters: [VIDEO_FILTER] });
    return r.canceled ? null : r.filePaths[0];
  });
}

app.whenReady().then(() => {
  protocol.handle('otmedia', (req) => createMediaResponse(pathFromMediaUrl(req.url), req.headers.get('range')));
  const displays = new DisplayManager();
  registerIpc(displays);
  registerProjectIpc(() => editor);
  const lifecycle = installLifecycle(() => editor);
  editor = createEditorWindow(displays);
  lifecycle.watch(editor);
  editor.on('closed', () => (editor = null));
});

app.on('window-all-closed', () => app.quit());
