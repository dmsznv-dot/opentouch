import { describe, expect, test } from 'vitest';
import { createProject, createSurface } from '../../src/core/project';
import {
  addMask,
  addSource,
  addSurface,
  duplicateSurface,
  moveSurface,
  movePoints,
  removeSource,
  removeSurface,
  reorderSurface,
  setGridMode,
  setGridSize,
  setInputRect,
  updateSurface,
} from '../../src/core/ops';
import { buildSurfaceMesh } from '../../src/core/warp/mesh';
import { gridIndex } from '../../src/core/warp/grid';
import type { Project } from '../../src/core/types';

function base(): Project {
  let p = createProject();
  p = addSource(p, { id: 'src_a', name: 'a', type: 'testpattern', params: { pattern: 'grid' } });
  p = addSurface(p, { ...createSurface('s1', 'One'), sourceId: 'src_a' });
  p = addSurface(p, createSurface('s2', 'Two'));
  p = addMask(p, 's1', { id: 'm1', mode: 'include', points: [{ x: 0.3, y: 0.3 }, { x: 0.6, y: 0.3 }, { x: 0.5, y: 0.6 }], feather: 0 });
  return p;
}

describe('ops', () => {
  test('ops do not mutate input', () => {
    const p = base();
    const snapshot = JSON.stringify(p);
    duplicateSurface(p, 's1', 's3');
    movePoints(p, [{ surfaceId: 's1', kind: 'corner', index: 0 }], { x: 0.1, y: 0 });
    removeSource(p, 'src_a');
    expect(JSON.stringify(p)).toBe(snapshot);
  });

  test('duplicateSurface', () => {
    const p = duplicateSurface(base(), 's1', 's3');
    expect(p.surfaces.map((s) => s.id)).toEqual(['s1', 's3', 's2']);
    const d = p.surfaces[1];
    expect(d.name).toBe('One copy');
    expect(d.sourceId).toBe('src_a');
    expect(d.corners[0].x).toBeCloseTo(0.27, 12);
    expect(d.corners[0].y).toBeCloseTo(0.27, 12);
    expect(d.masks[0].id).not.toBe('m1');
    expect(d.masks[0].points[0].x).toBeCloseTo(0.32, 12);
  });

  test('removeSurface / reorderSurface / updateSurface', () => {
    let p = base();
    p = reorderSurface(p, 's2', 0);
    expect(p.surfaces.map((s) => s.id)).toEqual(['s2', 's1']);
    p = updateSurface(p, 's1', { opacity: 0.5, name: 'X' });
    expect(p.surfaces[1]).toMatchObject({ opacity: 0.5, name: 'X' });
    p = removeSurface(p, 's2');
    expect(p.surfaces.map((s) => s.id)).toEqual(['s1']);
  });

  test('removeSource nulls sourceId', () => {
    const p = removeSource(base(), 'src_a');
    expect(p.sources).toEqual([]);
    expect(p.surfaces[0].sourceId).toBeNull();
  });

  test('movePoints corner and mask', () => {
    const p = movePoints(
      base(),
      [
        { surfaceId: 's1', kind: 'corner', index: 0 },
        { surfaceId: 's1', kind: 'mask', maskId: 'm1', index: 2 },
      ],
      { x: 0.01, y: -0.02 },
    );
    expect(p.surfaces[0].corners[0].x).toBeCloseTo(0.26, 12);
    expect(p.surfaces[0].corners[0].y).toBeCloseTo(0.23, 12);
    expect(p.surfaces[0].masks[0].points[2].y).toBeCloseTo(0.58, 12);
  });

  test('moveSurface moves corners and mask points', () => {
    const p = moveSurface(base(), 's1', { x: 0.1, y: 0.1 });
    expect(p.surfaces[0].corners[2].x).toBeCloseTo(0.85, 12);
    expect(p.surfaces[0].masks[0].points[0].x).toBeCloseTo(0.4, 12);
  });

  test('movePoints grid node moves the rendered node by delta', () => {
    let p = updateSurface(base(), 's1', {
      corners: [
        { x: 0.1, y: 0.1 },
        { x: 0.9, y: 0.2 },
        { x: 0.8, y: 0.9 },
        { x: 0.2, y: 0.8 },
      ],
    });
    p = setGridSize(p, 's1', 2, 2);
    const k = gridIndex({ cols: 2 }, 1, 1);
    const nodePos = (proj: Project) => {
      const m = buildSurfaceMesh(proj.surfaces[0]);
      // node (1,1) of a 2x2 grid = the sample at the middle of the mesh
      const n = Math.round(Math.sqrt(m.positions.length / 2)) - 1;
      const idx = (n / 2) * (n + 1) + n / 2;
      return { x: m.positions[2 * idx], y: m.positions[2 * idx + 1] };
    };
    const before = nodePos(p);
    p = movePoints(p, [{ surfaceId: 's1', kind: 'grid', index: k }], { x: 0.01, y: 0 });
    const after = nodePos(p);
    expect(after.x - before.x).toBeCloseTo(0.01, 6);
    expect(after.y - before.y).toBeCloseTo(0, 6);
  });

  test('setGridSize 0 removes grid; setGridMode bezier adds handles', () => {
    let p = setGridSize(base(), 's1', 3, 2);
    expect(p.surfaces[0].grid?.offsets).toHaveLength(12);
    p = setGridMode(p, 's1', 'bezier');
    expect(p.surfaces[0].grid?.handles).toHaveLength(48);
    p = setGridSize(p, 's1', 0, 0);
    expect(p.surfaces[0].grid).toBeNull();
  });

  test('setInputRect clamps to min size and bounds', () => {
    let p = setInputRect(base(), 's1', { x: 0.5, y: 0.5, w: 0, h: 0 });
    expect(p.surfaces[0].inputRect).toMatchObject({ w: 0.01, h: 0.01 });
    p = setInputRect(p, 's1', { x: 0.995, y: 0, w: 0.5, h: 1 });
    const r = p.surfaces[0].inputRect;
    expect(r.x + r.w).toBeLessThanOrEqual(1);
    expect(r.w).toBeGreaterThanOrEqual(0.01);
  });
});
