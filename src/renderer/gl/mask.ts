import earcut from 'earcut';
import type { Surface } from '../../core/types';
import { compileProgram, solidTexture } from './context';
import { FLAT_FS, FLAT_VS } from './shaders';

const QUAD_VS = `#version 300 es
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const BLUR_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uStep;   // one texel along the blur direction
uniform float uSigma; // px
uniform int uRadius;  // px
out vec4 outColor;
void main() {
  float sum = 0.0;
  float wsum = 0.0;
  for (int i = -uRadius; i <= uRadius; i++) {
    float w = exp(-float(i * i) / (2.0 * uSigma * uSigma));
    sum += texture(uTex, vUv + uStep * float(i)).r * w;
    wsum += w;
  }
  outColor = vec4(sum / wsum, 0.0, 0.0, 1.0);
}`;

const COPY_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
out vec4 outColor;
void main() { outColor = vec4(texture(uTex, vUv).r, 0.0, 0.0, 1.0); }`;

type Size = { width: number; height: number };

interface Target {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
}

/**
 * Builds per-surface R8 mask textures in output pixel space:
 * mask = union(include, or 1 when there is none) × (1 − union(exclude)), each mask feathered by a gaussian blur.
 */
export class MaskCache {
  private readonly gl: WebGL2RenderingContext;
  private flat: WebGLProgram;
  private blur: WebGLProgram;
  private copy: WebGLProgram;
  private quadVao: WebGLVertexArrayObject;
  private polyVao: WebGLVertexArrayObject;
  private polyBuf: WebGLBuffer;
  private white: WebGLTexture;
  private scratch: { size: Size; a: Target; b: Target; exclude: Target } | null = null;
  private cache = new Map<string, { key: string; target: Target }>();

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.flat = compileProgram(gl, FLAT_VS, FLAT_FS);
    this.blur = compileProgram(gl, QUAD_VS, BLUR_FS);
    this.copy = compileProgram(gl, QUAD_VS, COPY_FS);
    this.white = solidTexture(gl, [255, 255, 255, 255]);
    this.quadVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.quadVao);
    const qb = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.polyVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.polyVao);
    this.polyBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.polyBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  private createTarget(size: Size): Target {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, size.width, size.height, 0, gl.RED, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fbo };
  }

  private deleteTarget(t: Target): void {
    this.gl.deleteTexture(t.tex);
    this.gl.deleteFramebuffer(t.fbo);
  }

  private scratchFor(size: Size) {
    const s = this.scratch;
    if (s && s.size.width === size.width && s.size.height === size.height) return s;
    if (s) [s.a, s.b, s.exclude].forEach((t) => this.deleteTarget(t));
    this.scratch = { size: { ...size }, a: this.createTarget(size), b: this.createTarget(size), exclude: this.createTarget(size) };
    return this.scratch;
  }

  private clear(t: Target, v: number): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.disable(gl.BLEND);
    gl.clearColor(v, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  private fillPolygon(t: Target, flat: number[]): void {
    const gl = this.gl;
    const idx = earcut(flat);
    const verts = new Float32Array(idx.length * 2);
    idx.forEach((k, n) => {
      verts[2 * n] = flat[2 * k];
      verts[2 * n + 1] = flat[2 * k + 1];
    });
    this.clear(t, 0);
    gl.useProgram(this.flat);
    gl.uniform4f(gl.getUniformLocation(this.flat, 'uColor'), 1, 1, 1, 1);
    gl.uniform1f(gl.getUniformLocation(this.flat, 'uPointSize'), 1);
    gl.bindVertexArray(this.polyVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.polyBuf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, idx.length);
  }

  private blurPass(src: Target, dst: Target, step: [number, number], sigma: number): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
    gl.disable(gl.BLEND);
    gl.useProgram(this.blur);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.uniform1i(gl.getUniformLocation(this.blur, 'uTex'), 0);
    gl.uniform2f(gl.getUniformLocation(this.blur, 'uStep'), step[0], step[1]);
    gl.uniform1f(gl.getUniformLocation(this.blur, 'uSigma'), sigma);
    gl.uniform1i(gl.getUniformLocation(this.blur, 'uRadius'), Math.ceil(sigma * 3));
    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** Draws `src` into `dst` with the current blend state. */
  private composite(src: Target, dst: Target): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
    gl.useProgram(this.copy);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.uniform1i(gl.getUniformLocation(this.copy, 'uTex'), 0);
    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** Returns the surface's mask texture, or a shared 1×1 white texture when it has no usable masks. */
  get(s: Surface, size: Size): WebGLTexture {
    const masks = s.masks.filter((m) => m.points.length >= 3);
    if (masks.length === 0) return this.white;
    const key = JSON.stringify([masks, size.width, size.height]);
    const hit = this.cache.get(s.id);
    if (hit && hit.key === key) return hit.target.tex;

    const gl = this.gl;
    const prevViewport = gl.getParameter(gl.VIEWPORT) as Int32Array;
    gl.viewport(0, 0, size.width, size.height);
    const sc = this.scratchFor(size);
    const out = hit && hit.key.endsWith(`,${size.width},${size.height}]`) ? hit.target : this.createTarget(size);
    if (hit && hit.target !== out) this.deleteTarget(hit.target);

    const includes = masks.filter((m) => m.mode === 'include');
    const excludes = masks.filter((m) => m.mode === 'exclude');
    this.clear(out, includes.length ? 0 : 1);
    this.clear(sc.exclude, 0);
    for (const m of masks) {
      this.fillPolygon(sc.a, m.points.flatMap((p) => [p.x, p.y]));
      let result = sc.a;
      if (m.feather > 0) {
        const sigma = m.feather / 2;
        this.blurPass(sc.a, sc.b, [1 / size.width, 0], sigma);
        this.blurPass(sc.b, sc.a, [0, 1 / size.height], sigma);
        result = sc.a;
      }
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.MAX);
      this.composite(result, m.mode === 'include' ? out : sc.exclude);
      gl.blendEquation(gl.FUNC_ADD);
      gl.disable(gl.BLEND);
    }
    if (excludes.length) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_COLOR);
      this.composite(sc.exclude, out);
      gl.disable(gl.BLEND);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindVertexArray(null);
    gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);
    this.cache.set(s.id, { key, target: out });
    return out.tex;
  }

  /** Drops cached masks of surfaces that no longer exist. */
  retain(ids: Set<string>): void {
    for (const [id, e] of this.cache)
      if (!ids.has(id)) {
        this.deleteTarget(e.target);
        this.cache.delete(id);
      }
  }

  dispose(): void {
    for (const e of this.cache.values()) this.deleteTarget(e.target);
    this.cache.clear();
    if (this.scratch) [this.scratch.a, this.scratch.b, this.scratch.exclude].forEach((t) => this.deleteTarget(t));
    this.scratch = null;
  }
}
