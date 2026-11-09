import type { BrowserWindow } from 'electron';
import { outputWindowOptions } from './display-logic';
import { FAKE_DISPLAY, type DisplayManager } from './displays';

/** Lets the editor open the projector window via window.open('output.html') and places it on the chosen display. */
export function installOutputWindowHandler(editor: BrowserWindow, displays: DisplayManager): void {
  let output: BrowserWindow | null = null;

  editor.webContents.setWindowOpenHandler(({ url }) => {
    const d = displays.current();
    if (!url.includes('output.html') || !d) return { action: 'deny' };
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        ...outputWindowOptions(d, FAKE_DISPLAY),
        webPreferences: { contextIsolation: true, nodeIntegration: false },
      },
    };
  });

  editor.webContents.on('did-create-window', (win) => {
    output = win;
    win.setMenuBarVisibility(false);
    win.once('ready-to-show', () => {
      if (!FAKE_DISPLAY) {
        if (process.platform === 'darwin') win.setSimpleFullScreen(true);
        else win.setFullScreen(true);
      }
      win.show();
    });
    win.on('closed', () => {
      if (output === win) output = null;
    });
  });

  // The projector went away (or the chosen display changed): close the window; the renderer reopens it.
  displays.on('changed', () => {
    const d = displays.current();
    if (!output || output.isDestroyed()) return;
    const b = output.getBounds();
    const onIt = d && b.x >= d.bounds.x && b.x < d.bounds.x + d.bounds.width && b.y >= d.bounds.y && b.y < d.bounds.y + d.bounds.height;
    if (!onIt) output.close();
  });
}
