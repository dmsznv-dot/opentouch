import { newId } from '../core/ids';
import * as ops from '../core/ops';
import { createSurface } from '../core/project';
import type { SourceDef } from '../core/types';
import type { AppContext } from './app-context';

const baseName = (p: string) => p.split(/[\\/]/).pop() || p;

/** User-level commands shared by buttons, menus and shortcuts. */
export function actions(ctx: AppContext) {
  const { store, editor } = ctx;
  const selected = () => editor.get().selectedSurfaceId;

  function bindIfEmpty(sourceId: string): void {
    const id = selected();
    const s = store.get().surfaces.find((x) => x.id === id);
    if (s && s.sourceId === null) store.dispatch('Assign source', (p) => ops.updateSurface(p, s.id, { sourceId }));
  }

  return {
    addSurface(): void {
      const id = newId('srf');
      const n = store.get().surfaces.length + 1;
      store.dispatch('Add surface', (p) => ops.addSurface(p, createSurface(id, `Surface ${n}`)));
      editor.set({ selectedSurfaceId: id, selectedPoints: [], selectedSourceId: null });
    },
    duplicateSurface(): void {
      const id = selected();
      if (!id) return;
      const copy = newId('srf');
      store.dispatch('Duplicate surface', (p) => ops.duplicateSurface(p, id, copy));
      editor.set({ selectedSurfaceId: copy, selectedPoints: [] });
    },
    deleteSelection(): void {
      const e = editor.get();
      if (e.selectedPoints.some((r) => r.kind === 'mask')) {
        // Deleting selected mask points removes those masks.
        const masks = new Set(e.selectedPoints.filter((r) => r.kind === 'mask').map((r) => `${r.surfaceId}/${r.maskId}`));
        store.dispatch('Delete mask', (p) =>
          [...masks].reduce((acc, k) => {
            const [sid, mid] = k.split('/');
            return ops.removeMask(acc, sid, mid);
          }, p),
        );
        editor.set({ selectedPoints: [] });
        return;
      }
      if (e.selectedSurfaceId) {
        const id = e.selectedSurfaceId;
        store.dispatch('Delete surface', (p) => ops.removeSurface(p, id));
        editor.set({ selectedSurfaceId: null, selectedPoints: [] });
      } else if (e.selectedSourceId) {
        const id = e.selectedSourceId;
        store.dispatch('Delete source', (p) => ops.removeSource(p, id));
        editor.set({ selectedSourceId: null });
      }
    },
    toggleVisible(id: string): void {
      const s = store.get().surfaces.find((x) => x.id === id);
      if (s) store.dispatch('Toggle visibility', (p) => ops.updateSurface(p, id, { visible: !s.visible }));
    },
    addVideos(paths: string[]): void {
      const defs: SourceDef[] = paths.map((path) => ({
        id: newId('src'),
        name: baseName(path),
        type: 'video',
        params: { path, loop: true, rate: 1, muted: true },
      }));
      if (!defs.length) return;
      store.dispatch('Add video', (p) => defs.reduce((acc, d) => ops.addSource(acc, d), p));
      bindIfEmpty(defs[0].id);
    },
    async pickVideos(): Promise<void> {
      this.addVideos(await ctx.api.media.pick());
    },
    addSequence(): void {
      const id = newId('src');
      const p = store.get();
      const n = p.sources.filter((s) => s.type === 'sequence').length + 1;
      store.dispatch('Add sequence', (project) => ops.addSource(project, {
        id, name: `Sequence ${n}`, type: 'sequence', params: { clips: [], width: 1920, height: 1080, loop: true },
      }));
      bindIfEmpty(id);
      editor.set({ selectedSourceId: id, selectedSurfaceId: null, selectedPoints: [] });
    },
    addTestPattern(): void {
      const id = newId('src');
      store.dispatch('Add test pattern', (p) => ops.addSource(p, { id, name: 'Test pattern', type: 'testpattern', params: { pattern: 'grid' } }));
      bindIfEmpty(id);
    },
    toggleMode(): void {
      const mode = editor.get().mode === 'edit' ? 'show' : 'edit';
      editor.set({ mode });
      ctx.api.app.setMode(mode);
    },
    cycleTestPattern(): void {
      const order = ['none', 'selected', 'all'] as const;
      const i = order.indexOf(editor.get().testPattern);
      editor.set({ testPattern: order[(i + 1) % order.length] });
    },
    togglePlay(): void {
      if (ctx.engine.isPlaying()) ctx.engine.pause();
      else ctx.engine.play();
      editor.set({ playing: ctx.engine.isPlaying() });
    },
    toggleLevel(): void {
      editor.set({ level: editor.get().level === 'corners' ? 'grid' : 'corners', selectedPoints: [] });
    },
    toggleSnap(): void {
      editor.set({ snap: !editor.get().snap });
    },
    undo: () => store.undo(),
    redo: () => store.redo(),
  };
}

export type Actions = ReturnType<typeof actions>;
