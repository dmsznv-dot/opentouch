import { createRoot } from 'react-dom/client';
import type { OpenTouchApi } from '../../src/shared/ipc';
import { createAppContext } from '../../src/renderer/app-context';
import { App } from '../../src/renderer/ui/App';
import { restoreOnStartup, startAutosave } from '../../src/renderer/session';

Object.assign(window, { __autosaves: [] });

const noop = () => () => {};
const api: OpenTouchApi = {
  displays: {
    list: async () => ({ current: null, all: [] }),
    select: async () => ({ current: null, all: [] }),
    onChanged: noop,
  },
  media: {
    pick: async () => ['/tests/fixtures/bars.webm'],
    relink: async () => '/tests/fixtures/bars.webm',
    url: (p) => p,
    pathForFile: () => '/tests/fixtures/bars.webm',
  },
  project: {
    open: async () => (window as unknown as { __nextOpen?: { path: string; json: string } }).__nextOpen ?? null,
    read: async (path) => {
      const f = (window as unknown as { __files?: Record<string, string> }).__files?.[path];
      if (f === undefined) throw new Error('ENOENT');
      return f;
    },
    save: async (_json, path) => path ?? '/tmp/show.otproj',
    autosave: async (json, path) => {
      (window as unknown as { __autosaves: unknown[] }).__autosaves.push({ json, path });
    },
    resolveMedia: async (s) => (s.includes('missing') ? null : s),
    toRelative: async (j) => j,
  },
  app: {
    restoreState: async () =>
      (window as unknown as { __restoreState?: Awaited<ReturnType<OpenTouchApi['app']['restoreState']>> }).__restoreState ?? { open: null, mode: 'edit', fromAutosave: false, projectPath: null },
    setMode: () => {},
    setProjectPath: () => {},
    getSettings: async () => ({ lastProject: null, autostart: false, lastMode: 'edit' }),
    setAutostart: async (on) => ({ lastProject: null, autostart: on, lastMode: 'edit' }),
    onMenu: noop,
  },
};

const ctx = createAppContext(api, { outputUrl: '/src/renderer/output.html' });
Object.assign(window, { __ctx: ctx, __startAutosave: (ms: number) => startAutosave(ctx, ms), __restore: () => restoreOnStartup(ctx) });
createRoot(document.getElementById('root')!).render(<App ctx={ctx} />);
