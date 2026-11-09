import type { EffectNode } from './effects';

export type Vec2 = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };
/** Corners in order TL, TR, BR, BL. */
export type Quad = [Vec2, Vec2, Vec2, Vec2];

export interface OutputDef {
  type: 'projector';
  displayHint?: { id: number; width: number; height: number };
  width: number;
  height: number;
}

export interface Project {
  version: 1;
  output: OutputDef;
  sources: SourceDef[];
  /** Array order = z-order, last on top. */
  surfaces: Surface[];
}

export interface VideoParams {
  /** Relative to the project file when saved; absolute at runtime. */
  path: string;
  loop: boolean;
  rate: number;
  muted: boolean;
  effects?: EffectNode[];
}

export interface TestPatternParams {
  pattern: 'grid' | 'checker' | 'corners';
}

export interface SequenceClip {
  id: string;
  path: string;
  kind: 'video' | 'audio';
  start: number;
  inPoint: number;
  duration: number;
  muted: boolean;
}

export interface SequenceParams {
  clips: SequenceClip[];
  width: number;
  height: number;
  loop: boolean;
  effects?: EffectNode[];
}

export type SourceDef =
  | { id: string; name: string; type: 'video'; params: VideoParams }
  | { id: string; name: string; type: 'testpattern'; params: TestPatternParams }
  | { id: string; name: string; type: 'sequence'; params: SequenceParams };

export type GridMode = 'linear' | 'smooth' | 'bezier';

export interface GridWarp {
  /** Number of cells; points = (cols+1)*(rows+1). */
  cols: number;
  rows: number;
  /** Per-point offsets in the quad's local (u,v) space. */
  offsets: Vec2[];
  mode: GridMode;
  /** Bezier only: 4 handles per point in order [+u, -u, +v, -v], absolute (u,v) displacement from the point. */
  handles?: Vec2[];
}

export interface Mask {
  id: string;
  mode: 'include' | 'exclude';
  /** Closed polygon in output space 0..1. */
  points: Vec2[];
  /** Feather radius in output pixels. */
  feather: number;
}

export interface ClipFraming {
  /** Clockwise degrees around the center of the source crop. */
  rotation: number;
  zoom: number;
  /** Image displacement, in fractions of the surface frame. */
  x: number;
  y: number;
}

export interface Surface {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  sourceId: string | null;
  inputRect: Rect;
  cropToFill?: boolean;
  framing?: ClipFraming;
  corners: Quad;
  grid: GridWarp | null;
  masks: Mask[];
}

export type PointRef = {
  surfaceId: string;
  kind: 'corner' | 'grid' | 'handle' | 'mask';
  index: number;
  maskId?: string;
};
