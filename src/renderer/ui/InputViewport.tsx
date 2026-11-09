import { frameSampling, samplingOutline } from '../../core/geometry/framing';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { setInputRect } from '../../core/ops';
import type { Rect, Vec2 } from '../../core/types';
import type { AppContext } from '../app-context';
import { dragInputRect, hitInputRect, type InputHandle } from './interaction/input-tool';
import { useEditor, useProject, useSourceStatusVersion } from './useStore';

const HANDLE_PX = 8;
const FRAME_MS = 1000 / 30;

/** Shows the selected surface's source frame and lets the user crop it (inputRect). */
export function InputViewport({ ctx }: { ctx: AppContext }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const selectedId = useEditor(ctx.editor, (e) => e.selectedSurfaceId);
  const surface = useProject(ctx.store, (p) => p.surfaces.find((s) => s.id === selectedId) ?? null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const drag = useRef<{ h: InputHandle; start: Vec2; rect: Rect } | null>(null);
  useSourceStatusVersion(ctx.engine);
  const source = surface?.sourceId ? ctx.engine.getSource(surface.sourceId) : undefined;
  const aspect = source && source.width > 1 ? source.width / source.height : 16 / 9;

  useLayoutEffect(() => {
    const stage = stageRef.current!;
    const fit = () => {
      const w = Math.max(1, stage.clientWidth - 32);
      const h = Math.max(1, stage.clientHeight - 32);
      const width = Math.floor(Math.min(w, h * aspect));
      setBox({ width, height: Math.floor(width / aspect) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [aspect]);

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < FRAME_MS) return;
      last = t;
      const c = canvasRef.current;
      const s = ctx.store.get().surfaces.find((x) => x.id === ctx.editor.get().selectedSurfaceId);
      if (!c) return;
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.max(1, Math.round(c.clientWidth * dpr));
      c.height = Math.max(1, Math.round(c.clientHeight * dpr));
      const g = c.getContext('2d')!;
      g.fillStyle = '#000';
      g.fillRect(0, 0, c.width, c.height);
      if (!s) return;
      const src = s.sourceId ? ctx.engine.getSource(s.sourceId) : undefined;
      if (src?.preview && (src.hasFrame ?? (src.status === 'ready'))) g.drawImage(src.preview, 0, 0, c.width, c.height);
      const r = s.inputRect;
      const outline = samplingOutline(frameSampling(r, src ?? { width: 1, height: 1 }, s.corners,
        ctx.store.get().output, !!s.cropToFill, s.framing));
      const footprint = new Path2D();
      footprint.moveTo(outline[0].x * c.width, outline[0].y * c.height);
      for (const point of outline.slice(1)) footprint.lineTo(point.x * c.width, point.y * c.height);
      footprint.closePath();
      const dim = new Path2D(footprint);
      dim.rect(0, 0, c.width, c.height);
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fill(dim, 'evenodd');
      // If the transformed frame extends beyond the input selection, dim that overlap too.
      g.save();
      g.clip(footprint);
      const outsideSelection = new Path2D();
      outsideSelection.rect(0, 0, c.width, c.height);
      outsideSelection.rect(r.x * c.width, r.y * c.height, r.w * c.width, r.h * c.height);
      g.fill(outsideSelection, 'evenodd');
      g.restore();
      g.strokeStyle = '#3fa9f5';
      g.lineWidth = dpr;
      g.stroke(footprint);
      if (s.cropToFill) return;
      if (s.framing) {
        g.strokeStyle = '#bbb';
        g.setLineDash([4 * dpr, 4 * dpr]);
        g.strokeRect(r.x * c.width, r.y * c.height, r.w * c.width, r.h * c.height);
      }
      g.fillStyle = '#fff';
      const hs = HANDLE_PX * dpr;
      for (const fx of [0, 0.5, 1])
        for (const fy of [0, 0.5, 1]) {
          if (fx === 0.5 && fy === 0.5) continue;
          g.fillRect((r.x + r.w * fx) * c.width - hs / 2, (r.y + r.h * fy) * c.height - hs / 2, hs, hs);
        }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [ctx]);

  const norm = (e: React.PointerEvent): Vec2 => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  return (
    <div className="stage" ref={stageRef}>
      {!surface && <div className="empty">Select a surface to crop its source</div>}
      <canvas
        ref={canvasRef}
        data-testid="input-canvas"
        style={{ width: box.width, height: box.height, display: surface ? 'block' : 'none' }}
        onPointerDown={(e) => {
          if (!surface || surface.cropToFill) return;
          const at = norm(e);
          const h = hitInputRect(surface.inputRect, at, { x: HANDLE_PX / box.width, y: HANDLE_PX / box.height });
          if (!h) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          ctx.store.begin('Crop source');
          drag.current = { h, start: at, rect: surface.inputRect };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || !surface) return;
          const at = norm(e);
          const next = dragInputRect(d.rect, d.h, { x: at.x - d.start.x, y: at.y - d.start.y });
          ctx.store.dispatch('Crop source', (p) => setInputRect(p, surface.id, next));
        }}
        onPointerUp={() => {
          if (drag.current) ctx.store.end();
          drag.current = null;
        }}
      />
    </div>
  );
}
