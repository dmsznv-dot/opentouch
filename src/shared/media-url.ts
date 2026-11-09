const PREFIX = 'otmedia://file';

/** Absolute POSIX path → otmedia:// URL (each segment percent-encoded). */
export function mediaUrlFromPath(absPath: string): string {
  return PREFIX + absPath.split('/').map(encodeURIComponent).join('/');
}

export function pathFromMediaUrl(url: string): string {
  const rest = url.startsWith(PREFIX) ? url.slice(PREFIX.length) : new URL(url).pathname;
  return rest.split('?')[0].split('/').map(decodeURIComponent).join('/');
}
