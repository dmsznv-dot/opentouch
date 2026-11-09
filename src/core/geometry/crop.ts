import type { Quad, Rect } from '../types';

export function centerCrop(rect: Rect, source: { width: number; height: number },
  corners: Quad, output: { width: number; height: number }): Rect {
  const edge = (a: number, b: number) => Math.hypot(
    (corners[a].x - corners[b].x) * output.width,
    (corners[a].y - corners[b].y) * output.height,
  );
  const width = edge(0, 1) + edge(3, 2);
  const height = edge(0, 3) + edge(1, 2);
  if (!width || !height || source.width <= 1 || source.height <= 1) return rect;
  const ratio = (width / height) / ((rect.w * source.width) / (rect.h * source.height));
  const w = rect.w * Math.min(1, ratio);
  const h = rect.h * Math.min(1, 1 / ratio);
  return { x: rect.x + (rect.w - w) / 2, y: rect.y + (rect.h - h) / 2, w, h };
}
