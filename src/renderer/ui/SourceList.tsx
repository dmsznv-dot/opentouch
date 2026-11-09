import type { AppContext } from '../app-context';
import type { Actions } from '../actions';
import { useEditor, useProject, useSourceStatusVersion } from './useStore';

export function SourceList({ ctx, act, onRelink }: { ctx: AppContext; act: Actions; onRelink(id: string): void }) {
  const sources = useProject(ctx.store, (p) => p.sources);
  const selected = useEditor(ctx.editor, (e) => e.selectedSourceId);
  useSourceStatusVersion(ctx.engine);

  return (
    <div className="section" data-testid="source-list">
      <h3>
        Sources <span className="spacer" />
        <button className="icon" data-testid="add-video" title="Add video" onClick={() => void act.pickVideos()}>
          ＋ Video
        </button>
        <button className="icon" data-testid="add-testpattern" title="Add test pattern" onClick={act.addTestPattern}>
          ＋ Test
        </button>
      </h3>
      {sources.length === 0 && <div className="empty">Drop video files here</div>}
      {sources.map((s) => {
        const st = ctx.engine.sourceStatus(s.id);
        return (
          <div
            key={s.id}
            className={`row${s.id === selected ? ' selected' : ''}`}
            title={st?.error ?? s.name}
            onClick={() => ctx.editor.set({ selectedSourceId: s.id, selectedSurfaceId: null, selectedPoints: [] })}
          >
            <span className={`status ${st?.status ?? 'loading'}`} />
            <span className="name">{s.name}</span>
            {st?.status === 'missing' && (
              <button className="icon" onClick={(e) => (e.stopPropagation(), onRelink(s.id))}>
                Relink
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
