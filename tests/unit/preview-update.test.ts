import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { downloadPreview, findPreviewUpdate } from '../../src/main/preview-update';

const contents = 'installer fixture';
const sha256 = createHash('sha256').update(contents).digest('hex');
const asset = { name: 'OpenTouch-arm64.dmg', state: 'uploaded', size: contents.length, digest: `sha256:${sha256}` };
const release = (n: number, assets = [asset]) => ({
  name: `OpenTouch preview 0.2.${n}`,
  tag_name: `build-${n}`,
  prerelease: true,
  draft: false,
  assets,
});

it('finds the newest eligible preview for the installed architecture', async () => {
  const fetch = vi.fn(async () => Response.json([
    { ...release(22), draft: true },
    release(21, [{ ...asset, name: 'OpenTouch-x64.dmg' }]),
    release(20, [{ ...asset, digest: '' }]),
    release(9), release(11),
  ]));
  expect(await findPreviewUpdate(fetch, '0.2.8', 'arm64')).toMatchObject({
    version: '0.2.11', filename: asset.name, sha256,
    url: 'https://github.com/dmsznv-dot/opentouch/releases/download/build-11/OpenTouch-arm64.dmg',
  });
  expect(await findPreviewUpdate(fetch, '0.2.11', 'arm64')).toBeNull();
});

it('keeps only a verified installer and removes a failed download', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'opentouch-preview-test-'));
  const update = {
    version: '0.2.11', filename: asset.name, sha256, size: contents.length,
    url: 'https://github.com/dmsznv-dot/opentouch/releases/download/build-11/OpenTouch-arm64.dmg',
  };
  try {
    const file = await downloadPreview(async () => new Response(contents), update, temp);
    expect(await readFile(file, 'utf8')).toBe(contents);
    await expect(downloadPreview(async () => new Response('x'.repeat(contents.length)), update, temp))
      .rejects.toThrow('SHA-256');
    expect(await readdir(temp)).toHaveLength(1);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
