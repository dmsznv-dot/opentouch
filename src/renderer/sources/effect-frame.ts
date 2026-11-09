import type { EffectNode } from '../../core/effects';

const GLYPHS = ' .:-=+*#%@';

type EffectState = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D };
type Frame = { time: number; bass: number };

export class EffectFrame {
  readonly canvas: HTMLCanvasElement;
  private buffers: [EffectState, EffectState];
  private history = new Map<string, EffectState>();
  private pixels: EffectState;

  constructor(doc: Document) {
    this.canvas = doc.createElement('canvas');
    this.buffers = [this.createBuffer(doc), this.createBuffer(doc)];
    this.pixels = this.createBuffer(doc, true);
  }

  private createBuffer(doc: Document, read = false): EffectState {
    const canvas = doc.createElement('canvas');
    return { canvas, ctx: canvas.getContext('2d', { willReadFrequently: read })! };
  }

  reset(): void {
    this.history.clear();
  }

  draw(input: CanvasImageSource | null, size: { width: number; height: number }, nodes: EffectNode[], frame: Frame): void {
    // Keep CPU effects bounded while preserving the composition aspect ratio.
    const scale = nodes.some((node) => node.enabled) ? Math.min(1, 960 / Math.max(size.width, size.height)) : 1;
    const w = Math.max(1, Math.round(size.width * scale));
    const h = Math.max(1, Math.round(size.height * scale));
    this.resize(this.canvas, w, h);
    const output = this.canvas.getContext('2d')!;
    output.fillStyle = 'black';
    output.fillRect(0, 0, w, h);
    if (input instanceof HTMLVideoElement) {
      const fit = Math.min(w / input.videoWidth, h / input.videoHeight);
      const width = input.videoWidth * fit;
      const height = input.videoHeight * fit;
      output.drawImage(input, (w - width) / 2, (h - height) / 2, width, height);
    } else if (input) {
      output.drawImage(input, 0, 0, w, h);
    }
    let read = this.canvas;
    let index = 0;
    for (const node of nodes) {
      if (!node.enabled) continue;
      const buffer = this.buffers[index % 2];
      this.resize(buffer.canvas, w, h);
      buffer.ctx.clearRect(0, 0, w, h);
      this.apply(buffer.ctx, read, node, frame);
      read = buffer.canvas;
      index++;
    }
    if (read !== this.canvas) {
      output.clearRect(0, 0, w, h);
      output.drawImage(read, 0, 0);
    }
    for (const id of this.history.keys()) {
      if (!nodes.some((node) => node.id === id && node.enabled && node.type === 'feedback')) this.history.delete(id);
    }
  }

  private resize(canvas: HTMLCanvasElement, width: number, height: number): void {
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
  }

  private apply(ctx: CanvasRenderingContext2D, input: HTMLCanvasElement, node: EffectNode, { time, bass }: Frame): void {
    const { width: w, height: h } = input;
    const v = node.value;
    ctx.save();
    try {
      switch (node.type) {
        case 'transform':
          ctx.translate(w / 2, h / 2);
          ctx.rotate(v * Math.PI * 2);
          ctx.drawImage(input, -w / 2, -h / 2);
          break;
        case 'displace': {
          const band = Math.max(2, Math.round(h / 90));
          for (let y = 0; y < h; y += band) {
            const height = Math.min(band, h - y);
            const offset = Math.sin(y / h * 19 + time * 4) * v * w * 0.18;
            ctx.drawImage(input, 0, y, w, height, offset, y, w, height);
          }
          break;
        }
        case 'ascii':
          this.ascii(ctx, input, v);
          break;
        case 'particles':
          ctx.drawImage(input, 0, 0);
          this.particles(ctx, w, h, time, bass, v);
          break;
        case 'pulse': {
          const scale = 1 + bass * v * 0.65;
          ctx.translate(w / 2, h / 2);
          ctx.scale(scale, scale);
          ctx.drawImage(input, -w / 2, -h / 2);
          break;
        }
        case 'blur':
          ctx.filter = `blur(${v * Math.min(w, h) / 18}px)`;
          ctx.drawImage(input, 0, 0);
          break;
        case 'level':
          ctx.filter = `brightness(${2 * v})`;
          ctx.drawImage(input, 0, 0);
          break;
        case 'mirror':
          ctx.drawImage(input, 0, 0);
          ctx.globalAlpha = v;
          ctx.translate(w, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(input, 0, 0);
          break;
        case 'threshold': {
          const pixels = this.readPixels(input, w, h);
          for (let i = 0; i < pixels.data.length; i += 4) {
            const level = this.luma(pixels.data, i) >= v * 255 ? 255 : 0;
            pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = level;
          }
          ctx.putImageData(pixels, 0, 0);
          break;
        }
        case 'feedback': {
          let history = this.history.get(node.id);
          if (!history) {
            history = this.createBuffer(input.ownerDocument);
            this.history.set(node.id, history);
          }
          this.resize(history.canvas, w, h);
          ctx.drawImage(input, 0, 0);
          ctx.globalAlpha = v * 0.9;
          ctx.drawImage(history.canvas, -w * 0.012, -h * 0.012, w * 1.024, h * 1.024);
          history.ctx.clearRect(0, 0, w, h);
          history.ctx.drawImage(ctx.canvas, 0, 0);
          break;
        }
      }
    } finally {
      ctx.restore();
    }
  }

  private readPixels(input: HTMLCanvasElement, w: number, h: number): ImageData {
    const { canvas, ctx } = this.pixels;
    this.resize(canvas, w, h);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(input, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  }

  private luma(data: Uint8ClampedArray, i: number): number {
    return 0.213 * data[i] + 0.715 * data[i + 1] + 0.072 * data[i + 2];
  }

  private ascii(ctx: CanvasRenderingContext2D, input: HTMLCanvasElement, value: number): void {
    const cell = 5 + Math.round(20 * value);
    const cols = Math.max(1, Math.floor(input.width / cell));
    const rows = Math.max(1, Math.floor(input.height / (cell * 1.5)));
    const pixels = this.readPixels(input, cols, rows).data;
    const width = input.width / cols;
    const height = input.height / rows;
    ctx.fillStyle = '#06090b';
    ctx.fillRect(0, 0, input.width, input.height);
    ctx.font = `${height}px monospace`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#c8ffdf';
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const level = this.luma(pixels, (y * cols + x) * 4);
        const glyph = GLYPHS[Math.round(level / 255 * (GLYPHS.length - 1))];
        if (glyph !== ' ') ctx.fillText(glyph, x * width, y * height);
      }
    }
  }

  private particles(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, bass: number, value: number): void {
    const count = Math.round(value * 520);
    const unit = Math.min(w, h);
    ctx.fillStyle = '#9cffe6';
    for (let i = 0; i < count; i++) {
      const angle = i * 2.399963 + time * (0.12 + (i % 7) * 0.012);
      const distance = Math.sqrt((i + 1) / count) * unit * (0.35 + 0.12 * Math.sin(time * 2) + bass * 0.25);
      const size = unit * (0.002 + (i % 4) * 0.0008 + bass * 0.009);
      ctx.globalAlpha = 0.5 + (i % 5) * 0.1;
      ctx.beginPath();
      ctx.arc(w / 2 + Math.cos(angle) * distance, h / 2 + Math.sin(angle) * distance, size, 0, 2 * Math.PI);
      ctx.fill();
    }
  }
}

export class CanvasTexture {
  private version = 0;
  private uploaded = new WeakMap<WebGLTexture, number>();

  changed(): void { this.version++; }

  upload(gl: WebGL2RenderingContext, texture: WebGLTexture, canvas: HTMLCanvasElement): boolean {
    if (!this.version || this.uploaded.get(texture) === this.version) return false;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    this.uploaded.set(texture, this.version);
    return true;
  }
}
