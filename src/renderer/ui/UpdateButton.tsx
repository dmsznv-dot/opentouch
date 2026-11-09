import { useEffect, useState } from 'react';
import type { OpenTouchApi, UpdateState } from '../../shared/ipc';

export function UpdateButton({ api, dirty }: { api: OpenTouchApi; dirty: boolean }) {
  const [state, setState] = useState<UpdateState>({ status: 'idle' });
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = state.status === 'checking' || state.status === 'downloading';

  useEffect(() => {
    if (!open) return;
    let active = true;
    const sync = () => void api.app.updateState().then((next) => { if (active) setState(next); }).catch(() => {});
    sync();
    const timer = setInterval(sync, 700);
    return () => { active = false; clearInterval(timer); };
  }, [api, open]);

  async function check() {
    setOpen(true);
    setError(null);
    setState({ status: 'checking' });
    try {
      setState(await api.app.checkUpdate());
    } catch {
      setError('Could not check for updates.');
      setState({ status: 'idle' });
    }
  }

  async function install() {
    try {
      setError(await api.app.installUpdate());
    } catch {
      setError('Could not install the update.');
    }
  }

  const description = state.status === 'current' ? 'You have the latest release.'
    : state.status === 'ready' ? `OpenTouch ${state.version} is ready to install.`
    : state.status === 'downloading' ? `Downloading OpenTouch ${state.version}…`
    : state.status === 'checking' ? 'Checking for updates…'
    : state.status === 'error' || state.status === 'unavailable' ? state.detail
    : 'Check for a new OpenTouch release.';
  return (
    <div className="update-control">
      <button onClick={() => { if (open) setOpen(false); else if (state.status === 'idle') void check(); else setOpen(true); }}
        aria-expanded={open}>Updates{state.status === 'ready' ? ' ●' : ''}</button>
      {open && (
        <div className="update-popover" role="status">
          <div>{error ?? description}</div>
          {state.status === 'ready'
            ? <button disabled={dirty} title={dirty ? 'Save the project first' : undefined} onClick={() => void install()}>Install and restart</button>
            : <button disabled={busy} onClick={() => void check()}>Check for updates</button>}
          {state.status === 'ready' && dirty && <small>Save the project to install.</small>}
        </div>
      )}
    </div>
  );
}
