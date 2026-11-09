import { AudioMeter } from './audio';
import { CanvasTexture, EffectFrame } from './effect-frame';
import type { VideoParams } from '../../core/types';
import type { Source, SourceContext, SourceFactory, SourceStatus } from './types';

export const CODEC_ERROR = 'Кодек не поддерживается — перекодируйте в H.264';

export class VideoSource implements Source {
  private video: HTMLVideoElement;
  private frame = 0;
  private uploaded = new WeakMap<WebGLTexture, number>();
  private wantPlaying = true;
  private _status: SourceStatus = 'loading';
  private _error: string | undefined;
  private disposed = false;
  private effects?: EffectFrame;
  private texture = new CanvasTexture();
  private meter?: AudioMeter;
  private lastEffectTime = -Infinity;
  private effectClock = 0;
  private renderedFrame = -1;
  private effectsDirty = true;

  constructor(
    readonly id: string,
    private params: VideoParams,
    private ctx: SourceContext,
  ) {
    const v = ctx.document.createElement('video');
    v.muted = params.muted;
    v.loop = params.loop;
    v.playsInline = true;
    v.preload = 'auto';
    // Media is served from otmedia:// (another origin than the page); CORS keeps WebGL uploads untainted.
    v.crossOrigin = 'anonymous';
    v.addEventListener('loadeddata', () => {
      this._status = 'ready';
      this.frame++;
      v.playbackRate = this.params.rate;
      if (this.wantPlaying) void v.play().catch(() => {});
    });
    v.addEventListener('seeked', () => this.frame++);
    v.addEventListener('error', () => {
      if (this._status === 'missing') return;
      this._status = 'error';
      this._error = v.error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED ? CODEC_ERROR : (v.error?.message || 'Не удалось открыть видео');
    });
    this.video = v;
    this.watchFrames();
    v.src = ctx.mediaUrl(params.path);
  }

  private watchFrames(): void {
    const v = this.video;
    if (typeof v.requestVideoFrameCallback !== 'function') return;
    const onFrame = () => {
      if (this.disposed) return;
      this.frame++;
      v.requestVideoFrameCallback(onFrame);
    };
    v.requestVideoFrameCallback(onFrame);
  }

  get status(): SourceStatus {
    return this._status;
  }
  get error(): string | undefined {
    return this._error;
  }
  get width(): number {
    return this.video.videoWidth || 1;
  }
  get height(): number {
    return this.video.videoHeight || 1;
  }
  get element(): HTMLVideoElement {
    return this.video;
  }
  get preview(): CanvasImageSource {
    return this.effects?.canvas ?? this.video;
  }

  /** Marks the source as missing (file not found on project open). */
  markMissing(): void {
    this._status = 'missing';
    this._error = 'Файл не найден';
  }

  setParams(p: VideoParams): void {
    if (this.params.effects !== p.effects) this.effectsDirty = true;
    this.params = p;
    this.video.loop = p.loop;
    this.video.muted = p.muted;
    this.video.playbackRate = p.rate;
  }

  tick(time: number): void {
    const nodes = this.params.effects ?? [];
    if (!nodes.some((node) => node.enabled)) {
      if (this.effects) {
        this.effects = undefined;
        this.uploaded = new WeakMap();
        this.effectsDirty = true;
      }
      return;
    }
    if (this._status !== 'ready' || this.video.readyState < 2 || time - this.lastEffectTime < 1 / 30) return;
    if (!this.effectsDirty && !this.wantPlaying && this.renderedFrame === this.frame) return;
    if (this.wantPlaying && Number.isFinite(this.lastEffectTime)) this.effectClock += Math.min(0.1, time - this.lastEffectTime);
    this.lastEffectTime = time;
    this.renderedFrame = this.frame;
    this.effectsDirty = false;
    if (!this.params.muted && !this.meter && nodes.some((node) => node.enabled && (node.type === 'particles' || node.type === 'pulse'))) {
      this.meter = new AudioMeter();
      this.meter.connect(this.video);
    }
    this.effects ??= new EffectFrame(this.ctx.document);
    this.effects.draw(this.video, this, nodes, { time: this.effectClock, bass: this.meter?.bass() ?? 0 });
    this.texture.changed();
  }

  update(gl: WebGL2RenderingContext, tex: WebGLTexture): boolean {
    if (this._status !== 'ready' || this.video.readyState < 2) return false;
    if (this.effects) return this.texture.upload(gl, tex, this.effects.canvas);
    // Without requestVideoFrameCallback, upload every frame while playing.
    if (typeof this.video.requestVideoFrameCallback !== 'function' && !this.video.paused) this.frame++;
    if (this.uploaded.get(tex) === this.frame) return false;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.video);
    this.uploaded.set(tex, this.frame);
    return true;
  }

  play(): void {
    this.wantPlaying = true;
    this.lastEffectTime = -Infinity;
    this.meter?.resume();
    if (this._status === 'ready') void this.video.play().catch(() => {});
  }

  pause(): void {
    this.wantPlaying = false;
    this.video.pause();
  }

  restart(): void {
    this.effectClock = 0;
    this.effects?.reset();
    this.effectsDirty = true;
    this.video.currentTime = 0;
    if (this.wantPlaying) this.play();
  }

  dispose(): void {
    this.disposed = true;
    this.meter?.dispose();
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
  }
}

export const videoFactory: SourceFactory<VideoParams> = {
  type: 'video',
  defaults: () => ({ path: '', loop: true, rate: 1, muted: true }),
  create: (id, params, ctx) => new VideoSource(id, params, ctx),
};
