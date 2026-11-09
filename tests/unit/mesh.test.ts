import { describe, expect, test } from 'vitest';
import { buildSurfaceMesh } from '../../src/core/warp/mesh';
import { applyHomography, unitSquareToQuad } from '../../src/core/warp/homography';
import { createGrid, withGridMode } from '../../src/core/warp/grid';
import type { Quad, Rect } from '../../src/core/types';

const FULL: Rect = { x: 0, y: 0, w: 1, h: 1 };
const SCREEN: Quad = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

function vtx(buf: Float32Array, k: number) {
  return { x: buf[2 * k], y: buf[2 * k + 1] };
}

describe('buildSurfaceMesh', () => {
  test('full-screen quad without grid', () => {
    const m = buildSurfaceMesh({ corners: SCREEN, grid: null, inputRect: FULL });
    expect(m.valid).toBe(true);
    expect(m.positions.length / 2).toBe(65 * 65);
    const last = 65 * 65 - 1;
    expect(vtx(m.positions, 0)).toEqual({ x: 0, y: 0 });
    expect(vtx(m.positions, 64)).toEqual({ x: 1, y: 0 });
    expect(vtx(m.positions, last)).toEqual({ x: 1, y: 1 });
    expect(vtx(m.positions, last - 64)).toEqual({ x: 0, y: 1 });
    expect(vtx(m.uvs, 0)).toEqual({ x: 0, y: 0 });
    expect(vtx(m.uvs, last)).toEqual({ x: 1, y: 1 });
    expect(m.indices.length).toBe(64 * 64 * 6);
  });

  test('inputRect maps uvs', () => {
    const m = buildSurfaceMesh({ corners: SCREEN, grid: null, inputRect: { x: 0.5, y: 0, w: 0.5, h: 1 } });
    expect(vtx(m.uvs, 0)).toEqual({ x: 0.5, y: 0 });
    expect(vtx(m.uvs, 64).x).toBeCloseTo(1, 6);
  });

  test('piecewise-linear error below 0.5 px at 1920 wide', () => {
    const q: Quad = [
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.3 },
      { x: 0.9, y: 0.7 },
      { x: 0.1, y: 0.9 },
    ];
    const h = unitSquareToQuad(q)!;
    const m = buildSurfaceMesh({ corners: q, grid: null, inputRect: FULL });
    let maxErr = 0;
    for (let t = 0; t < m.indices.length; t += 3) {
      const ks = [m.indices[t], m.indices[t + 1], m.indices[t + 2]];
      const p = ks.map((k) => vtx(m.positions, k));
      const uv = ks.map((k) => vtx(m.uvs, k));
      const cp = { x: (p[0].x + p[1].x + p[2].x) / 3, y: (p[0].y + p[1].y + p[2].y) / 3 };
      const cu = { x: (uv[0].x + uv[1].x + uv[2].x) / 3, y: (uv[0].y + uv[1].y + uv[2].y) / 3 };
      const exact = applyHomography(h, cu)!;
      maxErr = Math.max(maxErr, Math.hypot((cp.x - exact.x) * 1920, (cp.y - exact.y) * 1080));
    }
    expect(maxErr).toBeLessThan(0.5);
  });

  test('outline runs along the quad border', () => {
    const m = buildSurfaceMesh({ corners: SCREEN, grid: null, inputRect: FULL });
    expect(m.outline.length).toBe(4 * 64);
    expect(m.outline[0]).toEqual({ x: 0, y: 0 });
    expect(m.outline[64]).toEqual({ x: 1, y: 0 });
  });

  test('collinear corners -> invalid, empty buffers', () => {
    const m = buildSurfaceMesh({
      corners: [
        { x: 0, y: 0 },
        { x: 0.5, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
      ],
      grid: null,
      inputRect: FULL,
    });
    expect(m.valid).toBe(false);
    expect(m.positions.length + m.uvs.length + m.indices.length).toBe(0);
  });

  test('bow-tie quad -> invalid, no NaN', () => {
    const m = buildSurfaceMesh({
      corners: [
        { x: 0.2, y: 0.2 },
        { x: 0.8, y: 0.8 },
        { x: 0.8, y: 0.2 },
        { x: 0.2, y: 0.8 },
      ],
      grid: null,
      inputRect: FULL,
    });
    expect(m.valid).toBe(false);
    expect(m.positions.some((v) => Number.isNaN(v))).toBe(false);
  });

  test('dense bezier grid builds fast and stays capped', () => {
    const grid = withGridMode(createGrid(32, 32), 'bezier');
    const t0 = performance.now();
    const m = buildSurfaceMesh({ corners: SCREEN, grid, inputRect: FULL });
    const ms = performance.now() - t0;
    expect(m.valid).toBe(true);
    expect(m.positions.length / 2).toBe(257 * 257);
    expect(ms).toBeLessThan(300);
  });
});
