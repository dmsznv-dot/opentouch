import type { Project, Vec2 } from '../types';
import { collectHandles } from './hit';

export function snapPoint(pt: Vec2, candidates: Vec2[], radius: Vec2): Vec2 {
  let best: Vec2 | null = null;
  let bestD = Infinity;
  for (const c of candidates) {
    const dx = (c.x - pt.x) / radius.x;
    const dy = (c.y - pt.y) / radius.y;
    const d = dx * dx + dy * dy;
    if (d <= 1 && d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best ? { ...best } : pt;
}

export function snapCandidates(p: Project, excludeSurfaceId: string): Vec2[] {
  const out: Vec2[] = [];
  for (const s of p.surfaces) {
    if (s.id === excludeSurfaceId || !s.visible) continue;
    out.push(...s.corners);
    if (s.grid) out.push(...collectHandles(p, s.id, 'grid').filter((h) => h.ref.kind === 'grid').map((h) => h.pos));
  }
  return out;
}
