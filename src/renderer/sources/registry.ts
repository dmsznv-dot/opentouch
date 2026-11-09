import { sequenceFactory } from './sequence';
import { testPatternFactory } from './testpattern';
import type { SourceFactory } from './types';
import { videoFactory } from './video';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const factories = new Map<string, SourceFactory<any>>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerSource(f: SourceFactory<any>): void {
  factories.set(f.type, f);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getFactory(type: string): SourceFactory<any> {
  const f = factories.get(type);
  if (!f) throw new Error(`Unknown source type: ${type}`);
  return f;
}

registerSource(videoFactory);
registerSource(testPatternFactory);
registerSource(sequenceFactory);
