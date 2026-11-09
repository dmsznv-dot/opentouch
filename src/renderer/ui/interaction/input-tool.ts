import type { Rect, Vec2 } from '../../../core/types';

export type InputHandle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** Which part of the inputRect frame is under `at` (corners win over edges, edges over the inside). */
export function hitInputRect(r: Rect, at: Vec2, radius: Vec2): InputHandle | null {
  const nearL = Math.abs(at.x - r.x) <= radius.x;
  const nearR = Math.abs(at.x - (r.x + r.w)) <= radius.x;
  const nearT = Math.abs(at.y - r.y) <= radius.y;
  const nearB = Math.abs(at.y - (r.y + r.h)) <= radius.y;
  const inX = at.x >= r.x - radius.x && at.x <= r.x + r.w + radius.x;
  const inY = at.y >= r.y - radius.y && at.y <= r.y + r.h + radius.y;
  if (!inX || !inY) return null;
  const v = nearT ? 'n' : nearB ? 's' : '';
  const h = nearL ? 'w' : nearR ? 'e' : '';
  if (v || h) return (v + h) as InputHandle;
  return 'move';
}

/** New frame after dragging `h` by `delta` (unclamped; ops.setInputRect clamps). */
export function dragInputRect(r: Rect, h: InputHandle, delta: Vec2): Rect {
  if (h === 'move') return { ...r, x: r.x + delta.x, y: r.y + delta.y };
  let x0 = r.x;
  let y0 = r.y;
  let x1 = r.x + r.w;
  let y1 = r.y + r.h;
  if (h.includes('w')) x0 += delta.x;
  if (h.includes('e')) x1 += delta.x;
  if (h.includes('n')) y0 += delta.y;
  if (h.includes('s')) y1 += delta.y;
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
}
