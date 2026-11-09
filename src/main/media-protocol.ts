import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { Readable } from 'node:stream';

const TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
};

/** Serves a local file with HTTP range support (needed for <video> seeking and looping). */
export async function createMediaResponse(filePath: string, range: string | null): Promise<Response> {
  let size: number;
  try {
    const st = await stat(filePath);
    if (!st.isFile()) throw new Error('not a file');
    size = st.size;
  } catch {
    return new Response(null, { status: 404 });
  }
  const type = TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
  const body = (start: number, end: number) =>
    Readable.toWeb(createReadStream(filePath, { start, end })) as unknown as ReadableStream;

  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
  if (!m || (m[1] === '' && m[2] === '')) {
    return new Response(size ? body(0, size - 1) : null, {
      status: 200,
      headers: { 'content-type': type, 'content-length': String(size), 'accept-ranges': 'bytes' },
    });
  }
  let start: number;
  let end: number;
  if (m[1] === '') {
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start > end || start >= size) {
    return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
  }
  return new Response(body(start, end), {
    status: 206,
    headers: {
      'content-type': type,
      'content-length': String(end - start + 1),
      'content-range': `bytes ${start}-${end}/${size}`,
      'accept-ranges': 'bytes',
    },
  });
}
