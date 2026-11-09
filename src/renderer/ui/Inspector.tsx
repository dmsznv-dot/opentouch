import { DEFAULT_FRAMING, MAX_ZOOM } from '../../core/geometry/framing';
import * as ops from '../../core/ops';
import type { ClipFraming, GridMode, Mask, SourceDef, Surface, VideoParams } from '../../core/types';
import type { AppContext } from '../app-context';
import { EffectChain } from './EffectChain';
import { useEditor, useProject, useSourceStatusVersion } from './useStore';

function Slider({ ctx, label, value, min, max, step, onChange, testId, valueLabel }: {
  ctx: AppContext; label: string; value: number; min: number; max: number; step: number; onChange(v: number): void; testId?: string; valueLabel?: string;
}) {
  return (
    <label className="field">
      <span>{label}{valueLabel && <small className="slider-value">{valueLabel}</small>}</span>
      <input
        type="range"
        data-testid={testId}
        min={min}
        max={max}
        step={step}
        value={value}
        // One undo step per gesture.
        onPointerDown={() => ctx.store.begin(label)}
        onPointerUp={() => ctx.store.end()}
        onPointerCancel={() => ctx.store.end()}
        onKeyUp={() => ctx.store.end()}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function SurfaceInspector({ ctx, s }: { ctx: AppContext; s: Surface }) {
  const sources = useProject(ctx.store, (p) => p.sources);
  const set = (label: string, patch: Partial<Omit<Surface, 'id'>>) => ctx.store.dispatch(label, (p) => ops.updateSurface(p, s.id, patch));
  const setMask = (m: Mask, patch: Partial<Omit<Mask, 'id'>>) => ctx.store.dispatch('Edit mask', (p) => ops.updateMask(p, s.id, m.id, patch));
  const framing = s.framing ?? DEFAULT_FRAMING;
  const frame = (label: string, patch: Partial<ClipFraming>) =>
    set(label, { framing: { ...framing, ...patch } });
  const turn = (delta: number) =>
    frame('Rotate clip', { rotation: ((framing.rotation + delta + 540) % 360) - 180 });
  const cols = s.grid?.cols ?? 0;
  const rows = s.grid?.rows ?? 0;
  const setGrid = (c: number, r: number) => ctx.store.dispatch('Grid size', (p) => ops.setGridSize(p, s.id, c, r));

  return (
    <div data-testid="surface-inspector">
      <label className="field">
        <span>Name</span>
        <input value={s.name} onChange={(e) => set('Rename', { name: e.target.value })} />
      </label>
      <label className="field">
        <span>Source</span>
        <select data-testid="surface-source" value={s.sourceId ?? ''} onChange={(e) => set('Assign source', { sourceId: e.target.value || null })}>
          <option value="">— none (black) —</option>
          {sources.map((src) => (
            <option key={src.id} value={src.id}>
              {src.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field" title="Center the crop and preserve the source proportions">
        <span>Crop to fill</span>
        <input type="checkbox" checked={s.cropToFill ?? false} onChange={(e) => set('Crop to fill', { cropToFill: e.target.checked })} />
      </label>
      {s.sourceId && (
        <fieldset className="clip-framing">
          <legend>Clip framing</legend>
          <div className="clip-framing-actions">
            <button type="button" title="Rotate left 90°" onClick={() => turn(-90)}>↶ 90°</button>
            <button type="button" title="Rotate right 90°" onClick={() => turn(90)}>↷ 90°</button>
            <button type="button" onClick={() => set('Reset clip framing', { framing: undefined })}>Reset framing</button>
          </div>
          <Slider ctx={ctx} label="Rotate" valueLabel={`${framing.rotation}°`} min={-180} max={180} step={1}
            value={framing.rotation} onChange={(rotation) => frame('Rotate', { rotation })} />
          <Slider ctx={ctx} label="Zoom" valueLabel={`${Math.round(framing.zoom * 100)}%`} min={100} max={MAX_ZOOM * 100} step={1}
            value={Math.round(framing.zoom * 100)} onChange={(zoom) => frame('Zoom', { zoom: zoom / 100 })} />
          {(['x', 'y'] as const).map((axis) => (
            <Slider key={axis} ctx={ctx} label={`Shift ${axis.toUpperCase()}`} valueLabel={`${Math.round(framing[axis] * 100)}%`}
              min={-100} max={100} step={1} value={Math.round(framing[axis] * 100)}
              onChange={(offset) => frame(`Shift ${axis.toUpperCase()}`, { [axis]: offset / 100 })} />
          ))}
        </fieldset>
      )}
      <Slider ctx={ctx} label="Opacity" testId="opacity" value={Math.round(s.opacity * 100)} min={0} max={100} step={1} onChange={(v) => set('Opacity', { opacity: v / 100 })} />
      <label className="field">
        <span>Grid</span>
        <span>
          <select data-testid="grid-enabled" value={s.grid ? 'on' : 'off'} onChange={(e) => (e.target.value === 'on' ? setGrid(4, 4) : setGrid(0, 0))}>
            <option value="off">Off</option>
            <option value="on">On</option>
          </select>
          {s.grid && (
            <>
              {' '}
              <input type="number" min={1} max={32} value={cols} style={{ width: 44 }} onChange={(e) => setGrid(Math.min(32, Math.max(1, Number(e.target.value))), rows)} />
              ×
              <input type="number" min={1} max={32} value={rows} style={{ width: 44 }} onChange={(e) => setGrid(cols, Math.min(32, Math.max(1, Number(e.target.value))))} />
            </>
          )}
        </span>
      </label>
      {s.grid && (
        <label className="field">
          <span>Curve</span>
          <select value={s.grid.mode} onChange={(e) => ctx.store.dispatch('Grid mode', (p) => ops.setGridMode(p, s.id, e.target.value as GridMode))}>
            <option value="linear">Linear</option>
            <option value="smooth">Smooth</option>
            <option value="bezier">Bezier handles</option>
          </select>
        </label>
      )}
      <h3 style={{ marginTop: 12 }}>Masks (M to draw)</h3>
      {s.masks.length === 0 && <div className="empty">No masks</div>}
      {s.masks.map((m, i) => (
        <div key={m.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 4 }}>
          <div className="field">
            <span>Mask {i + 1}</span>
            <span>
              <select value={m.mode} onChange={(e) => setMask(m, { mode: e.target.value as Mask['mode'] })}>
                <option value="include">Include</option>
                <option value="exclude">Exclude</option>
              </select>{' '}
              <button className="icon" title="Delete mask" onClick={() => ctx.store.dispatch('Delete mask', (p) => ops.removeMask(p, s.id, m.id))}>
                ✕
              </button>
            </span>
          </div>
          <Slider ctx={ctx} label="Feather px" value={m.feather} min={0} max={200} step={1} onChange={(v) => setMask(m, { feather: v })} />
        </div>
      ))}
    </div>
  );
}

function SourceInspector({ ctx, src }: { ctx: AppContext; src: SourceDef }) {
  useSourceStatusVersion(ctx.engine);
  const st = ctx.engine.sourceStatus(src.id);
  const setParams = (patch: Partial<VideoParams>) => ctx.store.dispatch('Source settings', (p) => ops.updateSourceParams(p, src.id, patch));
  return (
    <div data-testid="source-inspector">
      <label className="field">
        <span>Name</span>
        <input value={src.name} onChange={(e) => ctx.store.dispatch('Rename source', (p) => ops.renameSource(p, src.id, e.target.value))} />
      </label>
      {st?.error && <div className="empty" style={{ color: 'var(--bad)' }}>{st.error}</div>}
      {src.type === 'video' && (
        <>
          <div className="field">
            <span>File</span>
            <span style={{ wordBreak: 'break-all', color: 'var(--dim)' }}>{src.params.path}</span>
          </div>
          <label className="field">
            <span>Loop</span>
            <input type="checkbox" checked={src.params.loop} onChange={(e) => setParams({ loop: e.target.checked })} />
          </label>
          <Slider ctx={ctx} label="Speed" value={src.params.rate} min={0.1} max={4} step={0.05} onChange={(v) => setParams({ rate: v })} />
          <label className="field">
            <span>Sound</span>
            <input type="checkbox" checked={!src.params.muted} onChange={(e) => setParams({ muted: !e.target.checked })} />
          </label>
        </>
      )}
      {src.type === 'sequence' && (
        <div className="field">
          <span>Frame size</span>
          <div>
            {(['width', 'height'] as const).map((axis) => (
              <input key={`${axis}:${src.params[axis]}`} aria-label={axis} type="number" min={2} max={4096} defaultValue={src.params[axis]}
                style={{ width: 72 }} onBlur={(event) => {
                  const value = event.target.valueAsNumber;
                  if (Number.isInteger(value) && value >= 2 && value <= 4096 && value !== src.params[axis]) {
                    ctx.store.dispatch('Sequence frame size', (p) => ops.updateSourceParams(p, src.id, { [axis]: value }));
                  } else event.target.value = String(src.params[axis]);
                }} />
            ))}
          </div>
        </div>
      )}
      {src.type !== 'testpattern' && (
        <EffectChain key={src.id} nodes={src.params.effects ?? []} store={ctx.store}
          onChange={(effects) => ctx.store.dispatch('Edit effect chain', (p) => ops.updateSourceParams(p, src.id, { effects }))} />
      )}
      {src.type === 'testpattern' && (
        <label className="field">
          <span>Pattern</span>
          <select value={src.params.pattern} onChange={(e) => ctx.store.dispatch('Pattern', (p) => ops.updateSourceParams(p, src.id, { pattern: e.target.value }))}>
            <option value="grid">Grid</option>
            <option value="checker">Checker</option>
            <option value="corners">Corners</option>
          </select>
        </label>
      )}
    </div>
  );
}

export function Inspector({ ctx }: { ctx: AppContext }) {
  const sid = useEditor(ctx.editor, (e) => e.selectedSurfaceId);
  const srcId = useEditor(ctx.editor, (e) => e.selectedSourceId);
  const surface = useProject(ctx.store, (p) => p.surfaces.find((s) => s.id === sid) ?? null);
  const source = useProject(ctx.store, (p) => p.sources.find((s) => s.id === srcId) ?? null);
  if (surface) return <SurfaceInspector ctx={ctx} s={surface} />;
  if (source) return <SourceInspector ctx={ctx} src={source} />;
  return <div className="empty">Select a surface or a source</div>;
}
