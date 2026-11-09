import type { PointRef, Project, Rect, Surface, Vec2 } from '../types';
import { applyHomography, unitSquareToQuad } from '../warp/homography';
import { buildSurfaceMesh } from '../warp/mesh';

export type Handle = { ref: PointRef; pos: Vec2 };

export function pointInPolygon(pt: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function gridHandles(s: Surface): Handle[] {
  const g = s.grid;
  const h = unitSquareToQuad(s.corners);
  if (!g || !h) return [];
  const out: Handle[] = [];
  const handles: Handle[] = [];
  for (let j = 0; j <= g.rows; j++) {
    for (let i = 0; i <= g.cols; i++) {
      const k = j * (g.cols + 1) + i;
      const local = { x: i / g.cols + g.offsets[k].x, y: j / g.rows + g.offsets[k].y };
      const pos = applyHomography(h, local);
      if (pos) out.push({ ref: { surfaceId: s.id, kind: 'grid', index: k }, pos });
      if (g.mode === 'bezier' && g.handles) {
        for (let d = 0; d < 4; d++) {
          const hv = g.handles[k * 4 + d];
          const hp = applyHomography(h, { x: local.x + hv.x, y: local.y + hv.y });
          if (hp) handles.push({ ref: { surfaceId: s.id, kind: 'handle', index: k * 4 + d }, pos: hp });
        }
      }
    }
  }
  return [...out, ...handles];
}

export function collectHandles(p: Project, surfaceId: string, level: 'corners' | 'grid'): Handle[] {
  const s = p.surfaces.find((x) => x.id === surfaceId);
  if (!s) return [];
  if (level === 'grid') return gridHandles(s);
  const out: Handle[] = s.corners.map((pos, index) => ({ ref: { surfaceId, kind: 'corner', index }, pos }));
  for (const m of s.masks)
    m.points.forEach((pos, index) => out.push({ ref: { surfaceId, kind: 'mask', maskId: m.id, index }, pos }));
  return out;
}

export function hitHandle(handles: Handle[], at: Vec2, radius: Vec2): Handle | null {
  let best: Handle | null = null;
  let bestD = Infinity;
  for (const h of handles) {
    const dx = (h.pos.x - at.x) / radius.x;
    const dy = (h.pos.y - at.y) / radius.y;
    const d = dx * dx + dy * dy;
    if (d <= 1 && d < bestD) {
      best = h;
      bestD = d;
    }
  }
  return best;
}

export function surfaceOutline(s: Surface): Vec2[] {
  const m = buildSurfaceMesh(s, 4);
  return m.outline;
}

export function hitSurface(p: Project, at: Vec2): string | null {
  for (let i = p.surfaces.length - 1; i >= 0; i--) {
    const s = p.surfaces[i];
    if (s.visible && pointInPolygon(at, surfaceOutline(s))) return s.id;
  }
  return null;
}

export function handlesInRect(handles: Handle[], r: Rect): Handle[] {
  const x0 = Math.min(r.x, r.x + r.w);
  const x1 = Math.max(r.x, r.x + r.w);
  const y0 = Math.min(r.y, r.y + r.h);
  const y1 = Math.max(r.y, r.y + r.h);
  return handles.filter((h) => h.pos.x >= x0 && h.pos.x <= x1 && h.pos.y >= y0 && h.pos.y <= y1);
}
