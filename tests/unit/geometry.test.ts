import { describe, expect, test } from 'vitest';
import { createProject, createSurface } from '../../src/core/project';
import { addMask, addSurface, setGridMode, setGridSize, updateSurface } from '../../src/core/ops';
import { collectHandles, handlesInRect, hitHandle, hitSurface, pointInPolygon } from '../../src/core/geometry/hit';
import { snapCandidates, snapPoint } from '../../src/core/geometry/snap';

function proj() {
  let p = createProject();
  p = addSurface(p, createSurface('a', 'A')); // 0.25..0.75
  p = addSurface(p, updateSurface({ ...p, surfaces: [createSurface('b', 'B')] }, 'b', {
    corners: [
      { x: 0.5, y: 0.5 },
      { x: 0.9, y: 0.5 },
      { x: 0.9, y: 0.9 },
      { x: 0.5, y: 0.9 },
    ],
  }).surfaces[0]);
  return p;
}
const R = { x: 0.01, y: 0.01 };

describe('geometry', () => {
  test('pointInPolygon', () => {
    const sq = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    expect(pointInPolygon({ x: 0.5, y: 0.5 }, sq)).toBe(true);
    expect(pointInPolygon({ x: 1.5, y: 0.5 }, sq)).toBe(false);
  });

  test('hitSurface picks the topmost visible surface', () => {
    const p = proj();
    expect(hitSurface(p, { x: 0.6, y: 0.6 })).toBe('b');
    expect(hitSurface(p, { x: 0.3, y: 0.3 })).toBe('a');
    expect(hitSurface(p, { x: 0.05, y: 0.05 })).toBeNull();
    const hidden = updateSurface(p, 'b', { visible: false });
    expect(hitSurface(hidden, { x: 0.6, y: 0.6 })).toBe('a');
  });

  test('collectHandles corners include mask points', () => {
    const p = addMask(proj(), 'a', { id: 'm', mode: 'include', points: [{ x: 0.3, y: 0.3 }, { x: 0.4, y: 0.3 }, { x: 0.4, y: 0.4 }], feather: 0 });
    const hs = collectHandles(p, 'a', 'corners');
    expect(hs).toHaveLength(7);
    expect(hs[4].ref).toEqual({ surfaceId: 'a', kind: 'mask', maskId: 'm', index: 0 });
  });

  test('collectHandles grid returns nodes (and handles for bezier)', () => {
    let p = setGridSize(proj(), 'a', 2, 2);
    let hs = collectHandles(p, 'a', 'grid');
    expect(hs).toHaveLength(9);
    expect(hs[4].pos.x).toBeCloseTo(0.5, 9);
    expect(hs[4].pos.y).toBeCloseTo(0.5, 9);
    p = setGridMode(p, 'a', 'bezier');
    hs = collectHandles(p, 'a', 'grid');
    expect(hs.filter((h) => h.ref.kind === 'handle')).toHaveLength(36);
  });

  test('hitHandle returns the nearest handle within radius', () => {
    const hs = collectHandles(proj(), 'a', 'corners');
    expect(hitHandle(hs, { x: 0.255, y: 0.252 }, R)?.ref.index).toBe(0);
    expect(hitHandle(hs, { x: 0.3, y: 0.3 }, R)).toBeNull();
  });

  test('handlesInRect', () => {
    const hs = collectHandles(proj(), 'a', 'corners');
    expect(handlesInRect(hs, { x: 0, y: 0, w: 1, h: 0.3 }).map((h) => h.ref.index)).toEqual([0, 1]);
  });

  test('snapPoint', () => {
    const c = snapCandidates(proj(), 'a');
    expect(c).toHaveLength(4);
    expect(snapPoint({ x: 0.505, y: 0.497 }, c, R)).toEqual({ x: 0.5, y: 0.5 });
    expect(snapPoint({ x: 0.52, y: 0.5 }, c, R)).toEqual({ x: 0.52, y: 0.5 });
  });
});
