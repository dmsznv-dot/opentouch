import { createRoot } from 'react-dom/client';
import type { OpenTouchApi } from '../shared/ipc';
import { createAppContext } from './app-context';
import { App } from './ui/App';
import { connectQuitFlow, restoreOnStartup, startAutosave } from './session';

const api = (window as unknown as { opentouch: OpenTouchApi }).opentouch;
const ctx = createAppContext(api);
startAutosave(ctx);
connectQuitFlow(ctx);
void restoreOnStartup(ctx);
Object.assign(window, { __ctx: ctx });
createRoot(document.getElementById('root')!).render(<App ctx={ctx} />);
