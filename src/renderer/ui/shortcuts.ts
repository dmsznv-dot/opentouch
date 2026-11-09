import type { Vec2 } from '../../core/types';

export type Action =
  | 'duplicate' | 'delete' | 'undo' | 'redo' | 'save' | 'open'
  | 'toggleMode' | 'toggleTest' | 'playPause' | 'toggleLevel' | 'drawMask' | 'toggleSnap' | 'cancel'
  | { nudge: Vec2; big: boolean };

export interface KeyInput {
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
  /** Focus is in a text field: only ⌘ combinations apply. */
  targetIsInput: boolean;
}

const ARROWS: Record<string, Vec2> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

const PLAIN: Record<string, Action> = {
  backspace: 'delete',
  delete: 'delete',
  tab: 'toggleMode',
  t: 'toggleTest',
  ' ': 'playPause',
  g: 'toggleLevel',
  m: 'drawMask',
  s: 'toggleSnap',
  escape: 'cancel',
};

export function resolveShortcut(e: KeyInput): Action | null {
  const key = e.key.toLowerCase();
  if (e.metaKey) {
    if (key === 'z') return e.shiftKey ? 'redo' : 'undo';
    if (key === 'd') return 'duplicate';
    if (key === 's') return 'save';
    if (key === 'o') return 'open';
    return null;
  }
  if (e.targetIsInput) return null;
  if (ARROWS[e.key]) return { nudge: ARROWS[e.key], big: e.shiftKey };
  return PLAIN[key] ?? null;
}
