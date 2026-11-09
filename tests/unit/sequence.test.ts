import { describe, expect, it } from 'vitest';
import { frameSampling } from '../../src/core/geometry/framing';
import { createProject, createSurface, deserializeProject, serializeProject } from '../../src/core/project';
import { activeClip, sequenceEnd } from '../../src/core/sequence';
import type { SequenceClip } from '../../src/core/types';
import { toProjectRelative } from '../../src/main/project-io';

const first: SequenceClip = { id: 'first', path: '/show/a.webm', kind: 'video', start: 0, inPoint: 0, duration: 2, muted: false };
const second: SequenceClip = { ...first, id: 'second', path: '/show/b.webm', start: 2, inPoint: 0.5 };
const sound: SequenceClip = { ...first, id: 'sound', path: '/show/kick.wav', kind: 'audio', duration: 5 };

describe('sequence clips', () => {
  it('switches exactly at a cut and keeps the audio track independent', () => {
    const clips = [first, second, sound];
    expect(activeClip(clips, 'video', 1.99)).toBe(first);
    expect(activeClip(clips, 'video', 2)).toBe(second);
    expect(activeClip(clips, 'video', 4)).toBeUndefined();
    expect(activeClip(clips, 'audio', 4)).toBe(sound);
    expect(sequenceEnd(clips)).toBe(5);
  });

  it('stores portable clip paths and validates clips and effects on reopen', () => {
    const p = createProject();
    p.sources.push({
      id: 'seq', type: 'sequence', name: 'Timeline',
      params: { width: 1080, height: 1920, loop: false, clips: [first, sound], effects: [{ id: 'fx', type: 'ascii', value: 0.25, enabled: true }] },
    });
    const relative = toProjectRelative(p, '/show/demo.otproj');
    expect(relative.sources[0].params).toMatchObject({ clips: [{ path: 'a.webm' }, { path: 'kick.wav' }] });
    expect(deserializeProject(serializeProject(relative))).toEqual(relative);
    expect(() => deserializeProject(serializeProject(p).replace('"duration": 2', '"duration": -2'))).toThrow(/clip/);
    expect(() => deserializeProject(serializeProject(p).replace('"ascii"', '"unknown"'))).toThrow(/effect node/);
  });
});

describe('center crop', () => {
  it('centers the crop inside a manually selected rect and preserves pixel aspect', () => {
    const s = createSurface('door', 'Door');
    const rect = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
    const sample = frameSampling(rect, { width: 1080, height: 1920 }, s.corners, { width: 600, height: 1000 }, true);
    expect(sample.xAxis.x).toBeCloseTo(0.8);
    expect(sample.yAxis.y).toBeCloseTo(0.75);
    expect(sample.center).toEqual({ x: 0.5, y: 0.5 });
    expect(sample.xAxis.x * 1080 / (sample.yAxis.y * 1920)).toBeCloseTo(0.6);
  });
});
