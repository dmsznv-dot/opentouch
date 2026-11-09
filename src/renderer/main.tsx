import { createRoot } from 'react-dom/client';
import type { OpenTouchApi } from '../shared/ipc';
import { createAppContext } from './app-context';
import { App } from './ui/App';

const api = (window as unknown as { opentouch: OpenTouchApi }).opentouch;
const ctx = createAppContext(api);
createRoot(document.getElementById('root')!).render(<App ctx={ctx} />);
