import { useSyncExternalStore } from 'react';
import type { ProjectStore } from '../../core/store';
import type { Project } from '../../core/types';
import type { EditorState, EditorStore } from '../editor-store';
import type { Engine } from '../engine';

export function useProject<T>(store: ProjectStore, selector: (p: Project) => T): T {
  return useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => selector(store.get()),
  );
}

export function useEditor<T>(editor: EditorStore, selector: (e: EditorState) => T): T {
  return useSyncExternalStore(
    (cb) => editor.subscribe(cb),
    () => selector(editor.get()),
  );
}

/** Re-renders when any source status changes; returns a version counter. */
export function useSourceStatusVersion(engine: Engine): number {
  return useSyncExternalStore(
    (cb) => engine.subscribeStatus(() => {
      version++;
      cb();
    }),
    () => version,
  );
}
let version = 0;
