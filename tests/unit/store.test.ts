import { describe, expect, test } from 'vitest';
import { createProject, createSurface } from '../../src/core/project';
import { addSurface, movePoints } from '../../src/core/ops';
import { ProjectStore } from '../../src/core/store';

function store() {
  return new ProjectStore(addSurface(createProject(), createSurface('s1', 'One')));
}
const corner0 = [{ surfaceId: 's1', kind: 'corner' as const, index: 0 }];

describe('ProjectStore', () => {
  test('dispatch / undo / redo', () => {
    const s = store();
    const initial = s.get();
    s.dispatch('move', (p) => movePoints(p, corner0, { x: 0.1, y: 0 }));
    const moved = s.get();
    expect(moved).not.toBe(initial);
    s.undo();
    expect(s.get()).toBe(initial);
    s.redo();
    expect(s.get()).toBe(moved);
  });

  test('a drag transaction is one undo step', () => {
    const s = store();
    const initial = s.get();
    s.begin('drag');
    for (let i = 0; i < 50; i++) s.dispatch('move', (p) => movePoints(p, corner0, { x: 0.001, y: 0 }));
    s.end();
    expect(s.get().surfaces[0].corners[0].x).toBeCloseTo(0.3, 9);
    s.undo();
    expect(s.get()).toBe(initial);
    expect(s.canUndo()).toBe(false);
  });

  test('cancel restores pre-transaction state without history', () => {
    const s = store();
    const initial = s.get();
    s.begin('drag');
    s.dispatch('move', (p) => movePoints(p, corner0, { x: 0.1, y: 0 }));
    s.cancel();
    expect(s.get()).toBe(initial);
    expect(s.canUndo()).toBe(false);
  });

  test('history is capped at 200', () => {
    const s = store();
    for (let i = 0; i < 250; i++) s.dispatch('move', (p) => movePoints(p, corner0, { x: 0.0001, y: 0 }));
    let n = 0;
    while (s.canUndo()) {
      s.undo();
      n++;
    }
    expect(n).toBe(200);
  });

  test('dirty tracking', () => {
    const s = store();
    expect(s.isDirty()).toBe(false);
    s.dispatch('move', (p) => movePoints(p, corner0, { x: 0.1, y: 0 }));
    expect(s.isDirty()).toBe(true);
    s.markSaved();
    expect(s.isDirty()).toBe(false);
    s.dispatch('move', (p) => movePoints(p, corner0, { x: 0.1, y: 0 }));
    s.replace(createProject());
    expect(s.isDirty()).toBe(false);
    expect(s.canUndo()).toBe(false);
  });

  test('subscribers are notified', () => {
    const s = store();
    let calls = 0;
    const off = s.subscribe(() => calls++);
    s.dispatch('move', (p) => movePoints(p, corner0, { x: 0.1, y: 0 }));
    s.undo();
    off();
    s.redo();
    expect(calls).toBe(2);
  });
});

describe('ProjectStore.rebase', () => {
  test('changes every snapshot without adding history and marks dirty', () => {
    const s = store();
    s.dispatch('move', (p) => movePoints(p, corner0, { x: 0.1, y: 0 }));
    const undoable = s.canUndo();
    s.rebase((p) => ({ ...p, output: { ...p.output, width: 1280, height: 800 } }));
    expect(s.get().output.width).toBe(1280);
    expect(s.isDirty()).toBe(true);
    expect(s.canUndo()).toBe(undoable);
    s.undo();
    expect(s.get().output.width).toBe(1280);
    expect(s.get().surfaces[0].corners[0].x).toBeCloseTo(0.25, 12);
    s.redo();
    expect(s.get().output.width).toBe(1280);
  });
});
