import { useMemo } from 'react';
import type { AppContext } from '../app-context';
import { actions } from '../actions';
import { SourceList } from './SourceList';
import { SurfaceList } from './SurfaceList';
import { TopBar } from './TopBar';
import { Viewport } from './Viewport';
import { useEditor } from './useStore';
import './app.css';

export function App({ ctx }: { ctx: AppContext }) {
  const act = useMemo(() => actions(ctx), [ctx]);
  const message = useEditor(ctx.editor, (e) => e.message);
  const tab = useEditor(ctx.editor, (e) => e.tab);

  return (
    <div
      className="app"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const paths = [...e.dataTransfer.files].map((f) => ctx.api.media.pathForFile(f)).filter(Boolean);
        act.addVideos(paths);
      }}
    >
      <TopBar ctx={ctx} act={act} onOpen={() => {}} onSave={() => {}} />
      <div className="main">
        <div className="side">
          <SurfaceList ctx={ctx} act={act} />
          <SourceList ctx={ctx} act={act} onRelink={() => {}} />
        </div>
        <div className="viewport">
          <div className="tabs">
            <button className={tab === 'output' ? 'on' : ''} onClick={() => ctx.editor.set({ tab: 'output' })}>
              Output
            </button>
            <button className={tab === 'input' ? 'on' : ''} onClick={() => ctx.editor.set({ tab: 'input' })}>
              Input
            </button>
          </div>
          <Viewport ctx={ctx} />
          {message && <div className="message">{message}</div>}
        </div>
        <div className="side right" />
      </div>
    </div>
  );
}
