import { describe, expect, test } from 'vitest';
import { createProject, createSurface } from '../../src/core/project';
import { addSurface, updateSurface } from '../../src/core/ops';
import { ProjectStore } from '../../src/core/store';
import { EditorStore } from '../../src/renderer/editor-store';
import {
  cancel,
  idleTool,
  nudge,
  pointerDown,
  pointerMove,
  pointerUp,
  startMask,
  type ToolEnv,
} from '../../src/renderer/ui/interaction/output-tool';

function env(): ToolEnv {
  let p = createProject(1920, 1080);
  p = addSurface(p, createSurface('a', 'A')); // corners 0.25..0.75
  p = addSurface(
    p,
    updateSurface({ ...p, surfaces: [createSurface('b', 'B')] }, 'b', {
      corners: [
        { x: 0.8, y: 0.25 },
        { x: 0.95, y: 0.25 },
        { x: 0.95, y: 0.75 },
        { x: 0.8, y: 0.75 },
      ],
    }).surfaces[0],
  );
  const editor = new EditorStore();
  editor.set({ selectedSurfaceId: 'a' });
  return { store: new ProjectStore(p), editor, pxToNorm: { x: 1 / 1000, y: 1 / 1000 }, outputPx: { x: 1 / 1920, y: 1 / 1080 } };
}
const a = (e: ToolEnv) => e.store.get().surfaces[0];

describe('output tool', () => {
  test('dragging a corner moves it by the screen delta', () => {
    const e = env();
    e.editor.set({ snap: false });
    let s = pointerDown(idleTool, e, { x: 0.25, y: 0.25 }, { shift: false });
    s = pointerMove(s, e, { x: 0.26, y: 0.25 }, { shift: false });
    pointerUp(s, e, { x: 0.26, y: 0.25 });
    expect(a(e).corners[0].x).toBeCloseTo(0.26, 9);
    expect(e.editor.get().selectedPoints).toEqual([{ surfaceId: 'a', kind: 'corner', index: 0 }]);
  });

  test('snap pulls a dragged corner onto a neighbour corner within 8 px', () => {
    const e = env();
    let s = pointerDown(idleTool, e, { x: 0.75, y: 0.25 }, { shift: false }); // TR of a
    s = pointerMove(s, e, { x: 0.795, y: 0.25 }, { shift: false }); // 5 px from b TL (0.8, 0.25)
    pointerUp(s, e, { x: 0.795, y: 0.25 });
    expect(a(e).corners[1].x).toBeCloseTo(0.8, 9);
  });

  test('snap does not pull from 12 px away', () => {
    const e = env();
    let s = pointerDown(idleTool, e, { x: 0.75, y: 0.25 }, { shift: false });
    s = pointerMove(s, e, { x: 0.788, y: 0.25 }, { shift: false });
    pointerUp(s, e, { x: 0.788, y: 0.25 });
    expect(a(e).corners[1].x).toBeCloseTo(0.788, 9);
  });

  test('dragging a surface is one undo step', () => {
    const e = env();
    const before = e.store.get();
    let s = pointerDown(idleTool, e, { x: 0.5, y: 0.5 }, { shift: false });
    for (let k = 1; k <= 10; k++) s = pointerMove(s, e, { x: 0.5 + k * 0.01, y: 0.5 }, { shift: false });
    pointerUp(s, e, { x: 0.6, y: 0.5 });
    expect(a(e).corners[0].x).toBeCloseTo(0.35, 9);
    e.store.undo();
    expect(e.store.get()).toBe(before);
  });

  test('marquee selects corners inside the rectangle', () => {
    const e = env();
    let s = pointerDown(idleTool, e, { x: 0.1, y: 0.1 }, { shift: false });
    s = pointerMove(s, e, { x: 0.9 > 0.76 ? 0.76 : 0.9, y: 0.3 }, { shift: false });
    expect(e.editor.get().marquee).not.toBeNull();
    pointerUp(s, e, { x: 0.76, y: 0.3 });
    expect(e.editor.get().selectedPoints.map((r) => r.index).sort()).toEqual([0, 1]);
    expect(e.editor.get().marquee).toBeNull();
  });

  test('drawing a mask: 4 clicks then click on the first point', () => {
    const e = env();
    let s = startMask(idleTool, e);
    for (const p of [
      { x: 0.3, y: 0.3 },
      { x: 0.6, y: 0.3 },
      { x: 0.6, y: 0.6 },
      { x: 0.3, y: 0.6 },
      { x: 0.302, y: 0.301 },
    ]) {
      s = pointerDown(s, e, p, { shift: false });
      s = pointerUp(s, e, p);
    }
    expect(a(e).masks).toHaveLength(1);
    expect(a(e).masks[0]).toMatchObject({ mode: 'include', feather: 0 });
    expect(a(e).masks[0].points).toHaveLength(4);
    expect(e.editor.get().draftMask).toBeNull();
    expect(s.mode).toBe('idle');
  });

  test('Escape during drag restores the state', () => {
    const e = env();
    const before = e.store.get();
    let s = pointerDown(idleTool, e, { x: 0.25, y: 0.25 }, { shift: false });
    s = pointerMove(s, e, { x: 0.4, y: 0.4 }, { shift: false });
    s = cancel(s, e);
    expect(e.store.get()).toBe(before);
    expect(s.mode).toBe('idle');
  });

  test('nudge moves selected points by one output pixel', () => {
    const e = env();
    e.editor.set({ selectedPoints: [{ surfaceId: 'a', kind: 'corner', index: 0 }] });
    nudge(e, { x: 1, y: 0 }, false);
    expect(a(e).corners[0].x).toBeCloseTo(0.25 + 1 / 1920, 12);
    nudge(e, { x: 0, y: 1 }, true);
    expect(a(e).corners[0].y).toBeCloseTo(0.25 + 10 / 1080, 12);
  });

  test('nudge without selected points moves the whole surface', () => {
    const e = env();
    nudge(e, { x: -1, y: 0 }, false);
    expect(a(e).corners[2].x).toBeCloseTo(0.75 - 1 / 1920, 12);
  });

  test('clicking empty space deselects the surface', () => {
    const e = env();
    const s = pointerDown(idleTool, e, { x: 0.05, y: 0.9 }, { shift: false });
    pointerUp(s, e, { x: 0.05, y: 0.9 });
    expect(e.editor.get().selectedSurfaceId).toBeNull();
  });
});
