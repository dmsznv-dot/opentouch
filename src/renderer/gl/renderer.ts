import type { PointRef, Project, Rect, Surface, Vec2 } from '../../core/types';
import { buildSurfaceMesh, type SurfaceMesh } from '../../core/warp/mesh';
import { testPatternFactory } from '../sources/testpattern';
import type { Source } from '../sources/types';
import { compileProgram, createTexture, solidTexture } from './context';
import { MaskCache } from './mask';
import { OverlayDrawer } from './overlay';
import { SURFACE_FS, SURFACE_VS } from './shaders';

export interface OverlayState {
  selectedSurfaceId: string | null;
  selectedPoints: PointRef[];
  level: 'corners' | 'grid';
  draftMask: Vec2[] | null;
  marquee: Rect | null;
}

export interface RenderFrame {
  project: Project;
  sources: ReadonlyMap<string, Source>;
  timeSec: number;
  /** Drawing-buffer size in pixels. */
  size: { width: number; height: number };
  overlay: OverlayState | null;
  testPattern: 'none' | 'selected' | 'all';
  selectedSurfaceId: string | null;
  /** Multiplier for overlay handle size (devicePixelRatio of the target). */
  handleScale?: number;
}

interface MeshEntry {
  key: string;
  mesh: SurfaceMesh;
  vao: WebGLVertexArrayObject | null;
  buffers: WebGLBuffer[];
}

const TEST_PATTERN_ID = '__testpattern__';

export class Renderer {
  protected readonly gl: WebGL2RenderingContext;
  private program!: WebGLProgram;
  private u!: Record<'src' | 'mask' | 'rect' | 'halfTexel' | 'size' | 'opacity', WebGLUniformLocation | null>;
  private meshes = new Map<string, MeshEntry>();
  private textures = new Map<string, WebGLTexture>();
  private black!: WebGLTexture;
  private testPattern: Source;
  private masks!: MaskCache;
  private overlay!: OverlayDrawer;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    const doc = (gl.canvas as HTMLCanvasElement).ownerDocument ?? document;
    this.testPattern = testPatternFactory.create(TEST_PATTERN_ID, { pattern: 'grid' }, { document: doc, mediaUrl: (p) => p });
    this.initGL();
    const canvas = gl.canvas as HTMLCanvasElement;
    this.onLost = (e: Event) => e.preventDefault();
    this.onRestored = () => this.initGL();
    canvas.addEventListener('webglcontextlost', this.onLost);
    canvas.addEventListener('webglcontextrestored', this.onRestored);
  }

  private onLost: (e: Event) => void;
  private onRestored: () => void;

  /** (Re)creates every GL object; also used after a context restore. */
  protected initGL(): void {
    const gl = this.gl;
    this.program = compileProgram(gl, SURFACE_VS, SURFACE_FS);
    const loc = (n: string) => gl.getUniformLocation(this.program, n);
    this.u = {
      src: loc('uSrc'),
      mask: loc('uMask'),
      rect: loc('uRect'),
      halfTexel: loc('uHalfTexel'),
      size: loc('uSize'),
      opacity: loc('uOpacity'),
    };
    this.black = solidTexture(gl, [0, 0, 0, 255]);
    this.masks = new MaskCache(gl);
    this.overlay = new OverlayDrawer(gl);
    this.meshes.clear();
    this.textures.clear();
  }

  protected maskFor(s: Surface, size: RenderFrame['size'], outputWidth: number): WebGLTexture {
    return this.masks.get(s, size, outputWidth);
  }

  protected meshFor(s: Surface): MeshEntry {
    const gl = this.gl;
    const key = JSON.stringify([s.corners, s.grid, s.inputRect]);
    const cached = this.meshes.get(s.id);
    if (cached && cached.key === key) return cached;
    if (cached) this.deleteMesh(cached);
    const mesh = buildSurfaceMesh(s);
    const entry: MeshEntry = { key, mesh, vao: null, buffers: [] };
    if (mesh.valid) {
      entry.vao = gl.createVertexArray();
      gl.bindVertexArray(entry.vao);
      const attr = (loc: number, data: Float32Array) => {
        const b = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        entry.buffers.push(b);
      };
      attr(0, mesh.positions);
      attr(1, mesh.uvs);
      const ib = gl.createBuffer()!;
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
      entry.buffers.push(ib);
      gl.bindVertexArray(null);
    }
    this.meshes.set(s.id, entry);
    return entry;
  }

  private deleteMesh(e: MeshEntry): void {
    if (e.vao) this.gl.deleteVertexArray(e.vao);
    for (const b of e.buffers) this.gl.deleteBuffer(b);
  }

  /** Current meshes by surface id (valid after render). */
  getMeshes(): ReadonlyMap<string, SurfaceMesh> {
    return new Map([...this.meshes].map(([id, e]) => [id, e.mesh]));
  }

  private textureFor(src: Source, timeSec: number): WebGLTexture {
    let tex = this.textures.get(src.id);
    if (!tex) {
      tex = createTexture(this.gl);
      this.textures.set(src.id, tex);
    }
    src.update(this.gl, tex, timeSec);
    return src.status === 'ready' ? tex : this.black;
  }

  render(f: RenderFrame): void {
    const gl = this.gl;
    if (gl.isContextLost()) return;
    const canvas = gl.canvas as HTMLCanvasElement;
    if (canvas.width !== f.size.width) canvas.width = f.size.width;
    if (canvas.height !== f.size.height) canvas.height = f.size.height;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, f.size.width, f.size.height);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    this.collectGarbage(f);

    gl.useProgram(this.program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1i(this.u.src, 0);
    gl.uniform1i(this.u.mask, 1);
    gl.uniform2f(this.u.size, f.size.width, f.size.height);

    for (const s of f.project.surfaces) {
      if (!s.visible || s.opacity <= 0) continue;
      try {
        this.drawSurface(f, s);
      } catch (e) {
        // One broken surface or source must never stop the projector; it simply stays black.
        console.warn(`Surface ${s.id} failed to render`, e);
      }
    }
    gl.bindVertexArray(null);
    if (f.overlay) {
      try {
        this.drawOverlay(f);
      } catch (e) {
        console.warn('Overlay failed to render', e);
      }
    }
  }

  private drawSurface(f: RenderFrame, s: Surface): void {
    const gl = this.gl;
    {
      const entry = this.meshFor(s);
      if (!entry.mesh.valid) return;
      const useTest = f.testPattern === 'all' || (f.testPattern === 'selected' && s.id === f.selectedSurfaceId);
      const src = useTest ? this.testPattern : s.sourceId ? f.sources.get(s.sourceId) : undefined;
      let tex = this.black;
      try {
        if (src) tex = this.textureFor(src, f.timeSec);
      } catch (e) {
        console.warn(`Source ${src?.id} failed to update`, e);
      }
      const rect = useTest ? { x: 0, y: 0, w: 1, h: 1 } : s.inputRect;
      const mask = this.maskFor(s, f.size, f.project.output.width);
      // Mask building changes framebuffer/blend state; restore it for every surface.
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, f.size.width, f.size.height);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, mask);
      gl.uniform4f(this.u.rect, rect.x, rect.y, rect.w, rect.h);
      gl.uniform2f(this.u.halfTexel, src ? 0.5 / src.width : 0, src ? 0.5 / src.height : 0);
      gl.uniform2f(this.u.size, f.size.width, f.size.height);
      gl.uniform1f(this.u.opacity, s.opacity);
      gl.bindVertexArray(entry.vao);
      gl.drawElements(gl.TRIANGLES, entry.mesh.indices.length, gl.UNSIGNED_INT, 0);
      gl.bindVertexArray(null);
    }
  }

  protected drawOverlay(f: RenderFrame): void {
    if (!f.overlay) return;
    // Meshes for every visible surface must exist even if they were skipped (opacity 0).
    for (const s of f.project.surfaces) if (s.visible) this.meshFor(s);
    this.overlay.render(f.project, this.getMeshes(), f.overlay, f.handleScale ?? 1);
  }

  private collectGarbage(f: RenderFrame): void {
    const ids = new Set(f.project.surfaces.map((s) => s.id));
    this.masks.retain(ids);
    for (const [id, e] of this.meshes)
      if (!ids.has(id)) {
        this.deleteMesh(e);
        this.meshes.delete(id);
      }
    for (const [id, t] of this.textures)
      if (id !== TEST_PATTERN_ID && !f.sources.has(id)) {
        this.gl.deleteTexture(t);
        this.textures.delete(id);
      }
  }

  dispose(): void {
    const canvas = this.gl.canvas as HTMLCanvasElement;
    canvas.removeEventListener('webglcontextlost', this.onLost);
    canvas.removeEventListener('webglcontextrestored', this.onRestored);
    for (const e of this.meshes.values()) this.deleteMesh(e);
    for (const t of this.textures.values()) this.gl.deleteTexture(t);
    this.meshes.clear();
    this.textures.clear();
    this.masks.dispose();
    this.testPattern.dispose();
  }
}
