import type { SequenceClip } from './types';

export const clipEnd = (clip: SequenceClip): number => clip.start + clip.duration;

export function sequenceEnd(clips: SequenceClip[]): number {
  return clips.reduce((end, clip) => Math.max(end, clipEnd(clip)), 0);
}

/** A later clip covers an earlier one on the same track. */
export function activeClip(clips: SequenceClip[], kind: SequenceClip['kind'], time: number): SequenceClip | undefined {
  return clips.reduce<SequenceClip | undefined>((active, clip) =>
    clip.kind === kind && time >= clip.start && time < clipEnd(clip) && (!active || clip.start >= active.start) ? clip : active,
  undefined);
}
