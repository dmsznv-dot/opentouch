import type { Output } from './types';

const WINDOW_NAME = 'opentouch-output';

/** Fullscreen projector window opened with same-origin window.open, rendered from the editor's JS context. */
export class ProjectorOutput implements Output {
  readonly id = 'projector';
  readonly type = 'projector';
  readonly canvas: HTMLCanvasElement;
  private frameCbs = new Set<(t: number) => void>();
  private closedCbs = new Set<() => void>();
  private raf = 0;
  private poll: ReturnType<typeof setInterval>;
  private disposed = false;

  constructor(private readonly win: Window) {
    const doc = win.document;
    doc.documentElement.style.background = '#000';
    doc.body.style.cssText = 'margin:0;background:#000;cursor:none;overflow:hidden';
    this.canvas = doc.createElement('canvas');
    this.canvas.style.cssText = 'display:block;width:100vw;height:100vh';
    doc.body.appendChild(this.canvas);
    this.resize();
    win.addEventListener('resize', () => this.resize());
    const tick = (t: number) => {
      if (this.disposed || win.closed) return;
      for (const cb of this.frameCbs) cb(t / 1000);
      this.raf = win.requestAnimationFrame(tick);
    };
    this.raf = win.requestAnimationFrame(tick);
    this.poll = setInterval(() => {
      if (win.closed) this.handleClosed();
    }, 500);
  }

  private resize(): void {
    const dpr = this.win.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(this.win.innerWidth * dpr));
    this.canvas.height = Math.max(1, Math.round(this.win.innerHeight * dpr));
  }

  get width(): number {
    return this.canvas.width;
  }
  get height(): number {
    return this.canvas.height;
  }
  get closed(): boolean {
    return this.disposed || this.win.closed;
  }

  onFrame(cb: (timeSec: number) => void): () => void {
    this.frameCbs.add(cb);
    return () => this.frameCbs.delete(cb);
  }

  onClosed(cb: () => void): () => void {
    this.closedCbs.add(cb);
    return () => this.closedCbs.delete(cb);
  }

  private handleClosed(): void {
    if (this.disposed) return;
    this.disposed = true;
    clearInterval(this.poll);
    for (const cb of this.closedCbs) cb();
  }

  dispose(): void {
    if (!this.win.closed) {
      this.win.cancelAnimationFrame(this.raf);
      this.win.close();
    }
    this.handleClosed();
  }
}

/** Opens (or reuses) the projector window. Resolves null if the window could not be opened (e.g. no display). */
export function openProjectorOutput(url = 'output.html'): Promise<ProjectorOutput | null> {
  const win = window.open(url, WINDOW_NAME);
  if (!win) return Promise.resolve(null);
  return new Promise((resolve) => {
    const ready = () => resolve(new ProjectorOutput(win));
    if (win.document.readyState === 'complete' && win.location.href !== 'about:blank') ready();
    else win.addEventListener('load', ready, { once: true });
  });
}
