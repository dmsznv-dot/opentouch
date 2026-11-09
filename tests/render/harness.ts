import { deserializeProject } from '../../src/core/project';
import { createGL } from '../../src/renderer/gl/context';
import { Renderer, type OverlayState, type RenderFrame } from '../../src/renderer/gl/renderer';
import { testPatternFactory } from '../../src/renderer/sources/testpattern';
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
    if (d.type === 'testpattern') sources.set(d.id, testPatternFactory.create(d.id, d.params, ctx));
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
