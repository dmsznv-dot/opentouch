import { createRoot } from 'react-dom/client';
import type { OpenTouchApi } from '../shared/ipc';
import { createAppContext } from './app-context';
import { App } from './ui/App';
import { startAutosave } from './session';

const api = (window as unknown as { opentouch: OpenTouchApi }).opentouch;
const ctx = createAppContext(api);
startAutosave(ctx);
createRoot(document.getElementById('root')!).render(<App ctx={ctx} />);
