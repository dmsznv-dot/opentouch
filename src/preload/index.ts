import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron';
import { IPC, type DisplayState, type OpenTouchApi } from '../shared/ipc';
import { mediaUrlFromPath } from '../shared/media-url';

function listen<T>(channel: string, cb: (v: T) => void): () => void {
  const h = (_e: IpcRendererEvent, v: T) => cb(v);
  ipcRenderer.on(channel, h);
  return () => ipcRenderer.removeListener(channel, h);
}

const api: OpenTouchApi = {
  displays: {
    list: () => ipcRenderer.invoke(IPC.displaysList),
    select: (id) => ipcRenderer.invoke(IPC.displaysSelect, id),
    onChanged: (cb) => listen<DisplayState>(IPC.displaysChanged, cb),
  },
  media: {
    pick: () => ipcRenderer.invoke(IPC.mediaPick),
    relink: () => ipcRenderer.invoke(IPC.mediaRelink),
    url: (p) => mediaUrlFromPath(p),
    pathForFile: (f) => webUtils.getPathForFile(f),
  },
  project: {
    open: () => ipcRenderer.invoke(IPC.projectOpen),
    read: (path) => ipcRenderer.invoke(IPC.projectRead, path),
    save: (json, path) => ipcRenderer.invoke(IPC.projectSave, json, path),
    autosave: (json, path) => ipcRenderer.invoke(IPC.projectAutosave, json, path),
    resolveMedia: (stored, file) => ipcRenderer.invoke(IPC.projectResolveMedia, stored, file),
    toRelative: (json, file) => ipcRenderer.invoke(IPC.projectToRelative, json, file),
  },
  app: {
    restoreState: () => ipcRenderer.invoke(IPC.appRestoreState),
    setMode: (m) => ipcRenderer.send(IPC.appSetMode, m),
    setProjectPath: (p) => ipcRenderer.send(IPC.appSetProjectPath, p),
    getSettings: () => ipcRenderer.invoke(IPC.appGetSettings),
    setAutostart: (on) => ipcRenderer.invoke(IPC.appSetAutostart, on),
    onMenu: (cb) => listen<string>(IPC.appMenu, cb),
  },
};

contextBridge.exposeInMainWorld('opentouch', api);
