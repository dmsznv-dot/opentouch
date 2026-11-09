import type { Page } from '@playwright/test';
import { buildSurfaceMesh } from '../../src/core/warp/mesh';
import type { Project, Vec2 } from '../../src/core/types';

export interface RenderOpts {
  overlay?: unknown;
  testPattern?: 'none' | 'selected' | 'all';
  selectedSurfaceId?: string | null;
}

export async function render(page: Page, p: Project, w: number, h: number, opts: RenderOpts = {}): Promise<Uint8Array> {
  const data = await page.evaluate(
    ([json, w, h, opts]) => (window as unknown as { renderToPixels: Function }).renderToPixels(json, w, h, opts),
    [JSON.stringify(p), w, h, opts] as const,
  );
  return Uint8Array.from(data as number[]);
}

export function px(buf: Uint8Array, w: number, x: number, y: number): [number, number, number] {
  const k = (y * w + x) * 4;
  return [buf[k], buf[k + 1], buf[k + 2]];
}

function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function inside(p: Vec2, poly: Vec2[]): boolean {
  let r = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) r = !r;
  }
  return r;
}

/** Classifies each pixel centre as 'in' / 'out' (beyond `margin` px from every outline) / 'edge'. */
export function classify(p: Project, w: number, h: number, margin = 1.5): ('in' | 'out' | 'edge')[] {
  const outlines = p.surfaces
    .filter((s) => s.visible)
    .map((s) => buildSurfaceMesh(s).outline.map((v) => ({ x: v.x * w, y: v.y * h })));
  const out: ('in' | 'out' | 'edge')[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = { x: x + 0.5, y: y + 0.5 };
      let cls: 'in' | 'out' | 'edge' = 'out';
      for (const o of outlines) {
        let d = Infinity;
        for (let i = 0; i < o.length; i++) d = Math.min(d, distToSegment(c, o[i], o[(i + 1) % o.length]));
        if (d <= margin) {
          cls = 'edge';
          break;
        }
        if (inside(c, o)) cls = 'in';
      }
      out.push(cls);
    }
  return out;
}
