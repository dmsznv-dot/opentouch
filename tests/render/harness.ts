import { deserializeProject } from '../../src/core/project';
import { createGL } from '../../src/renderer/gl/context';
import { Renderer, type OverlayState, type RenderFrame } from '../../src/renderer/gl/renderer';
import { getFactory } from '../../src/renderer/sources/registry';
import type { Source, SourceContext } from '../../src/renderer/sources/types';

const ctx: SourceContext = { document, mediaUrl: (p) => p };
const canvas = document.createElement('canvas');
document.body.appendChild(canvas);
const gl = createGL(canvas);
const renderer = new Renderer(gl);
const sources = new Map<string, Source>();

function syncSources(json: string): ReturnType<typeof deserializeProject> {
  const p = deserializeProject(json);
  for (const d of p.sources) {
    if (sources.has(d.id)) continue;
    sources.set(d.id, getFactory(d.type).create(d.id, d.params, ctx));
  }
  return p;
}

interface Opts {
  overlay?: OverlayState | null;
  testPattern?: RenderFrame['testPattern'];
  selectedSurfaceId?: string | null;
}

/** Renders a project and returns RGBA pixels, rows top to bottom. */
async function renderToPixels(json: string, w: number, h: number, opts: Opts = {}): Promise<number[]> {
  const project = syncSources(json);
  renderer.render({
    project,
    sources,
    timeSec: performance.now() / 1000,
    size: { width: w, height: h },
    overlay: opts.overlay ?? null,
    testPattern: opts.testPattern ?? 'none',
    selectedSurfaceId: opts.selectedSurfaceId ?? null,
  });
  const raw = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, raw);
  const out = new Array<number>(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let k = 0; k < w * 4; k++) out[y * w * 4 + k] = raw[(h - 1 - y) * w * 4 + k];
  return out;
}

Object.assign(window, { renderToPixels, __sources: sources, __renderer: renderer });

// ---- Engine harness ----
import { ProjectStore } from '../../src/core/store';
import { Engine, type Mode } from '../../src/renderer/engine';
import { openProjectorOutput, type ProjectorOutput } from '../../src/renderer/outputs/projector';

let engine: Engine | null = null;
let output: ProjectorOutput | null = null;
let outputClosed = false;
let preview: HTMLCanvasElement | null = null;

async function startEngine(json: string): Promise<void> {
  const store = new ProjectStore(deserializeProject(json));
  engine = new Engine(store, ctx);
  preview = document.createElement('canvas');
  preview.style.cssText = 'width:320px;height:180px;display:block';
  document.body.appendChild(preview);
  engine.attachEditorCanvas(preview);
  engine.setOverlay({ selectedSurfaceId: 'a', selectedPoints: [], level: 'corners', draftMask: null, marquee: null });
  output = await openProjectorOutput('/src/renderer/output.html');
  if (output) {
    output.onClosed(() => {
      outputClosed = true;
      engine?.setOutput(null);
    });
    engine.setOutput(output);
  }
}

function sample(c: HTMLCanvasElement, x: number, y: number): number[] {
  const tmp = document.createElement('canvas');
  tmp.width = c.width;
  tmp.height = c.height;
  const g = tmp.getContext('2d')!;
  g.drawImage(c, 0, 0);
  return Array.from(g.getImageData(Math.floor(x * c.width), Math.floor(y * c.height), 1, 1).data);
}

function probe(x: number, y: number) {
  engine!.renderOnce();
  const o = engine!.getOutput();
  return { output: o ? sample(o.canvas, x, y) : null, editor: sample(preview!, x, y), outputClosed };
}

Object.assign(window, {
  startEngine,
  probe,
  setMode: (m: Mode) => engine?.setMode(m),
  closeOutput: () => output && (output as unknown as { win: Window }).win.close(),
});

async function loseContext(): Promise<void> {
  const ext = gl.getExtension('WEBGL_lose_context')!;
  const restored = new Promise<void>((r) => canvas.addEventListener('webglcontextrestored', () => r(), { once: true }));
  ext.loseContext();
  await new Promise((r) => setTimeout(r, 50));
  ext.restoreContext();
  await restored;
}
Object.assign(window, { __loseContext: loseContext });
