import { createRoot } from 'react-dom/client';
import type { OpenTouchApi } from '../../src/shared/ipc';
import { createAppContext } from '../../src/renderer/app-context';
import { App } from '../../src/renderer/ui/App';

const noop = () => () => {};
const api: OpenTouchApi = {
  displays: {
    list: async () => ({ current: null, all: [] }),
    select: async () => ({ current: null, all: [] }),
    onChanged: noop,
  },
  media: {
    pick: async () => ['/tests/fixtures/bars.webm'],
    relink: async () => null,
    url: (p) => p,
    pathForFile: () => '/tests/fixtures/bars.webm',
  },
  project: {
    open: async () => null,
    read: async () => '',
    save: async () => '/tmp/x.otproj',
    autosave: async () => {},
    resolveMedia: async (s) => s,
    toRelative: async (j) => j,
  },
  app: {
    restoreState: async () => ({ open: null, mode: 'edit', fromAutosave: false, projectPath: null }),
    setMode: () => {},
    setProjectPath: () => {},
    getSettings: async () => ({ lastProject: null, autostart: false, lastMode: 'edit' }),
    setAutostart: async (on) => ({ lastProject: null, autostart: on, lastMode: 'edit' }),
    onMenu: noop,
  },
};

const ctx = createAppContext(api, { outputUrl: '/src/renderer/output.html' });
Object.assign(window, { __ctx: ctx });
createRoot(document.getElementById('root')!).render(<App ctx={ctx} />);
