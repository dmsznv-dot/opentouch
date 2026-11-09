import type { PointRef, Rect, Vec2 } from '../core/types';
import type { DisplayState } from '../shared/ipc';
import type { Mode } from './engine';

export interface EditorState {
  selectedSurfaceId: string | null;
  selectedSourceId: string | null;
  selectedPoints: PointRef[];
  level: 'corners' | 'grid';
  tab: 'output' | 'input';
  snap: boolean;
  testPattern: 'none' | 'selected' | 'all';
  mode: Mode;
  playing: boolean;
  draftMask: Vec2[] | null;
  marquee: Rect | null;
  projectPath: string | null;
  displays: DisplayState;
  outputWanted: boolean;
  outputOpen: boolean;
  message: string | null;
}

export const initialEditorState: EditorState = {
  selectedSurfaceId: null,
  selectedSourceId: null,
  selectedPoints: [],
  level: 'corners',
  tab: 'output',
  snap: true,
  testPattern: 'none',
  mode: 'edit',
  playing: true,
  draftMask: null,
  marquee: null,
  projectPath: null,
  displays: { current: null, all: [] },
  outputWanted: true,
  outputOpen: false,
  message: null,
};

/** Minimal observable for UI-only state (selection, tool, mode). Not part of undo history. */
export class EditorStore {
  private state: EditorState;
  private listeners = new Set<() => void>();

  constructor(initial: EditorState = initialEditorState) {
    this.state = initial;
  }

  get(): EditorState {
    return this.state;
  }

  set(patch: Partial<EditorState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
