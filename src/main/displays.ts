import { EventEmitter } from 'node:events';
import { screen, type Display } from 'electron';
import { chooseDisplay, type DisplayInfo } from './display-logic';
import type { DisplayState } from '../shared/ipc';

export const FAKE_DISPLAY = process.env.OPENTOUCH_FAKE_DISPLAY === '1';

function toInfo(d: Display, primaryId: number): DisplayInfo {
  return {
    id: d.id,
    label: d.label || `Display ${d.id}`,
    bounds: { ...d.bounds },
    scaleFactor: d.scaleFactor,
    primary: d.id === primaryId,
  };
}

/** Tracks connected displays and which one the projector output uses. Emits 'changed' with DisplayState. */
export class DisplayManager extends EventEmitter {
  private explicit: number | null = null;
  private hint: DisplayInfo | null = null;

  constructor() {
    super();
    const changed = () => this.emit('changed', this.state());
    screen.on('display-added', changed);
    screen.on('display-removed', changed);
    screen.on('display-metrics-changed', changed);
  }

  list(): DisplayInfo[] {
    const primary = screen.getPrimaryDisplay().id;
    return screen.getAllDisplays().map((d) => toInfo(d, primary));
  }

  current(): DisplayInfo | null {
    const all = this.list();
    if (this.explicit !== null) {
      const d = all.find((x) => x.id === this.explicit);
      if (d) return d;
    }
    const hint = this.hint ? { id: this.hint.id, width: this.hint.bounds.width, height: this.hint.bounds.height } : undefined;
    return chooseDisplay(all, hint, FAKE_DISPLAY);
  }

  select(id: number | null): DisplayState {
    this.explicit = id;
    const cur = this.current();
    if (cur) this.hint = cur;
    return this.state();
  }

  state(): DisplayState {
    return { current: this.current(), all: this.list() };
  }
}
