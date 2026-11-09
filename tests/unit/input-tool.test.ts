import { describe, expect, test } from 'vitest';
import { dragInputRect, hitInputRect } from '../../src/renderer/ui/interaction/input-tool';
import { createProject, createSurface } from '../../src/core/project';
import { addSurface, setInputRect } from '../../src/core/ops';

const R = { x: 0.01, y: 0.01 };
const rect = { x: 0.2, y: 0.2, w: 0.5, h: 0.5 };

describe('input tool', () => {
  test('hit regions', () => {
    expect(hitInputRect(rect, { x: 0.7, y: 0.45 }, R)).toBe('e');
    expect(hitInputRect(rect, { x: 0.2, y: 0.2 }, R)).toBe('nw');
    expect(hitInputRect(rect, { x: 0.45, y: 0.7 }, R)).toBe('s');
    expect(hitInputRect(rect, { x: 0.45, y: 0.45 }, R)).toBe('move');
    expect(hitInputRect(rect, { x: 0.9, y: 0.9 }, R)).toBeNull();
  });

  test('dragging the right handle changes only w', () => {
    const r = dragInputRect(rect, 'e', { x: 0.1, y: 0.05 });
    expect(r.x).toBe(0.2);
    expect(r.y).toBe(0.2);
    expect(r.w).toBeCloseTo(0.6, 12);
    expect(r.h).toBeCloseTo(0.5, 12);
  });

  test('dragging the top-left handle keeps the opposite corner', () => {
    const r = dragInputRect(rect, 'nw', { x: 0.1, y: 0.1 });
    expect(r.x).toBeCloseTo(0.3, 12);
    expect(r.x + r.w).toBeCloseTo(0.7, 12);
    expect(r.y + r.h).toBeCloseTo(0.7, 12);
  });

  test('moving the frame stops at the edge (via setInputRect)', () => {
    const moved = dragInputRect(rect, 'move', { x: 0.5, y: 0 });
    const p = setInputRect(addSurface(createProject(), createSurface('a', 'A')), 'a', moved);
    const r = p.surfaces[0].inputRect;
    expect(r.x + r.w).toBeLessThanOrEqual(1);
    expect(r.w).toBeCloseTo(0.5, 12);
  });
});
