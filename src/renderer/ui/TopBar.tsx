import type { AppContext } from '../app-context';
import type { Actions } from '../actions';
import { UpdateButton } from './UpdateButton';
import { useEditor } from './useStore';
import { useEffect, useState, useSyncExternalStore } from 'react';

const baseName = (p: string | null) => (p ? p.split(/[\\/]/).pop() : 'Untitled');

export function TopBar({ ctx, act, onOpen, onSave }: { ctx: AppContext; act: Actions; onOpen(): void; onSave(): void }) {
  const { editor, store, api } = ctx;
  const displays = useEditor(editor, (e) => e.displays);
  const mode = useEditor(editor, (e) => e.mode);
  const testPattern = useEditor(editor, (e) => e.testPattern);
  const playing = useEditor(editor, (e) => e.playing);
  const outputOpen = useEditor(editor, (e) => e.outputOpen);
  const outputWanted = useEditor(editor, (e) => e.outputWanted);
  const path = useEditor(editor, (e) => e.projectPath);
  const dirty = useSyncExternalStore((cb) => store.subscribe(cb), () => store.isDirty());
  const [autostart, setAutostart] = useState(false);
  useEffect(() => {
    void api.app.getSettings().then((s) => setAutostart(s.autostart));
  }, [api]);

  return (
    <div className="topbar">
      <button onClick={onOpen}>Open</button>
      <button onClick={onSave}>Save</button>
      <UpdateButton api={api} dirty={dirty} />
      <span>
        {baseName(path)}
        {dirty && (
          <span className="dirty" data-testid="dirty">
            {' '}
            •
          </span>
        )}
      </span>
      <div className="spacer" />
      <label>
        Projector{' '}
        <select
          data-testid="display-select"
          value={displays.current?.id ?? ''}
          onChange={async (e) => editor.set({ displays: await api.displays.select(e.target.value === '' ? null : Number(e.target.value)) })}
        >
          <option value="">{displays.current ? 'Auto' : 'Waiting for display…'}</option>
          {displays.all.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label} {d.bounds.width}×{d.bounds.height}
              {d.primary ? ' (main)' : ''}
            </option>
          ))}
        </select>
      </label>
      <button
        className={outputWanted ? 'on' : ''}
        title={outputOpen ? 'Output window is open' : 'Output window is closed'}
        onClick={() => editor.set({ outputWanted: !outputWanted })}
      >
        Output {outputOpen ? '●' : '○'}
      </button>
      <button data-testid="mode" className={mode === 'show' ? 'on' : ''} onClick={act.toggleMode} title="Tab">
        {mode === 'edit' ? 'Edit' : 'Show'}
      </button>
      <button className={testPattern !== 'none' ? 'on' : ''} onClick={act.cycleTestPattern} title="T">
        Test: {testPattern}
      </button>
      <label title="Open the last project in Show mode at login">
        <input
          type="checkbox"
          data-testid="autostart"
          checked={autostart}
          onChange={async (e) => setAutostart((await api.app.setAutostart(e.target.checked)).autostart)}
        />{' '}
        Autostart
      </label>
      <button onClick={act.togglePlay} title="Space">
        {playing ? 'Pause' : 'Play'}
      </button>
    </div>
  );
}
