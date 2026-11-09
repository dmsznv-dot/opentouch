/** Where the final frame goes — the projector in v1; later Syphon, recording, NDI. */
export interface Output {
  readonly id: string;
  readonly type: string;
  readonly width: number;
  readonly height: number;
  /** Canvas the renderer draws the final frame into. */
  readonly canvas: HTMLCanvasElement;
  /** Frame clock of the output (the projector's vsync). Returns an unsubscribe function. */
  onFrame(cb: (timeSec: number) => void): () => void;
  dispose(): void;
}
