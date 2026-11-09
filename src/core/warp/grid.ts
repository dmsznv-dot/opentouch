import type { GridMode, GridWarp, Vec2 } from '../types';

export function gridIndex(g: Pick<GridWarp, 'cols'>, i: number, j: number): number {
  return j * (g.cols + 1) + i;
}

export function createGrid(cols: number, rows: number, mode: GridMode = 'smooth'): GridWarp {
  const offsets: Vec2[] = [];
  for (let k = 0; k < (cols + 1) * (rows + 1); k++) offsets.push({ x: 0, y: 0 });
  const g: GridWarp = { cols, rows, offsets, mode };
  if (mode === 'bezier') g.handles = defaultHandles(cols, rows);
  return g;
}

function baseHandles(cols: number, rows: number): [Vec2, Vec2, Vec2, Vec2] {
  return [
    { x: 1 / (3 * cols), y: 0 },
    { x: -1 / (3 * cols), y: 0 },
    { x: 0, y: 1 / (3 * rows) },
    { x: 0, y: -1 / (3 * rows) },
  ];
}

/** 4 handles per point, order [+u, -u, +v, -v]. */
export function defaultHandles(cols: number, rows: number): Vec2[] {
  const base = baseHandles(cols, rows);
  const out: Vec2[] = [];
  for (let k = 0; k < (cols + 1) * (rows + 1); k++) for (const h of base) out.push({ ...h });
  return out;
}

export function withGridMode(g: GridWarp, mode: GridMode): GridWarp {
  const next: GridWarp = { ...g, mode };
  if (mode === 'bezier' && !g.handles) next.handles = defaultHandles(g.cols, g.rows);
  return next;
}

function cellOf(t: number, n: number): [number, number] {
  const c = Math.min(Math.max(Math.floor(t * n), 0), n - 1);
  return [c, t * n - c];
}

/** Node offset with linear extrapolation beyond the grid border. */
function nodeExt(g: GridWarp, i: number, j: number): Vec2 {
  const ci = Math.min(Math.max(i, 0), g.cols);
  const cj = Math.min(Math.max(j, 0), g.rows);
  if (ci === i && cj === j) return g.offsets[gridIndex(g, i, j)];
  // Extrapolate one axis at a time.
  if (ci !== i) {
    const inner = ci === 0 ? 1 : ci - 1;
    const a = nodeExt(g, ci, j);
    const b = nodeExt(g, inner, j);
    const k = Math.abs(i - ci);
    return { x: a.x + k * (a.x - b.x), y: a.y + k * (a.y - b.y) };
  }
  const inner = cj === 0 ? 1 : cj - 1;
  const a = nodeExt(g, i, cj);
  const b = nodeExt(g, i, inner);
  const k = Math.abs(j - cj);
  return { x: a.x + k * (a.x - b.x), y: a.y + k * (a.y - b.y) };
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function bernstein(t: number): [number, number, number, number] {
  const s = 1 - t;
  return [s * s * s, 3 * s * s * t, 3 * s * t * t, t * t * t];
}

function evalLinear(g: GridWarp, i: number, j: number, s: number, t: number): Vec2 {
  const a = nodeExt(g, i, j);
  const b = nodeExt(g, i + 1, j);
  const c = nodeExt(g, i, j + 1);
  const d = nodeExt(g, i + 1, j + 1);
  return {
    x: (1 - t) * ((1 - s) * a.x + s * b.x) + t * ((1 - s) * c.x + s * d.x),
    y: (1 - t) * ((1 - s) * a.y + s * b.y) + t * ((1 - s) * c.y + s * d.y),
  };
}

function evalSmooth(g: GridWarp, i: number, j: number, s: number, t: number): Vec2 {
  const rows: Vec2[] = [];
  for (let dj = -1; dj <= 2; dj++) {
    const p = [-1, 0, 1, 2].map((di) => nodeExt(g, i + di, j + dj));
    rows.push({ x: catmullRom(p[0].x, p[1].x, p[2].x, p[3].x, s), y: catmullRom(p[0].y, p[1].y, p[2].y, p[3].y, s) });
  }
  return {
    x: catmullRom(rows[0].x, rows[1].x, rows[2].x, rows[3].x, t),
    y: catmullRom(rows[0].y, rows[1].y, rows[2].y, rows[3].y, t),
  };
}

function evalBezier(g: GridWarp, i: number, j: number, s: number, t: number): Vec2 {
  const handles = g.handles ?? defaultHandles(g.cols, g.rows);
  const base = baseHandles(g.cols, g.rows);
  const n00 = gridIndex(g, i, j);
  const n10 = gridIndex(g, i + 1, j);
  const n01 = gridIndex(g, i, j + 1);
  const n11 = gridIndex(g, i + 1, j + 1);
  const d = (node: number, dir: 0 | 1 | 2 | 3): Vec2 => {
    const h = handles[node * 4 + dir];
    return { x: h.x - base[dir].x, y: h.y - base[dir].y };
  };
  const P: Vec2[][] = [];
  for (let a = 0; a < 4; a++) {
    P.push([]);
    for (let b = 0; b < 4; b++) P[a].push(evalLinear(g, i, j, a / 3, b / 3));
  }
  const add = (a: number, b: number, ...vs: Vec2[]) => {
    for (const v of vs) {
      P[a][b].x += v.x;
      P[a][b].y += v.y;
    }
  };
  // Edges.
  add(1, 0, d(n00, 0)); add(2, 0, d(n10, 1));
  add(1, 3, d(n01, 0)); add(2, 3, d(n11, 1));
  add(0, 1, d(n00, 2)); add(0, 2, d(n01, 3));
  add(3, 1, d(n10, 2)); add(3, 2, d(n11, 3));
  // Interior.
  add(1, 1, d(n00, 0), d(n00, 2));
  add(2, 1, d(n10, 1), d(n10, 2));
  add(1, 2, d(n01, 0), d(n01, 3));
  add(2, 2, d(n11, 1), d(n11, 3));
  const bs = bernstein(s);
  const bt = bernstein(t);
  let x = 0;
  let y = 0;
  for (let a = 0; a < 4; a++)
    for (let b = 0; b < 4; b++) {
      const w = bs[a] * bt[b];
      x += w * P[a][b].x;
      y += w * P[a][b].y;
    }
  return { x, y };
}

export function evaluateGridOffset(g: GridWarp, u: number, v: number): Vec2 {
  const [i, s] = cellOf(u, g.cols);
  const [j, t] = cellOf(v, g.rows);
  if (g.mode === 'linear') return evalLinear(g, i, j, s, t);
  if (g.mode === 'smooth') return evalSmooth(g, i, j, s, t);
  return evalBezier(g, i, j, s, t);
}

export function resampleGrid(g: GridWarp, cols: number, rows: number): GridWarp {
  const next = createGrid(cols, rows, g.mode);
  for (let j = 0; j <= rows; j++)
    for (let i = 0; i <= cols; i++) next.offsets[gridIndex(next, i, j)] = evaluateGridOffset(g, i / cols, j / rows);
  return next;
}
