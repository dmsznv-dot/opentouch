import { useMemo } from 'react';
import type { AppContext } from '../app-context';
import { actions } from '../actions';
import { SourceList } from './SourceList';
import { SurfaceList } from './SurfaceList';
import { TopBar } from './TopBar';
import { useEditor } from './useStore';
import './app.css';

export function App({ ctx }: { ctx: AppContext }) {
  const act = useMemo(() => actions(ctx), [ctx]);
  const message = useEditor(ctx.editor, (e) => e.message);

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
          <div className="tabs" />
          <div className="stage">{message && <div className="message">{message}</div>}</div>
        </div>
        <div className="side right" />
      </div>
    </div>
  );
}
