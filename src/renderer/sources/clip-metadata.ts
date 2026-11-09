import type { SequenceClip } from '../../core/types';

interface ClipMetadata {
  duration: number;
  width: number;
  height: number;
}

export function readClipMetadata(url: string, kind: SequenceClip['kind']): Promise<ClipMetadata> {
  return new Promise((resolve, reject) => {
    const media = document.createElement(kind);
    const finish = (duration?: number) => {
      const width = media instanceof HTMLVideoElement ? media.videoWidth : 0;
      const height = media instanceof HTMLVideoElement ? media.videoHeight : 0;
      clearTimeout(timeout);
      media.onloadedmetadata = media.onerror = null;
      media.removeAttribute('src');
      media.load();
      if (duration && Number.isFinite(duration) && (kind === 'audio' || width > 0)) resolve({ duration, width, height });
      else reject(new Error('Could not read media duration'));
    };
    const timeout = setTimeout(() => finish(), 8000);
    media.preload = 'metadata';
    media.onloadedmetadata = () => finish(media.duration);
    media.onerror = () => finish();
    media.src = url;
  });
}
