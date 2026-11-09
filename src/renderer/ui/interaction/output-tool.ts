import { collectHandles, handlesInRect, hitHandle, hitSurface, type Handle } from '../../../core/geometry/hit';
import { snapCandidates, snapPoint } from '../../../core/geometry/snap';
import { newId } from '../../../core/ids';
import { addMask, movePoints, moveSurface } from '../../../core/ops';
import type { ProjectStore } from '../../../core/store';
import type { PointRef, Vec2 } from '../../../core/types';
import type { EditorStore } from '../../editor-store';

/** Pointer interaction on the Output viewport, as a pure state machine (no DOM). Positions are output-normalized. */
export type ToolState = {
  mode: 'idle' | 'dragPoints' | 'dragSurface' | 'marquee' | 'drawMask';
  start: Vec2;
  /** Original position of the dragged handle (snapping target). */
  anchor: Vec2 | null;
  /** Delta already applied to the model during this drag. */
  applied: Vec2;
  surfaceId: string | null;
};

export interface ToolEnv {
  store: ProjectStore;
  editor: EditorStore;
  /** One screen pixel of the viewport, in normalized output units. */
  pxToNorm: Vec2;
  /** One output pixel, in normalized output units. */
  outputPx: Vec2;
}

export type Mods = { shift: boolean };

const HIT_PX = 8;
const SNAP_PX = 8;
const CLICK_PX = 3;
const ZERO = { x: 0, y: 0 };

export const idleTool: ToolState = { mode: 'idle', start: ZERO, anchor: null, applied: ZERO, surfaceId: null };

const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
const radius = (env: ToolEnv, px: number): Vec2 => ({ x: env.pxToNorm.x * px, y: env.pxToNorm.y * px });
const sameRef = (a: PointRef, b: PointRef) => a.surfaceId === b.surfaceId && a.kind === b.kind && a.index === b.index && a.maskId === b.maskId;

function handles(env: ToolEnv): Handle[] {
  const e = env.editor.get();
  return e.selectedSurfaceId ? collectHandles(env.store.get(), e.selectedSurfaceId, e.level) : [];
}

export function pointerDown(s: ToolState, env: ToolEnv, at: Vec2, mods: Mods): ToolState {
  const e = env.editor.get();
  if (s.mode === 'drawMask') {
    const draft = e.draftMask ?? [];
    const r = radius(env, HIT_PX);
    const first = draft[0];
    if (first && draft.length >= 3 && Math.abs(first.x - at.x) <= r.x && Math.abs(first.y - at.y) <= r.y) {
      const sid = e.selectedSurfaceId;
      if (sid) env.store.dispatch('Add mask', (p) => addMask(p, sid, { id: newId('mask'), mode: 'include', points: draft, feather: 0 }));
      env.editor.set({ draftMask: null });
      return idleTool;
    }
    env.editor.set({ draftMask: [...draft, at] });
    return s;
  }

  const hit = hitHandle(handles(env), at, radius(env, HIT_PX));
  if (hit) {
    const already = e.selectedPoints.some((r) => sameRef(r, hit.ref));
    let sel: PointRef[];
    if (mods.shift) sel = already ? e.selectedPoints.filter((r) => !sameRef(r, hit.ref)) : [...e.selectedPoints, hit.ref];
    else sel = already ? e.selectedPoints : [hit.ref];
    env.editor.set({ selectedPoints: sel });
    env.store.begin('Move points');
    return { mode: 'dragPoints', start: at, anchor: hit.pos, applied: ZERO, surfaceId: e.selectedSurfaceId };
  }

  const surfaceId = hitSurface(env.store.get(), at);
  if (surfaceId) {
    if (surfaceId !== e.selectedSurfaceId) env.editor.set({ selectedSurfaceId: surfaceId, selectedSourceId: null, selectedPoints: [] });
    env.store.begin('Move surface');
    return { mode: 'dragSurface', start: at, anchor: null, applied: ZERO, surfaceId };
  }

  if (!mods.shift) env.editor.set({ selectedPoints: [] });
  return { mode: 'marquee', start: at, anchor: null, applied: ZERO, surfaceId: null };
}

export function pointerMove(s: ToolState, env: ToolEnv, at: Vec2, _mods: Mods): ToolState {
  if (s.mode === 'dragPoints' && s.anchor) {
    let target = { x: s.anchor.x + at.x - s.start.x, y: s.anchor.y + at.y - s.start.y };
    if (env.editor.get().snap && s.surfaceId) target = snapPoint(target, snapCandidates(env.store.get(), s.surfaceId), radius(env, SNAP_PX));
    const total = sub(target, s.anchor);
    const step = sub(total, s.applied);
    const refs = env.editor.get().selectedPoints;
    env.store.dispatch('Move points', (p) => movePoints(p, refs, step));
    return { ...s, applied: total };
  }
  if (s.mode === 'dragSurface' && s.surfaceId) {
    const total = sub(at, s.start);
    const step = sub(total, s.applied);
    const id = s.surfaceId;
    env.store.dispatch('Move surface', (p) => moveSurface(p, id, step));
    return { ...s, applied: total };
  }
  if (s.mode === 'marquee') {
    env.editor.set({ marquee: { x: s.start.x, y: s.start.y, w: at.x - s.start.x, h: at.y - s.start.y } });
  }
  return s;
}

export function pointerUp(s: ToolState, env: ToolEnv, at: Vec2): ToolState {
  if (s.mode === 'dragPoints' || s.mode === 'dragSurface') {
    env.store.end();
    return idleTool;
  }
  if (s.mode === 'marquee') {
    const rect = { x: s.start.x, y: s.start.y, w: at.x - s.start.x, h: at.y - s.start.y };
    const tiny = Math.abs(rect.w) < env.pxToNorm.x * CLICK_PX && Math.abs(rect.h) < env.pxToNorm.y * CLICK_PX;
    if (tiny) env.editor.set({ marquee: null, selectedSurfaceId: null, selectedPoints: [] });
    else {
      const picked = handlesInRect(handles(env), rect).map((h) => h.ref);
      const prev = env.editor.get().selectedPoints;
      env.editor.set({ marquee: null, selectedPoints: [...prev, ...picked.filter((r) => !prev.some((q) => sameRef(q, r)))] });
    }
    return idleTool;
  }
  return s;
}

export function cancel(s: ToolState, env: ToolEnv): ToolState {
  if (s.mode === 'dragPoints' || s.mode === 'dragSurface') env.store.cancel();
  if (s.mode === 'drawMask') env.editor.set({ draftMask: null });
  if (s.mode === 'marquee') env.editor.set({ marquee: null });
  return idleTool;
}

export function startMask(_s: ToolState, env: ToolEnv): ToolState {
  if (!env.editor.get().selectedSurfaceId) return idleTool;
  env.editor.set({ draftMask: [], selectedPoints: [] });
  return { ...idleTool, mode: 'drawMask' };
}

/** Arrow keys: selected points, or the whole selected surface, by 1 (or 10) output pixels. */
export function nudge(env: ToolEnv, dir: Vec2, big: boolean): void {
  const k = big ? 10 : 1;
  const delta = { x: dir.x * env.outputPx.x * k, y: dir.y * env.outputPx.y * k };
  const e = env.editor.get();
  if (e.selectedPoints.length) {
    const refs = e.selectedPoints;
    env.store.dispatch('Nudge points', (p) => movePoints(p, refs, delta));
  } else if (e.selectedSurfaceId) {
    const id = e.selectedSurfaceId;
    env.store.dispatch('Nudge surface', (p) => moveSurface(p, id, delta));
  }
}
