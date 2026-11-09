import type { BrowserWindowConstructorOptions } from 'electron';
import type { OutputDef } from '../core/types';

export type DisplayInfo = {
  id: number;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  scaleFactor: number;
  primary: boolean;
};

/** id + size match → id match → first non-primary display → (fake ? primary : null). */
export function chooseDisplay(all: DisplayInfo[], hint: OutputDef['displayHint'], fake: boolean): DisplayInfo | null {
  if (hint) {
    const exact = all.find((d) => d.id === hint.id && d.bounds.width === hint.width && d.bounds.height === hint.height);
    if (exact) return exact;
    const byId = all.find((d) => d.id === hint.id && (!d.primary || fake));
    if (byId) return byId;
  }
  const secondary = all.find((d) => !d.primary);
  if (secondary) return secondary;
  return fake ? (all.find((d) => d.primary) ?? null) : null;
}

export function outputWindowOptions(d: DisplayInfo, fake: boolean): BrowserWindowConstructorOptions {
  const common: BrowserWindowConstructorOptions = {
    backgroundColor: '#000000',
    show: false,
    title: 'OpenTouch Output',
    autoHideMenuBar: true,
  };
  if (fake) return { ...common, frame: true, width: 960, height: 540, x: d.bounds.x + 40, y: d.bounds.y + 40 };
  return {
    ...common,
    frame: false,
    hasShadow: false,
    enableLargerThanScreen: true,
    x: d.bounds.x,
    y: d.bounds.y,
    width: d.bounds.width,
    height: d.bounds.height,
  };
}
