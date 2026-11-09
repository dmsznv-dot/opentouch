import { describe, expect, test } from 'vitest';
import {
  createGrid,
  defaultHandles,
  evaluateGridOffset,
  gridIndex,
  resampleGrid,
  withGridMode,
} from '../../src/core/warp/grid';
import type { GridMode, GridWarp } from '../../src/core/types';

const MODES: GridMode[] = ['linear', 'smooth', 'bezier'];

function gridWith(cols: number, rows: number, mode: GridMode, f: (u: number, v: number) => { x: number; y: number }): GridWarp {
  const g = withGridMode(createGrid(cols, rows, 'linear'), mode);
  for (let j = 0; j <= rows; j++)
    for (let i = 0; i <= cols; i++) g.offsets[gridIndex(g, i, j)] = f(i / cols, j / rows);
  return g;
}

function rnd(cols: number, rows: number, mode: GridMode): GridWarp {
  return gridWith(cols, rows, mode, () => ({ x: Math.random() * 0.1 - 0.05, y: Math.random() * 0.1 - 0.05 }));
}

describe('grid', () => {
  test('defaultHandles', () => {
    const h = defaultHandles(2, 4);
    expect(h).toHaveLength(3 * 5 * 4);
    expect(h.slice(0, 4)).toEqual([
      { x: 1 / 6, y: 0 },
      { x: -1 / 6, y: 0 },
      { x: 0, y: 1 / 12 },
      { x: 0, y: -1 / 12 },
    ]);
  });

  test.each(MODES)('zero offsets give zero everywhere (%s)', (mode) => {
    const g = withGridMode(createGrid(3, 2), mode);
    for (const [u, v] of [[0, 0], [0.37, 0.81], [1, 1], [0.5, 0.25]]) {
      const o = evaluateGridOffset(g, u, v);
      expect(Math.abs(o.x)).toBeLessThan(1e-12);
      expect(Math.abs(o.y)).toBeLessThan(1e-12);
    }
  });

  test.each(MODES)('passes through nodes (%s)', (mode) => {
    const g = rnd(3, 2, mode);
    for (let j = 0; j <= 2; j++)
      for (let i = 0; i <= 3; i++) {
        const o = evaluateGridOffset(g, i / 3, j / 2);
        const n = g.offsets[gridIndex(g, i, j)];
        expect(Math.abs(o.x - n.x)).toBeLessThan(1e-12);
        expect(Math.abs(o.y - n.y)).toBeLessThan(1e-12);
      }
  });

  test('linear: cell middle is average of 4 corners', () => {
    const g = rnd(2, 2, 'linear');
    const o = evaluateGridOffset(g, 0.25, 0.25);
    const c = [gridIndex(g, 0, 0), gridIndex(g, 1, 0), gridIndex(g, 0, 1), gridIndex(g, 1, 1)].map((k) => g.offsets[k]);
    expect(o.x).toBeCloseTo((c[0].x + c[1].x + c[2].x + c[3].x) / 4, 12);
    expect(o.y).toBeCloseTo((c[0].y + c[1].y + c[2].y + c[3].y) / 4, 12);
  });

  test.each(['smooth', 'bezier'] as GridMode[])('%s reproduces a linear field', (mode) => {
    const g = gridWith(3, 3, mode, (u, v) => ({ x: 0.1 * u, y: 0.05 * v - 0.02 * u }));
    for (let k = 0; k < 50; k++) {
      const u = Math.random();
      const v = Math.random();
      const o = evaluateGridOffset(g, u, v);
      expect(Math.abs(o.x - 0.1 * u)).toBeLessThan(1e-9);
      expect(Math.abs(o.y - (0.05 * v - 0.02 * u))).toBeLessThan(1e-9);
    }
  });

  test('bezier handle deviation bends the cell interior', () => {
    const g = withGridMode(createGrid(1, 1), 'bezier');
    g.handles![0] = { x: g.handles![0].x, y: 0.1 }; // +u handle of node (0,0) pulled down
    const o = evaluateGridOffset(g, 1 / 3, 0);
    expect(o.y).toBeGreaterThan(0.01);
  });

  test.each(MODES)('resample 2x2 -> 4x4 keeps shared nodes (%s)', (mode) => {
    const g = rnd(2, 2, mode);
    const r = resampleGrid(g, 4, 4);
    expect(r.cols).toBe(4);
    expect(r.offsets).toHaveLength(25);
    for (const u of [0, 0.5, 1])
      for (const v of [0, 0.5, 1]) {
        const a = evaluateGridOffset(g, u, v);
        const b = evaluateGridOffset(r, u, v);
        expect(Math.abs(a.x - b.x)).toBeLessThan(1e-12);
        expect(Math.abs(a.y - b.y)).toBeLessThan(1e-12);
      }
  });

  test('withGridMode bezier adds default handles', () => {
    const g = withGridMode(createGrid(2, 2, 'smooth'), 'bezier');
    expect(g.mode).toBe('bezier');
    expect(g.handles).toEqual(defaultHandles(2, 2));
  });
});

import { createGridEvaluator } from '../../src/core/warp/grid';

describe('createGridEvaluator', () => {
  test.each(MODES)('matches evaluateGridOffset (%s)', (mode) => {
    const g = rnd(4, 3, mode);
    if (mode === 'bezier') g.handles = g.handles!.map((h) => ({ x: h.x + Math.random() * 0.02, y: h.y - Math.random() * 0.02 }));
    const ev = createGridEvaluator(g);
    for (let k = 0; k < 200; k++) {
      const u = Math.random();
      const v = Math.random();
      const a = evaluateGridOffset(g, u, v);
      const b = ev(u, v);
      expect(Math.abs(a.x - b.x)).toBeLessThan(1e-12);
      expect(Math.abs(a.y - b.y)).toBeLessThan(1e-12);
    }
  });
});
