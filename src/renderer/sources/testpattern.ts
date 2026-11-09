import type { TestPatternParams } from '../../core/types';
import type { Source, SourceContext, SourceFactory } from './types';

const SIZE = 1024;

function draw(c: CanvasRenderingContext2D, pattern: TestPatternParams['pattern']): void {
  if (pattern === 'corners') {
    const h = SIZE / 2;
    c.fillStyle = '#ff0000';
    c.fillRect(0, 0, h, h);
    c.fillStyle = '#00ff00';
    c.fillRect(h, 0, h, h);
    c.fillStyle = '#0000ff';
    c.fillRect(h, h, h, h);
    c.fillStyle = '#ffff00';
    c.fillRect(0, h, h, h);
    return;
  }
  if (pattern === 'checker') {
    const n = 16;
    const s = SIZE / n;
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        c.fillStyle = (i + j) % 2 ? '#808080' : '#ffffff';
        c.fillRect(i * s, j * s, s, s);
      }
    return;
  }
  c.fillStyle = '#333333';
  c.fillRect(0, 0, SIZE, SIZE);
  c.strokeStyle = '#ffffff';
  c.lineWidth = 3;
  for (let k = 0; k <= SIZE; k += 64) {
    c.beginPath();
    c.moveTo(k, 0);
    c.lineTo(k, SIZE);
    c.moveTo(0, k);
    c.lineTo(SIZE, k);
    c.stroke();
  }
  c.strokeStyle = '#ff3b30';
  c.lineWidth = 6;
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(SIZE, SIZE);
  c.moveTo(SIZE, 0);
  c.lineTo(0, SIZE);
  c.stroke();
  c.beginPath();
  c.arc(SIZE / 2, SIZE / 2, SIZE / 3, 0, Math.PI * 2);
  c.stroke();
  c.fillStyle = '#ffffff';
  c.font = 'bold 40px sans-serif';
  c.fillText('TL', 16, 52);
  c.fillText('TR', SIZE - 72, 52);
  c.fillText('BR', SIZE - 72, SIZE - 20);
  c.fillText('BL', 16, SIZE - 20);
}

class TestPatternSource implements Source {
  readonly width = SIZE;
  readonly height = SIZE;
  readonly status = 'ready' as const;
  private canvas: HTMLCanvasElement;
  private uploaded = new WeakSet<WebGLTexture>();

  constructor(
    readonly id: string,
    params: TestPatternParams,
    doc: Document,
  ) {
    this.canvas = doc.createElement('canvas');
    this.canvas.width = SIZE;
    this.canvas.height = SIZE;
    draw(this.canvas.getContext('2d')!, params.pattern);
  }

  update(gl: WebGL2RenderingContext, tex: WebGLTexture): boolean {
    if (this.uploaded.has(tex)) return false;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
    this.uploaded.add(tex);
    return true;
  }

  dispose(): void {}
}

export const testPatternFactory: SourceFactory<TestPatternParams> = {
  type: 'testpattern',
  defaults: () => ({ pattern: 'grid' }),
  create: (id: string, params: TestPatternParams, ctx: SourceContext) => new TestPatternSource(id, params, ctx.document),
};
