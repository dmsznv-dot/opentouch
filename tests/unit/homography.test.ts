import { describe, expect, test } from 'vitest';
import { applyHomography, invertMat3, unitSquareToQuad } from '../../src/core/warp/homography';
import type { Quad, Vec2 } from '../../src/core/types';

const Q: Quad = [
  { x: 0.1, y: 0.2 },
  { x: 0.8, y: 0.1 },
  { x: 0.9, y: 0.9 },
  { x: 0.2, y: 0.7 },
];
const UNIT: Vec2[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

function intersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): Vec2 {
  const den = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
  const t = ((a.x - c.x) * (c.y - d.y) - (a.y - c.y) * (c.x - d.x)) / den;
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
}

describe('homography', () => {
  test('maps unit square corners to quad corners', () => {
    const h = unitSquareToQuad(Q)!;
    UNIT.forEach((u, i) => {
      const p = applyHomography(h, u)!;
      expect(p.x).toBeCloseTo(Q[i].x, 9);
      expect(p.y).toBeCloseTo(Q[i].y, 9);
    });
  });

  test('maps square center to intersection of quad diagonals', () => {
    const h = unitSquareToQuad(Q)!;
    const c = applyHomography(h, { x: 0.5, y: 0.5 })!;
    const expected = intersect(Q[0], Q[2], Q[1], Q[3]);
    expect(c.x).toBeCloseTo(expected.x, 9);
    expect(c.y).toBeCloseTo(expected.y, 9);
  });

  test('inverse roundtrip', () => {
    const h = unitSquareToQuad(Q)!;
    const inv = invertMat3(h)!;
    for (let i = 0; i < 20; i++) {
      const p = { x: Math.random(), y: Math.random() };
      const back = applyHomography(inv, applyHomography(h, p)!)!;
      expect(back.x).toBeCloseTo(p.x, 9);
      expect(back.y).toBeCloseTo(p.y, 9);
    }
  });

  test('collinear corners are degenerate', () => {
    expect(
      unitSquareToQuad([
        { x: 0, y: 0 },
        { x: 0.5, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
      ]),
    ).toBeNull();
  });
});
