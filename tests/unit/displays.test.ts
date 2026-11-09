import { describe, expect, test } from 'vitest';
import { chooseDisplay, outputWindowOptions, type DisplayInfo } from '../../src/main/display-logic';

const d = (id: number, w: number, h: number, primary = false, x = 0): DisplayInfo => ({
  id,
  label: `D${id}`,
  bounds: { x, y: 0, width: w, height: h },
  scaleFactor: 1,
  primary,
});
const laptop = d(1, 1512, 982, true);
const projA = d(2, 1920, 1080, false, 1512);
const projB = d(3, 1280, 800, false, 3432);

describe('chooseDisplay', () => {
  test('matches id and size first', () => {
    expect(chooseDisplay([laptop, projA, projB], { id: 3, width: 1280, height: 800 }, false)).toBe(projB);
  });
  test('falls back to id when the size changed', () => {
    expect(chooseDisplay([laptop, projA, projB], { id: 3, width: 1920, height: 1080 }, false)).toBe(projB);
  });
  test('falls back to first non-primary display', () => {
    expect(chooseDisplay([laptop, projA], { id: 99, width: 1, height: 1 }, false)).toBe(projA);
    expect(chooseDisplay([laptop, projA], undefined, false)).toBe(projA);
  });
  test('only the primary display: null, or primary when faking', () => {
    expect(chooseDisplay([laptop], undefined, false)).toBeNull();
    expect(chooseDisplay([laptop], undefined, true)).toBe(laptop);
  });
});

describe('outputWindowOptions', () => {
  test('black, hidden until ready, frameless, on the display bounds', () => {
    const o = outputWindowOptions(projA, false);
    expect(o.backgroundColor).toBe('#000000');
    expect(o.show).toBe(false);
    expect(o.frame).toBe(false);
    expect([o.x, o.y, o.width, o.height]).toEqual([1512, 0, 1920, 1080]);
  });
  test('fake mode is a normal 960x540 window', () => {
    const o = outputWindowOptions(laptop, true);
    expect(o.backgroundColor).toBe('#000000');
    expect([o.width, o.height]).toEqual([960, 540]);
    expect(o.frame).toBe(true);
  });
});
