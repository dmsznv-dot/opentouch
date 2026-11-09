import type { ProjectStore } from '../core/store';
import type { Project, SourceDef } from '../core/types';
import { createGL } from './gl/context';
import { Renderer, type OverlayState, type RenderFrame } from './gl/renderer';
import type { Output } from './outputs/types';
import { getFactory } from './sources/registry';
import type { Source, SourceContext, SourceStatus } from './sources/types';
import { VideoSource } from './sources/video';

export type Mode = 'edit' | 'show';

const PREVIEW_MIN_FRAME_MS = 1000 / 30;
const EMPTY_OVERLAY: OverlayState = { selectedSurfaceId: null, selectedPoints: [], level: 'corners', draftMask: null, marquee: null };

interface Live {
  def: SourceDef;
  source: Source;
}

/** Owns live sources and both renderers (editor preview + output) and drives their frame loops. */
export class Engine {
  private live = new Map<string, Live>();
  private sourcesView = new Map<string, Source>();
  private editor: { canvas: HTMLCanvasElement; renderer: Renderer } | null = null;
  private output: { o: Output; renderer: Renderer; off: () => void } | null = null;
  private mode: Mode = 'edit';
  private overlay: OverlayState = EMPTY_OVERLAY;
  private testPattern: RenderFrame['testPattern'] = 'none';
  private playing = true;
  private statusCbs = new Set<() => void>();
  private lastStatus = '';
  private lastPreview = 0;
  private raf = 0;
  private stopped = false;

  constructor(
    private readonly store: ProjectStore,
    private readonly ctx: SourceContext,
  ) {
    this.syncSources(store.get());
    store.subscribe(() => this.syncSources(store.get()));
    const loop = (t: number) => {
      if (this.stopped) return;
      this.raf = requestAnimationFrame(loop);
      if (t - this.lastPreview < PREVIEW_MIN_FRAME_MS) return;
      this.lastPreview = t;
      try {
        this.renderEditor(t / 1000);
        this.checkStatus();
      } catch (e) {
        console.error('Preview frame failed', e);
      }
    };
    this.raf = requestAnimationFrame(loop);
  }

  private syncSources(p: Project): void {
    const ids = new Set(p.sources.map((s) => s.id));
    for (const [id, l] of this.live)
      if (!ids.has(id)) {
        l.source.dispose();
        this.live.delete(id);
      }
    for (const def of p.sources) {
      try {
        this.syncSource(def);
      } catch (e) {
        console.error(`Source ${def.id} could not be created`, e);
      }
    }
    this.sourcesView = new Map([...this.live].map(([id, l]) => [id, l.source]));
  }

  private syncSource(def: SourceDef): void {
    {
      const l = this.live.get(def.id);
      if (l && l.def === def) return;
      const sameKind = l && l.def.type === def.type;
      if (l && sameKind && def.type === 'video' && l.source instanceof VideoSource && (l.def.params as { path: string }).path === def.params.path) {
        l.source.setParams(def.params);
        l.def = def;
        return;
      }
      if (l && sameKind && JSON.stringify(l.def.params) === JSON.stringify(def.params)) {
        l.def = def;
        return;
      }
      l?.source.dispose();
      const source = getFactory(def.type).create(def.id, def.params, this.ctx);
      if (source instanceof VideoSource && !this.playing) source.pause();
      this.live.set(def.id, { def, source });
    }
  }

  private frame(overlay: OverlayState | null, timeSec: number, size: { width: number; height: number }, handleScale: number): RenderFrame {
    return {
      project: this.store.get(),
      sources: this.sourcesView,
      timeSec,
      size,
      overlay,
      testPattern: this.testPattern,
      selectedSurfaceId: this.overlay.selectedSurfaceId,
      handleScale,
    };
  }

  private renderEditor(timeSec: number): void {
    const e = this.editor;
    if (!e) return;
    const dpr = e.canvas.ownerDocument.defaultView?.devicePixelRatio ?? 1;
    const width = Math.max(1, Math.round(e.canvas.clientWidth * dpr));
    const height = Math.max(1, Math.round(e.canvas.clientHeight * dpr));
    e.renderer.render(this.frame(this.overlay, timeSec, { width, height }, dpr));
  }

  private renderOutput(timeSec: number): void {
    const o = this.output;
    if (!o) return;
    o.renderer.render(this.frame(this.mode === 'edit' ? this.overlay : null, timeSec, { width: o.o.width, height: o.o.height }, 1));
  }

  private checkStatus(): void {
    const s = [...this.live].map(([id, l]) => `${id}:${l.source.status}`).join('|');
    if (s === this.lastStatus) return;
    this.lastStatus = s;
    for (const cb of this.statusCbs) cb();
  }

  attachEditorCanvas(c: HTMLCanvasElement | null): void {
    this.editor?.renderer.dispose();
    this.editor = c ? { canvas: c, renderer: new Renderer(createGL(c)) } : null;
  }

  setOutput(o: Output | null): void {
    if (this.output) {
      this.output.off();
      this.output.renderer.dispose();
    }
    this.output = null;
    if (!o) return;
    const renderer = new Renderer(createGL(o.canvas));
    const off = o.onFrame((t) => this.renderOutput(t));
    this.output = { o, renderer, off };
  }

  getOutput(): Output | null {
    return this.output?.o ?? null;
  }

  setMode(m: Mode): void {
    this.mode = m;
  }

  getMode(): Mode {
    return this.mode;
  }

  setOverlay(o: OverlayState): void {
    this.overlay = o;
  }

  setTestPattern(t: RenderFrame['testPattern']): void {
    this.testPattern = t;
  }

  private videos(): VideoSource[] {
    return [...this.live.values()].map((l) => l.source).filter((s): s is VideoSource => s instanceof VideoSource);
  }

  play(): void {
    this.playing = true;
    this.videos().forEach((v) => v.play());
  }

  pause(): void {
    this.playing = false;
    this.videos().forEach((v) => v.pause());
  }

  isPlaying(): boolean {
    return this.playing;
  }

  restart(): void {
    this.videos().forEach((v) => v.restart());
  }

  getSource(id: string): Source | undefined {
    return this.live.get(id)?.source;
  }

  sourceStatus(id: string): { status: SourceStatus; error?: string } | null {
    const s = this.live.get(id)?.source;
    return s ? { status: s.status, error: s.error } : null;
  }

  subscribeStatus(fn: () => void): () => void {
    this.statusCbs.add(fn);
    return () => this.statusCbs.delete(fn);
  }

  /** Renders both targets immediately (screenshots, tests). */
  renderOnce(): void {
    const t = performance.now() / 1000;
    this.renderEditor(t);
    this.renderOutput(t);
  }

  dispose(): void {
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    this.setOutput(null);
    this.attachEditorCanvas(null);
    for (const l of this.live.values()) l.source.dispose();
    this.live.clear();
  }
}
