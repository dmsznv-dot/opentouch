import { collectHandles } from '../../core/geometry/hit';
import type { PointRef, Project, Surface, Vec2 } from '../../core/types';
import { evaluateGridOffset } from '../../core/warp/grid';
import { applyHomography, unitSquareToQuad } from '../../core/warp/homography';
import type { SurfaceMesh } from '../../core/warp/mesh';
import { compileProgram } from './context';
import type { OverlayState } from './renderer';
import { FLAT_FS, FLAT_VS } from './shaders';

type RGBA = [number, number, number, number];
const C = {
  outline: [0.55, 0.55, 0.55, 1] as RGBA,
  invalid: [1, 0.2, 0.2, 1] as RGBA,
  grid: [0.25, 0.7, 1, 1] as RGBA,
  handle: [1, 1, 1, 1] as RGBA,
  bezierHandle: [0.6, 0.85, 1, 1] as RGBA,
  selected: [1, 0.6, 0.1, 1] as RGBA,
  mask: [1, 0.85, 0.2, 1] as RGBA,
  marquee: [0.9, 0.9, 0.9, 1] as RGBA,
};
const HANDLE_PX = 8;
const GRID_SAMPLES = 48;

function samePoint(a: PointRef, b: PointRef): boolean {
  return a.surfaceId === b.surfaceId && a.kind === b.kind && a.index === b.index && (a.maskId ?? '') === (b.maskId ?? '');
}

function gridLines(s: Surface): Vec2[][] {
  const g = s.grid;
  const h = unitSquareToQuad(s.corners);
  if (!g || !h) return [];
  const at = (u: number, v: number) => {
    const o = evaluateGridOffset(g, u, v);
    return applyHomography(h, { x: u + o.x, y: v + o.y });
  };
  const lines: Vec2[][] = [];
  const line = (f: (t: number) => Vec2 | null) => {
    const pts: Vec2[] = [];
    for (let k = 0; k <= GRID_SAMPLES; k++) {
      const p = f(k / GRID_SAMPLES);
      if (p) pts.push(p);
    }
    lines.push(pts);
  };
  for (let i = 1; i < g.cols; i++) line((t) => at(i / g.cols, t));
  for (let j = 1; j < g.rows; j++) line((t) => at(t, j / g.rows));
  return lines;
}

export class OverlayDrawer {
  private readonly gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private buf: WebGLBuffer;
  private uColor: WebGLUniformLocation | null;
  private uPointSize: WebGLUniformLocation | null;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.program = compileProgram(gl, FLAT_VS, FLAT_FS);
    this.uColor = gl.getUniformLocation(this.program, 'uColor');
    this.uPointSize = gl.getUniformLocation(this.program, 'uPointSize');
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    this.buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  private draw(mode: number, pts: Vec2[], color: RGBA, pointSize = 1): void {
    if (pts.length === 0) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pts.flatMap((p) => [p.x, p.y])), gl.DYNAMIC_DRAW);
    gl.uniform4f(this.uColor, ...color);
    gl.uniform1f(this.uPointSize, pointSize);
    gl.drawArrays(mode, 0, pts.length);
  }

  render(project: Project, meshes: ReadonlyMap<string, SurfaceMesh>, o: OverlayState, dpr = 1): void {
    const gl = this.gl;
    gl.disable(gl.BLEND);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    for (const s of project.surfaces) {
      if (!s.visible) continue;
      const mesh = meshes.get(s.id);
      if (mesh && mesh.valid) this.draw(gl.LINE_LOOP, mesh.outline, s.id === o.selectedSurfaceId ? C.grid : C.outline);
      else this.draw(gl.LINE_LOOP, [...s.corners], C.invalid);
    }

    const sel = project.surfaces.find((s) => s.id === o.selectedSurfaceId);
    if (sel) {
      if (o.level === 'grid') for (const l of gridLines(sel)) this.draw(gl.LINE_STRIP, l, C.grid);
      for (const m of sel.masks) this.draw(gl.LINE_LOOP, m.points, C.mask);
      const handles = collectHandles(project, sel.id, o.level);
      if (o.level === 'grid' && sel.grid?.mode === 'bezier') {
        const nodes = handles.filter((h) => h.ref.kind === 'grid');
        const lines: Vec2[] = [];
        for (const h of handles.filter((x) => x.ref.kind === 'handle')) lines.push(nodes[Math.floor(h.ref.index / 4)].pos, h.pos);
        this.draw(gl.LINES, lines, C.bezierHandle);
      }
      const isSel = (r: PointRef) => o.selectedPoints.some((p) => samePoint(p, r));
      this.draw(gl.POINTS, handles.filter((h) => !isSel(h.ref) && h.ref.kind !== 'handle').map((h) => h.pos), C.handle, HANDLE_PX * dpr);
      this.draw(gl.POINTS, handles.filter((h) => !isSel(h.ref) && h.ref.kind === 'handle').map((h) => h.pos), C.bezierHandle, (HANDLE_PX - 2) * dpr);
      this.draw(gl.POINTS, handles.filter((h) => isSel(h.ref)).map((h) => h.pos), C.selected, HANDLE_PX * dpr);
    }

    if (o.draftMask && o.draftMask.length) {
      this.draw(gl.LINE_STRIP, o.draftMask, C.mask);
      this.draw(gl.POINTS, o.draftMask, C.mask, (HANDLE_PX - 2) * dpr);
    }
    if (o.marquee) {
      const r = o.marquee;
      this.draw(gl.LINE_LOOP, [
        { x: r.x, y: r.y },
        { x: r.x + r.w, y: r.y },
        { x: r.x + r.w, y: r.y + r.h },
        { x: r.x, y: r.y + r.h },
      ], C.marquee);
    }
    gl.bindVertexArray(null);
  }
}
