import { activeClip, sequenceEnd } from '../../core/sequence';
import type { SequenceClip, SequenceParams } from '../../core/types';
import { AudioMeter } from './audio';
import { CanvasTexture, EffectFrame } from './effect-frame';
import type { Source, SourceContext, SourceFactory, SourceStatus } from './types';

interface ClipMedia {
  media: HTMLMediaElement;
  path: string;
  disconnect?: () => void;
}

export class SequenceSource implements Source {
  private clock = 0;
  private anchor = performance.now() / 1000;
  private playing = true;
  private ended = false;
  private lastDraw = -Infinity;
  private lastVisual: HTMLVideoElement | null = null;
  private lastDrawnPosition = -1;
  private frameReady = false;
  private needsDraw = true;
  private frame: EffectFrame;
  private texture = new CanvasTexture();
  private players = new Map<string, ClipMedia>();
  private missing = new Set<string>();
  private errors = new Set<string>();
  private meter?: AudioMeter;

  constructor(readonly id: string, private params: SequenceParams, private ctx: SourceContext) {
    this.frame = new EffectFrame(ctx.document);
  }

  get width(): number { return this.params.width; }
  get height(): number { return this.params.height; }
  get duration(): number { return sequenceEnd(this.params.clips); }
  get hasFrame(): boolean { return this.frameReady; }
  get preview(): HTMLCanvasElement { return this.frame.canvas; }
  get status(): SourceStatus {
    return this.missing.size ? 'missing' : this.errors.size ? 'error' : 'ready';
  }
  get error(): string | undefined {
    if (this.missing.size) return `Не найдено файлов: ${this.missing.size}`;
    if (this.errors.size) return `Не удалось открыть клипы: ${this.errors.size}`;
  }

  get time(): number {
    return this.timeAt(performance.now() / 1000);
  }

  get isPlaying(): boolean { return this.playing && !this.ended; }
  isMissing(id: string): boolean { return this.missing.has(id); }
  hasError(id: string): boolean { return this.errors.has(id); }

  markMissing(ids: string[]): void {
    this.missing = new Set(ids);
    for (const id of ids) this.release(id);
    this.invalidate();
  }

  setParams(params: SequenceParams): void {
    for (const [id, player] of this.players) {
      const clip = params.clips.find((c) => c.id === id);
      if (!clip || clip.path !== player.path) this.release(id);
    }
    for (const id of [...this.missing, ...this.errors]) {
      const previous = this.params.clips.find((c) => c.id === id);
      const next = params.clips.find((c) => c.id === id);
      if (previous?.path !== next?.path) {
        this.missing.delete(id);
        this.errors.delete(id);
      }
    }
    const changedClips = this.params.clips !== params.clips || this.params.loop !== params.loop;
    const time = changedClips && this.duration ? this.time : 0;
    this.params = params;
    if (changedClips) this.seek(time);
    this.invalidate();
  }

  play(): void {
    this.meter?.resume();
    if (this.ended || (this.duration > 0 && this.clock >= this.duration)) this.seek(0);
    if (!this.playing) this.anchor = performance.now() / 1000;
    this.playing = true;
    this.ended = false;
  }

  pause(): void {
    this.clock = this.time;
    this.playing = false;
    this.players.forEach(({ media }) => media.pause());
    this.invalidate();
  }

  seek(seconds: number): void {
    this.clock = Math.max(0, Math.min(this.duration, seconds));
    this.anchor = performance.now() / 1000;
    this.ended = false;
    this.players.forEach(({ media }) => media.pause());
    this.frame.reset();
    this.lastVisual = null;
    this.invalidate();
  }

  restart(): void { this.seek(0); }

  private invalidate(): void {
    this.lastDraw = -Infinity;
    this.needsDraw = true;
  }

  private timeAt(now: number): number {
    // A generator-only sequence still has a running clock for particles and displacement.
    const time = this.clock + (this.playing && !this.ended ? Math.max(0, now - this.anchor) : 0);
    const end = this.duration;
    if (!end) return time;
    return this.params.loop && this.playing && time > end ? time % end : Math.min(time, end);
  }

  tick(now: number): void {
    if (now - this.lastDraw < 1 / 30) return;
    this.lastDraw = now;
    const end = this.duration;
    const time = this.timeAt(now);
    if (end && time >= end && !this.params.loop && this.playing) {
      this.clock = end;
      this.ended = true;
    }
    // Keep the final frame visible when paused at the endpoint.
    const position = end && time === end ? Math.max(0, end - 0.001) : time;
    const video = activeClip(this.params.clips, 'video', position);
    const audio = activeClip(this.params.clips, 'audio', position);
    const visual = this.syncClip(video, position) as HTMLVideoElement | null;
    this.syncClip(audio, position);
    for (const [id, { media }] of this.players) {
      if (id !== video?.id && id !== audio?.id) media.pause();
    }
    // Preload the next file for each track so cuts don't wait for file metadata.
    const keep = new Set([video?.id, audio?.id]);
    for (const kind of ['video', 'audio'] as const) {
      let next: SequenceClip | undefined;
      let first: SequenceClip | undefined;
      for (const clip of this.params.clips) {
        if (clip.kind !== kind || this.missing.has(clip.id) || this.errors.has(clip.id)) continue;
        if (!first || clip.start < first.start) first = clip;
        if (clip.start > position && (!next || clip.start < next.start)) next = clip;
      }
      next ??= this.params.loop ? first : undefined;
      if (next) {
        keep.add(next.id);
        this.player(next);
      }
    }
    for (const id of this.players.keys()) if (!keep.has(id)) this.release(id);

    const ready = visual && visual.readyState >= 2 && !visual.seeking && visual.videoWidth > 0 ? visual : null;
    const effects = this.params.effects ?? [];
    const animated = effects.some((e) => e.enabled);
    if (!this.needsDraw && ready === this.lastVisual && (
      (!this.isPlaying && this.lastDrawnPosition === position) || (!ready && !animated)
    )) return;
    if (position < this.lastDrawnPosition) this.frame.reset();
    this.frame.draw(ready, this.params, effects, { time, bass: this.meter?.bass() ?? 0 });
    this.lastVisual = ready;
    this.lastDrawnPosition = position;
    this.frameReady = true;
    this.needsDraw = false;
    this.texture.changed();
  }

  private player(clip: SequenceClip): ClipMedia {
    const existing = this.players.get(clip.id);
    if (existing) return existing;
    const media = this.ctx.document.createElement(clip.kind);
    media.crossOrigin = 'anonymous';
    media.preload = 'auto';
    media.muted = clip.muted;
    if (media instanceof HTMLVideoElement) media.playsInline = true;
    const entry: ClipMedia = { media, path: clip.path };
    this.players.set(clip.id, entry);
    media.addEventListener('error', () => {
      if (this.players.get(clip.id) === entry) this.errors.add(clip.id);
    });
    media.addEventListener('loadedmetadata', () => {
      const current = this.params.clips.find((c) => c.id === clip.id);
      if (current && this.players.get(clip.id) === entry && Number.isFinite(media.duration)) {
        media.currentTime = Math.min(current.inPoint, Math.max(0, media.duration - 0.001));
      }
    });
    media.src = this.ctx.mediaUrl(clip.path);
    return entry;
  }

  private syncClip(clip: SequenceClip | undefined, position: number): HTMLMediaElement | null {
    if (!clip || this.missing.has(clip.id) || this.errors.has(clip.id)) return null;
    const player = this.player(clip);
    const { media } = player;
    media.muted = clip.muted;
    if (!clip.muted && !player.disconnect && this.params.effects?.some((e) => e.enabled && (e.type === 'pulse' || e.type === 'particles'))) {
      this.meter ??= new AudioMeter();
      player.disconnect = this.meter.connect(media);
    }
    if (media.readyState < 1 || !Number.isFinite(media.duration)) return null;
    const expected = clip.inPoint + position - clip.start;
    const target = Math.min(expected, Math.max(0, media.duration - 0.001));
    const playing = this.isPlaying && expected < media.duration;
    const tolerance = playing ? 0.14 : 0.012;
    if (!media.seeking && Math.abs(media.currentTime - target) > tolerance) media.currentTime = target;
    if (playing && media.paused) void media.play().catch(() => {});
    if (!playing && !media.paused) media.pause();
    return media;
  }

  private release(id: string): void {
    const player = this.players.get(id);
    if (!player) return;
    this.players.delete(id);
    player.media.pause();
    player.disconnect?.();
    player.media.removeAttribute('src');
    player.media.load();
  }

  update(gl: WebGL2RenderingContext, tex: WebGLTexture): boolean {
    return this.texture.upload(gl, tex, this.frame.canvas);
  }

  dispose(): void {
    for (const id of this.players.keys()) this.release(id);
    this.meter?.dispose();
  }
}

export const sequenceFactory: SourceFactory<SequenceParams> = {
  type: 'sequence',
  defaults: () => ({ clips: [], width: 1920, height: 1080, loop: true }),
  create: (id, params, ctx) => new SequenceSource(id, params, ctx),
};
