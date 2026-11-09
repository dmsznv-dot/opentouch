import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Vec2 } from '../../core/types';
import type { AppContext } from '../app-context';
import { useEditor, useProject } from './useStore';

/** Letterboxed canvas showing the projector space; pointer input drives the Output tool. */
export function Viewport({ ctx }: { ctx: AppContext }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const output = useProject(ctx.store, (p) => p.output);
  const drawing = useEditor(ctx.editor, (e) => e.draftMask !== null);
  const [box, setBox] = useState({ width: 0, height: 0 });

  useEffect(() => {
    ctx.engine.attachEditorCanvas(canvasRef.current);
    return () => ctx.engine.attachEditorCanvas(null);
  }, [ctx]);

  useLayoutEffect(() => {
    const stage = stageRef.current!;
    const fit = () => {
      const pad = 16;
      const w = Math.max(1, stage.clientWidth - pad * 2);
      const h = Math.max(1, stage.clientHeight - pad * 2);
      const aspect = output.width / output.height;
      const width = Math.floor(Math.min(w, h * aspect));
      const height = Math.floor(width / aspect);
      setBox({ width, height });
      ctx.tool.setViewportSize(width, height);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [ctx, output.width, output.height]);

  const norm = (e: React.PointerEvent): Vec2 => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  return (
    <div className="stage" ref={stageRef}>
      <canvas
        ref={canvasRef}
        data-testid="output-canvas"
        style={{ width: box.width, height: box.height, cursor: drawing ? 'crosshair' : 'default' }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          ctx.tool.down(norm(e), { shift: e.shiftKey });
        }}
        onPointerMove={(e) => ctx.tool.move(norm(e), { shift: e.shiftKey })}
        onPointerUp={(e) => ctx.tool.up(norm(e))}
        onPointerCancel={() => ctx.tool.cancel()}
      />
    </div>
  );
}
