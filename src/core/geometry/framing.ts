import type { ClipFraming, Quad, Rect, Vec2 } from '../types';

type Size = { width: number; height: number };

export const DEFAULT_FRAMING: Readonly<ClipFraming> = { rotation: 0, zoom: 1, x: 0, y: 0 };
export const MAX_ZOOM = 8;

function surfaceAspect(corners: Quad, output: Size): number {
  const edge = (a: number, b: number) => Math.hypot(
    (corners[a].x - corners[b].x) * output.width,
    (corners[a].y - corners[b].y) * output.height,
  );
  return (edge(0, 1) + edge(3, 2)) / (edge(0, 3) + edge(1, 2));
}

interface Sampling {
  center: Vec2;
  xAxis: Vec2;
  yAxis: Vec2;
}

/** Maps centered coordinates on the unwarped surface back into the source texture. */
export function frameSampling(rect: Rect, source: Size, corners: Quad, output: Size,
  cropToFill: boolean, framing: Readonly<ClipFraming> = DEFAULT_FRAMING): Sampling {
  const angle = framing.rotation * Math.PI / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  let width = rect.w * source.width;
  let height = rect.h * source.height;
  if (cropToFill && source.width > 1 && source.height > 1) {
    const aspect = surfaceAspect(corners, output);
    if (aspect > 0 && Number.isFinite(aspect)) {
      // Fit the entire rotated sampling rectangle inside the selected source region.
      const c = Math.abs(cos);
      const s = Math.abs(sin);
      height = Math.min(width / (c * aspect + s), height / (s * aspect + c));
      width = height * aspect;
    }
  }
  width /= framing.zoom;
  height /= framing.zoom;
  const xAxis = { x: width * cos / source.width, y: -width * sin / source.height };
  const yAxis = { x: height * sin / source.width, y: height * cos / source.height };
  return {
    xAxis,
    yAxis,
    center: {
      x: rect.x + rect.w / 2 - framing.x * xAxis.x - framing.y * yAxis.x,
      y: rect.y + rect.h / 2 - framing.x * xAxis.y - framing.y * yAxis.y,
    },
  };
}

export function samplingOutline({ center, xAxis, yAxis }: Sampling): Vec2[] {
  return [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].map(([x, y]) => ({
    x: center.x + x * xAxis.x + y * yAxis.x,
    y: center.y + x * xAxis.y + y * yAxis.y,
  }));
}
