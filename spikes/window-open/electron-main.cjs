// [Mac] Throwaway spike. Run from repo root:
//   npx electron@<version> spikes/window-open/electron-main.cjs [tests/fixtures/bars-hevc.mp4]
// Expect: editor window + second window both play the video; console prints pixel values every 2 s.
const { app, BrowserWindow, protocol, net } = require('electron');
const path = require('node:path'); const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../..');
protocol.registerSchemesAsPrivileged([{ scheme: 'spike', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } }]);
app.whenReady().then(() => {
  protocol.handle('spike', (req) => net.fetch(pathToFileURL(path.join(root, decodeURIComponent(new URL(req.url).pathname))).toString()));
  const win = new BrowserWindow({ width: 400, height: 260, backgroundColor: '#111111', webPreferences: { contextIsolation: true } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'allow', overrideBrowserWindowOptions: { backgroundColor: '#000000', width: 340, height: 200 } }));
  const v = process.argv.find((a) => a.endsWith('.mp4') || a.endsWith('.webm')) || 'tests/fixtures/bars.webm';
  win.loadURL(`spike://app/spikes/window-open/index.html?v=/${v}`);
  setInterval(async () => {
    const r = await win.webContents.executeJavaScript('window.result');

    console.log(process.versions.electron, JSON.stringify(r));
  }, 2000);
});
