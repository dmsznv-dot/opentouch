import type { Surface, Vec2 } from '../types';
import { createGridEvaluator } from './grid';
import { homographyW, unitSquareToQuad } from './homography';

export interface SurfaceMesh {
  /** Output-space positions (0..1), xy pairs. */
  positions: Float32Array;
  /** Source UVs (0..1, top-left origin), xy pairs. */
  uvs: Float32Array;
  indices: Uint32Array;
  /** Border of the mesh, clockwise starting at the top-left corner. */
  outline: Vec2[];
  valid: boolean;
}

export const MIN_AXIS_SUBDIV = 64;
export const MAX_AXIS_SUBDIV = 256;

const EMPTY: Omit<SurfaceMesh, 'outline'> = {
  positions: new Float32Array(0),
  uvs: new Float32Array(0),
  indices: new Uint32Array(0),
  valid: false,
};

function invalid(outline: Vec2[]): SurfaceMesh {
  return { ...EMPTY, outline };
}

function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const o = (p: Vec2, q: Vec2, r: Vec2) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = o(c, d, a);
  const d2 = o(c, d, b);
  const d3 = o(a, b, c);
  const d4 = o(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function selfIntersects(poly: Vec2[]): boolean {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segmentsIntersect(a, b, poly[j], poly[(j + 1) % n])) return true;
    }
  }
  return false;
}

export function buildSurfaceMesh(s: Pick<Surface, 'corners' | 'grid' | 'inputRect'>, subdiv = 32): SurfaceMesh {
  const cols = s.grid ? s.grid.cols : 1;
  const rows = s.grid ? s.grid.rows : 1;
  // At least MIN_AXIS_SUBDIV per axis: a single strongly-skewed quad needs it for < 0.5 px error at 1080p.
  // Capped at MAX_AXIS_SUBDIV so dense grids stay cheap to rebuild while dragging.
  const nu = Math.min(Math.max(cols * subdiv, MIN_AXIS_SUBDIV), Math.max(MAX_AXIS_SUBDIV, cols));
  const nv = Math.min(Math.max(rows * subdiv, MIN_AXIS_SUBDIV), Math.max(MAX_AXIS_SUBDIV, rows));
  const h = unitSquareToQuad(s.corners);
  if (!h) return invalid([...s.corners]);

  const evalGrid = s.grid ? createGridEvaluator(s.grid) : null;
  const count = (nu + 1) * (nv + 1);
  const positions = new Float32Array(count * 2);
  const uvs = new Float32Array(count * 2);
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      const v = j / nv;
      let lu = u;
      let lv = v;
      if (evalGrid) {
        const o = evalGrid(u, v);
        lu += o.x;
        lv += o.y;
      }
      const w = homographyW(h, { x: lu, y: lv });
      if (!(w > 1e-9)) return invalid([...s.corners]);
      const k = j * (nu + 1) + i;
      positions[2 * k] = (h[0] * lu + h[1] * lv + h[2]) / w;
      positions[2 * k + 1] = (h[3] * lu + h[4] * lv + h[5]) / w;
      uvs[2 * k] = s.inputRect.x + u * s.inputRect.w;
      uvs[2 * k + 1] = s.inputRect.y + v * s.inputRect.h;
    }
  }

  const at = (i: number, j: number): Vec2 => {
    const k = j * (nu + 1) + i;
    return { x: positions[2 * k], y: positions[2 * k + 1] };
  };
  const outline: Vec2[] = [];
  for (let i = 0; i < nu; i++) outline.push(at(i, 0));
  for (let j = 0; j < nv; j++) outline.push(at(nu, j));
  for (let i = nu; i > 0; i--) outline.push(at(i, nv));
  for (let j = nv; j > 0; j--) outline.push(at(0, j));

  // Fold check on a coarser outline (4 samples per cell edge) keeps this O(cells²), not O(vertices²).
  const stride = Math.max(1, Math.floor(nu / cols / 4));
  if (selfIntersects(outline.filter((_, k) => k % stride === 0))) return invalid(outline);

  const indices = new Uint32Array(nu * nv * 6);
  let t = 0;
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i;
      const b = a + 1;
      const c = a + nu + 1;
      const d = c + 1;
      indices.set([a, b, c, b, d, c], t);
      t += 6;
    }
  }
  return { positions, uvs, indices, outline, valid: true };
}

type MeshInput = Pick<Surface, 'corners' | 'grid' | 'inputRect'>;
const cache = new WeakMap<object, WeakMap<object, Map<object | null, SurfaceMesh>>>();

/**
 * Memoized buildSurfaceMesh keyed by object identity of corners / inputRect / grid. The model is immutable,
 * so both renderers (preview + projector) share one CPU mesh and nothing is rebuilt until geometry changes.
 */
export function getSurfaceMesh(s: MeshInput): SurfaceMesh {
  let byRect = cache.get(s.corners);
  if (!byRect) cache.set(s.corners, (byRect = new WeakMap()));
  let byGrid = byRect.get(s.inputRect);
  if (!byGrid) byRect.set(s.inputRect, (byGrid = new Map()));
  let mesh = byGrid.get(s.grid);
  if (!mesh) {
    mesh = buildSurfaceMesh(s);
    byGrid.clear(); // keep only the latest grid per corners/inputRect pair
    byGrid.set(s.grid, mesh);
  }
  return mesh;
}
