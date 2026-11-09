export type SourceStatus = 'loading' | 'ready' | 'error' | 'missing';

/** A producer of frames drawn into a texture — the extension point for future shader / sketch sources. */
export interface Source {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly status: SourceStatus;
  readonly error?: string;
  /** Compositions may still produce frames when individual media files fail. */
  readonly hasFrame?: boolean;
  /** Element the editor can draw with 2D canvas drawImage (Input tab preview). */
  readonly preview?: CanvasImageSource;
  /** Called once per output frame and per GL context; returns true when `tex` received new pixels. */
  update(gl: WebGL2RenderingContext, tex: WebGLTexture, timeSec: number): boolean;
  dispose(): void;
}

export interface SourceContext {
  /** Converts a stored media path into a URL the renderer can load. */
  mediaUrl(path: string): string;
  /** Document that owns media elements (the editor window). */
  document: Document;
}

export interface SourceFactory<P> {
  type: string;
  defaults(): P;
  create(id: string, params: P, ctx: SourceContext): Source;
}
