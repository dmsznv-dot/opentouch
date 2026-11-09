import { useEffect, useMemo } from 'react';
import { resolveShortcut } from './shortcuts';
import type { AppContext } from '../app-context';
import { actions } from '../actions';
import { SourceList } from './SourceList';
import { SurfaceList } from './SurfaceList';
import { TopBar } from './TopBar';
import { Viewport } from './Viewport';
import { InputViewport } from './InputViewport';
import { Inspector } from './Inspector';
import { useEditor } from './useStore';
import './app.css';

export function App({ ctx }: { ctx: AppContext }) {
  const act = useMemo(() => actions(ctx), [ctx]);
  const message = useEditor(ctx.editor, (e) => e.message);
  const tab = useEditor(ctx.editor, (e) => e.tab);
  const onOpen = () => {};
  const onSave = () => {};

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const targetIsInput = !!t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      const a = resolveShortcut({ key: e.key, metaKey: e.metaKey || e.ctrlKey, shiftKey: e.shiftKey, targetIsInput });
      if (!a) return;
      e.preventDefault();
      if (typeof a === 'object') return ctx.tool.nudge(a.nudge, a.big);
      switch (a) {
        case 'duplicate': return act.duplicateSurface();
        case 'delete': return act.deleteSelection();
        case 'undo': return act.undo();
        case 'redo': return act.redo();
        case 'save': return onSave();
        case 'open': return onOpen();
        case 'toggleMode': return act.toggleMode();
        case 'toggleTest': return act.cycleTestPattern();
        case 'playPause': return act.togglePlay();
        case 'toggleLevel': return act.toggleLevel();
        case 'drawMask': return ctx.tool.startMask();
        case 'toggleSnap': return act.toggleSnap();
        case 'cancel': return ctx.tool.cancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

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
      <TopBar ctx={ctx} act={act} onOpen={onOpen} onSave={onSave} />
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
          {tab === 'output' ? <Viewport ctx={ctx} /> : <InputViewport ctx={ctx} />}
          {message && <div className="message">{message}</div>}
        </div>
        <div className="side right">
          <Inspector ctx={ctx} />
        </div>
      </div>
    </div>
  );
}
