import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { mediaUrlFromPath, pathFromMediaUrl } from '../../src/shared/media-url';
import { createMediaResponse } from '../../src/main/media-protocol';

describe('media url', () => {
  test('cyrillic, spaces and # survive a roundtrip', () => {
    const p = '/Users/дима/Видео/my clip #1.mp4';
    const url = mediaUrlFromPath(p);
    expect(url.startsWith('otmedia://file/')).toBe(true);
    expect(url).not.toMatch(/[ #]/);
    expect(pathFromMediaUrl(url)).toBe(p);
  });
});

describe('media protocol', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ot-media-'));
  const file = join(dir, 'клип 1.mp4');
  writeFileSync(file, Buffer.from('0123456789'));

  test('full response with length and type', async () => {
    const r = await createMediaResponse(file, null);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-length')).toBe('10');
    expect(r.headers.get('content-type')).toBe('video/mp4');
    expect(r.headers.get('accept-ranges')).toBe('bytes');
    expect(await r.text()).toBe('0123456789');
  });

  test('range request returns 206 with the slice', async () => {
    const r = await createMediaResponse(file, 'bytes=2-5');
    expect(r.status).toBe(206);
    expect(r.headers.get('content-range')).toBe('bytes 2-5/10');
    expect(await r.text()).toBe('2345');
  });

  test('open-ended range', async () => {
    const r = await createMediaResponse(file, 'bytes=7-');
    expect(r.status).toBe(206);
    expect(await r.text()).toBe('789');
  });

  test('missing file is 404', async () => {
    const r = await createMediaResponse(join(dir, 'nope.mp4'), null);
    expect(r.status).toBe(404);
  });
});
