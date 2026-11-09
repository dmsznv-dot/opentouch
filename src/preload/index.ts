import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('opentouch', {});
