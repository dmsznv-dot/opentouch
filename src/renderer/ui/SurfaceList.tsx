import { useState } from 'react';
import { reorderSurface } from '../../core/ops';
import type { AppContext } from '../app-context';
import type { Actions } from '../actions';
import { useEditor, useProject } from './useStore';

export function SurfaceList({ ctx, act }: { ctx: AppContext; act: Actions }) {
  const surfaces = useProject(ctx.store, (p) => p.surfaces);
  const selected = useEditor(ctx.editor, (e) => e.selectedSurfaceId);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  // Topmost surface first.
  const rows = [...surfaces].reverse();

  return (
    <div className="section">
      <h3>
        Surfaces <span className="spacer" />
        <button className="icon" data-testid="add-surface" title="Add surface" onClick={act.addSurface}>
          ＋
        </button>
        <button className="icon" data-testid="duplicate-surface" title="Duplicate (⌘D)" onClick={act.duplicateSurface}>
          ⧉
        </button>
        <button className="icon" data-testid="delete-surface" title="Delete (⌫)" onClick={act.deleteSelection}>
          ✕
        </button>
      </h3>
      {rows.length === 0 && <div className="empty">No surfaces yet</div>}
      {rows.map((s) => (
        <div
          key={s.id}
          className={`row${s.id === selected ? ' selected' : ''}${s.id === overId ? ' dragover' : ''}`}
          draggable
          onDragStart={() => setDragId(s.id)}
          onDragOver={(e) => {
            if (!dragId) return;
            e.preventDefault();
            setOverId(s.id);
          }}
          onDragLeave={() => setOverId(null)}
          onDrop={() => {
            if (dragId && dragId !== s.id) {
              const to = surfaces.findIndex((x) => x.id === s.id);
              ctx.store.dispatch('Reorder surface', (p) => reorderSurface(p, dragId, to));
            }
            setDragId(null);
            setOverId(null);
          }}
          onClick={() => ctx.editor.set({ selectedSurfaceId: s.id, selectedSourceId: null, selectedPoints: [] })}
        >
          <button className="icon" data-testid={`visible-${s.id}`} title="Show / hide" onClick={(e) => (e.stopPropagation(), act.toggleVisible(s.id))}>
            {s.visible ? '◉' : '○'}
          </button>
          <span className="name">{s.name}</span>
        </div>
      ))}
    </div>
  );
}
