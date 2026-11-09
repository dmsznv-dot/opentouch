import { join } from 'node:path';
import { app, BrowserWindow, protocol } from 'electron';
import { pathFromMediaUrl } from '../shared/media-url';
import { createMediaResponse } from './media-protocol';

protocol.registerSchemesAsPrivileged([
  { scheme: 'otmedia', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } },
]);

function createEditorWindow(): BrowserWindow {
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
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
  return win;
}

app.whenReady().then(() => {
  protocol.handle('otmedia', (req) => createMediaResponse(pathFromMediaUrl(req.url), req.headers.get('range')));
  createEditorWindow();
});

app.on('window-all-closed', () => app.quit());
