import { describe, expect, test } from 'vitest';
import {
  createProject,
  createSurface,
  deserializeProject,
  ProjectFormatError,
  serializeProject,
} from '../../src/core/project';

function sample() {
  const p = createProject();
  p.sources.push({ id: 'src_1', name: 'clip', type: 'video', params: { path: 'media/a.mp4', loop: true, rate: 1, muted: true } });
  p.surfaces.push({ ...createSurface('srf_1', 'Surface 1'), sourceId: 'src_1' });
  return p;
}

function errorCode(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    if (e instanceof ProjectFormatError) return e.code;
    throw e;
  }
  return undefined;
}

describe('project', () => {
  test('roundtrip', () => {
    const p = sample();
    expect(deserializeProject(serializeProject(p))).toEqual(p);
  });

  test('rejects newer version', () => {
    const json = JSON.stringify({ ...sample(), version: 2 });
    expect(errorCode(() => deserializeProject(json))).toBe('too-new');
  });

  test('rejects garbage', () => {
    expect(errorCode(() => deserializeProject('{'))).toBe('invalid');
    expect(errorCode(() => deserializeProject('{"version":1}'))).toBe('invalid');
  });

  test('createSurface defaults', () => {
    const s = createSurface('srf_x', 'X');
    expect(s).toEqual({
      id: 'srf_x',
      name: 'X',
      visible: true,
      opacity: 1,
      sourceId: null,
      inputRect: { x: 0, y: 0, w: 1, h: 1 },
      corners: [
        { x: 0.25, y: 0.25 },
        { x: 0.75, y: 0.25 },
        { x: 0.75, y: 0.75 },
        { x: 0.25, y: 0.75 },
      ],
      grid: null,
      masks: [],
    });
  });

  test('createProject defaults', () => {
    const p = createProject();
    expect(p.version).toBe(1);
    expect(p.output).toEqual({ type: 'projector', width: 1920, height: 1080 });
    expect(p.sources).toEqual([]);
    expect(p.surfaces).toEqual([]);
  });
});
