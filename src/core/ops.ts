import { newId } from './ids';
import type { GridMode, Mask, PointRef, Project, Quad, Rect, SourceDef, Surface, Vec2 } from './types';
import { createGrid, resampleGrid, withGridMode } from './warp/grid';
import { applyHomography, invertMat3, unitSquareToQuad } from './warp/homography';

const MIN_INPUT_SIZE = 0.01;
const DUPLICATE_SHIFT = 0.02;

const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
/** Model is plain JSON data, so a JSON round-trip is a complete deep copy. */
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function mapSurface(p: Project, id: string, fn: (s: Surface) => Surface): Project {
  return { ...p, surfaces: p.surfaces.map((s) => (s.id === id ? fn(s) : s)) };
}

export function addSurface(p: Project, s: Surface): Project {
  return { ...p, surfaces: [...p.surfaces, s] };
}

export function duplicateSurface(p: Project, id: string, newSurfaceId: string): Project {
  const idx = p.surfaces.findIndex((s) => s.id === id);
  if (idx < 0) return p;
  const src = p.surfaces[idx];
  const shift = { x: DUPLICATE_SHIFT, y: DUPLICATE_SHIFT };
  const copy: Surface = {
    ...clone(src),
    id: newSurfaceId,
    name: `${src.name} copy`,
    corners: src.corners.map((c) => add(c, shift)) as Quad,
    masks: src.masks.map((m) => ({ ...m, id: newId('mask'), points: m.points.map((pt) => add(pt, shift)) })),
  };
  const surfaces = [...p.surfaces];
  surfaces.splice(idx + 1, 0, copy);
  return { ...p, surfaces };
}

export function removeSurface(p: Project, id: string): Project {
  return { ...p, surfaces: p.surfaces.filter((s) => s.id !== id) };
}

export function reorderSurface(p: Project, id: string, toIndex: number): Project {
  const s = p.surfaces.find((x) => x.id === id);
  if (!s) return p;
  const rest = p.surfaces.filter((x) => x.id !== id);
  const i = Math.min(Math.max(toIndex, 0), rest.length);
  return { ...p, surfaces: [...rest.slice(0, i), s, ...rest.slice(i)] };
}

export function updateSurface(p: Project, id: string, patch: Partial<Omit<Surface, 'id'>>): Project {
  return mapSurface(p, id, (s) => ({ ...s, ...patch }));
}

export function setInputRect(p: Project, id: string, r: Rect): Project {
  const w = Math.min(Math.max(r.w, MIN_INPUT_SIZE), 1);
  const h = Math.min(Math.max(r.h, MIN_INPUT_SIZE), 1);
  const x = Math.min(Math.max(r.x, 0), 1 - w);
  const y = Math.min(Math.max(r.y, 0), 1 - h);
  return updateSurface(p, id, { inputRect: { x, y, w, h } });
}

/** Moves a point given in the quad's local (u,v) space by an output-space delta. */
function moveLocal(s: Surface, local: Vec2, delta: Vec2): Vec2 | null {
  const h = unitSquareToQuad(s.corners);
  const inv = h && invertMat3(h);
  const out = h && applyHomography(h, local);
  if (!inv || !out) return null;
  return applyHomography(inv, add(out, delta));
}

function moveSurfacePoints(s: Surface, refs: PointRef[], delta: Vec2): Surface {
  const next: Surface = clone(s);
  for (const r of refs) {
    if (r.kind === 'corner') {
      next.corners[r.index] = add(s.corners[r.index], delta);
    } else if (r.kind === 'mask') {
      const m = next.masks.find((x) => x.id === r.maskId);
      if (m) m.points[r.index] = add(m.points[r.index], delta);
    } else if (s.grid && next.grid) {
      const g = s.grid;
      const node = r.kind === 'grid' ? r.index : Math.floor(r.index / 4);
      const i = node % (g.cols + 1);
      const j = Math.floor(node / (g.cols + 1));
      const nodeLocal = add({ x: i / g.cols, y: j / g.rows }, g.offsets[node]);
      if (r.kind === 'grid') {
        const moved = moveLocal(s, nodeLocal, delta);
        if (moved) next.grid.offsets[node] = { x: moved.x - i / g.cols, y: moved.y - j / g.rows };
      } else if (g.handles && next.grid.handles) {
        const moved = moveLocal(s, add(nodeLocal, g.handles[r.index]), delta);
        if (moved) next.grid.handles[r.index] = { x: moved.x - nodeLocal.x, y: moved.y - nodeLocal.y };
      }
    }
  }
  return next;
}

export function movePoints(p: Project, refs: PointRef[], delta: Vec2): Project {
  const bySurface = new Map<string, PointRef[]>();
  for (const r of refs) bySurface.set(r.surfaceId, [...(bySurface.get(r.surfaceId) ?? []), r]);
  return {
    ...p,
    surfaces: p.surfaces.map((s) => (bySurface.has(s.id) ? moveSurfacePoints(s, bySurface.get(s.id)!, delta) : s)),
  };
}

export function moveSurface(p: Project, id: string, delta: Vec2): Project {
  return mapSurface(p, id, (s) => ({
    ...s,
    corners: s.corners.map((c) => add(c, delta)) as Quad,
    masks: s.masks.map((m) => ({ ...m, points: m.points.map((pt) => add(pt, delta)) })),
  }));
}

export function setGridSize(p: Project, id: string, cols: number, rows: number): Project {
  return mapSurface(p, id, (s) => {
    if (cols <= 0 || rows <= 0) return { ...s, grid: null };
    return { ...s, grid: s.grid ? resampleGrid(s.grid, cols, rows) : createGrid(cols, rows) };
  });
}

export function setGridMode(p: Project, id: string, mode: GridMode): Project {
  return mapSurface(p, id, (s) => (s.grid ? { ...s, grid: withGridMode(s.grid, mode) } : s));
}

export function addMask(p: Project, surfaceId: string, m: Mask): Project {
  return mapSurface(p, surfaceId, (s) => ({ ...s, masks: [...s.masks, m] }));
}

export function updateMask(p: Project, surfaceId: string, maskId: string, patch: Partial<Omit<Mask, 'id'>>): Project {
  return mapSurface(p, surfaceId, (s) => ({ ...s, masks: s.masks.map((m) => (m.id === maskId ? { ...m, ...patch } : m)) }));
}

export function removeMask(p: Project, surfaceId: string, maskId: string): Project {
  return mapSurface(p, surfaceId, (s) => ({ ...s, masks: s.masks.filter((m) => m.id !== maskId) }));
}

export function addSource(p: Project, d: SourceDef): Project {
  return { ...p, sources: [...p.sources, d] };
}

export function removeSource(p: Project, id: string): Project {
  return {
    ...p,
    sources: p.sources.filter((s) => s.id !== id),
    surfaces: p.surfaces.map((s) => (s.sourceId === id ? { ...s, sourceId: null } : s)),
  };
}

export function updateSourceParams(p: Project, id: string, patch: Record<string, unknown>): Project {
  return {
    ...p,
    sources: p.sources.map((s) => (s.id === id ? ({ ...s, params: { ...s.params, ...patch } } as SourceDef) : s)),
  };
}

export function renameSource(p: Project, id: string, name: string): Project {
  return { ...p, sources: p.sources.map((s) => (s.id === id ? { ...s, name } : s)) };
}

export function setOutputSize(p: Project, width: number, height: number): Project {
  return { ...p, output: { ...p.output, width, height } };
}

