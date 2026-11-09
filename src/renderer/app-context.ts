import { createProject } from '../core/project';
import { ProjectStore } from '../core/store';
import type { OpenTouchApi } from '../shared/ipc';
import { EditorStore } from './editor-store';
import { Engine } from './engine';
import { openProjectorOutput, type ProjectorOutput } from './outputs/projector';
import { OutputToolController } from './ui/interaction/controller';

export interface AppContext {
  api: OpenTouchApi;
  store: ProjectStore;
  editor: EditorStore;
  engine: Engine;
  tool: OutputToolController;
  openOutput(): Promise<void>;
  closeOutput(): void;
}

export interface AppContextOptions {
  outputUrl?: string;
}

export function createAppContext(api: OpenTouchApi, opts: AppContextOptions = {}): AppContext {
  const store = new ProjectStore(createProject());
  const editor = new EditorStore();
  const engine = new Engine(store, { document, mediaUrl: (p) => api.media.url(p) });
  let output: ProjectorOutput | null = null;
  let opening = false;

  const syncEngine = () => {
    const e = editor.get();
    engine.setOverlay({
      selectedSurfaceId: e.selectedSurfaceId,
      selectedPoints: e.selectedPoints,
      level: e.level,
      draftMask: e.draftMask,
      marquee: e.marquee,
    });
    engine.setTestPattern(e.testPattern);
    engine.setMode(e.mode);
  };
  editor.subscribe(syncEngine);
  syncEngine();

  const ctx: AppContext = {
    api,
    store,
    editor,
    engine,
    tool: new OutputToolController(store, editor),
    async openOutput() {
      if (output || opening || !editor.get().displays.current) return;
      opening = true;
      try {
        const o = await openProjectorOutput(opts.outputUrl);
        if (!o) return;
        output = o;
        o.onClosed(() => {
          if (output === o) output = null;
          engine.setOutput(null);
          editor.set({ outputOpen: false });
        });
        engine.setOutput(o);
        editor.set({ outputOpen: true });
      } finally {
        opening = false;
      }
    },
    closeOutput() {
      output?.dispose();
    },
  };

  // Keep the projector window in sync with the wanted state and the connected displays.
  const reconcile = () => {
    const e = editor.get();
    if (e.outputWanted && e.displays.current && !output) void ctx.openOutput();
    if ((!e.outputWanted || !e.displays.current) && output) ctx.closeOutput();
  };
  editor.subscribe(reconcile);
  void api.displays.list().then((d) => editor.set({ displays: d }));
  api.displays.onChanged((d) => editor.set({ displays: d }));
  return ctx;
}
