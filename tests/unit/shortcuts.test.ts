import { describe, expect, test } from 'vitest';
import { resolveShortcut } from '../../src/renderer/ui/shortcuts';

const k = (key: string, o: { meta?: boolean; shift?: boolean; input?: boolean } = {}) =>
  resolveShortcut({ key, metaKey: !!o.meta, shiftKey: !!o.shift, targetIsInput: !!o.input });

describe('shortcuts (spec §6)', () => {
  test.each([
    [k('d', { meta: true }), 'duplicate'],
    [k('Backspace'), 'delete'],
    [k('Delete'), 'delete'],
    [k('z', { meta: true }), 'undo'],
    [k('z', { meta: true, shift: true }), 'redo'],
    [k('Z', { meta: true, shift: true }), 'redo'],
    [k('s', { meta: true }), 'save'],
    [k('o', { meta: true }), 'open'],
    [k('Tab'), 'toggleMode'],
    [k('t'), 'toggleTest'],
    [k(' '), 'playPause'],
    [k('g'), 'toggleLevel'],
    [k('m'), 'drawMask'],
    [k('s'), 'toggleSnap'],
    [k('Escape'), 'cancel'],
  ])('%s', (got, want) => {
    expect(got).toBe(want);
  });

  test('arrows nudge, shift = big', () => {
    expect(k('ArrowRight')).toEqual({ nudge: { x: 1, y: 0 }, big: false });
    expect(k('ArrowUp', { shift: true })).toEqual({ nudge: { x: 0, y: -1 }, big: true });
  });

  test('in text inputs only ⌘ shortcuts work', () => {
    expect(k('Backspace', { input: true })).toBeNull();
    expect(k('t', { input: true })).toBeNull();
    expect(k('ArrowLeft', { input: true })).toBeNull();
    expect(k('z', { meta: true, input: true })).toBe('undo');
  });

  test('unknown keys', () => {
    expect(k('q')).toBeNull();
  });
});
