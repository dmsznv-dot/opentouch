import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const REPO = 'dmsznv-dot/opentouch';
const RELEASES_API = `https://api.github.com/repos/${REPO}/releases?per_page=30`;
const MAX_INSTALLER_BYTES = 512 * 1024 * 1024;

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface PreviewUpdate {
  version: string;
  filename: string;
  url: string;
  size: number;
  sha256: string;
}

export function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

export async function findPreviewUpdate(fetch: Fetch, installed: string, arch: string): Promise<PreviewUpdate | null> {
  const response = await fetch(RELEASES_API, {
    headers: { Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Could not check for preview updates (HTTP ${response.status}).`);
  const releases: unknown = await response.json();
  if (!Array.isArray(releases)) throw new Error('Invalid preview release list.');
  const filename = `OpenTouch-${arch}.dmg`;
  let newest: PreviewUpdate | null = null;
  for (const release of releases) {
    if (!release || release.draft !== false || release.prerelease !== true ||
        typeof release.tag_name !== 'string' || !/^build-\d+$/.test(release.tag_name) ||
        typeof release.name !== 'string' || !Array.isArray(release.assets)) continue;
    const version = /^OpenTouch preview (\d+\.\d+\.\d+)$/.exec(release.name)?.[1];
    if (!version || compareVersions(version, installed) <= 0 || (newest && compareVersions(version, newest.version) <= 0)) continue;
    const assets = release.assets as Array<{ name?: unknown; state?: unknown; size?: unknown; digest?: unknown } | null>;
    const asset = assets.find((file) => file?.name === filename && file.state === 'uploaded');
    if (!asset || typeof asset.size !== 'number' || !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > MAX_INSTALLER_BYTES ||
        typeof asset.digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(asset.digest)) continue;
    newest = {
      version, filename, size: asset.size, sha256: asset.digest.slice(7),
      url: `https://github.com/${REPO}/releases/download/${release.tag_name}/${filename}`,
    };
  }
  return newest;
}

export async function downloadPreview(fetch: Fetch, update: PreviewUpdate, temp: string): Promise<string> {
  const directory = await mkdtemp(join(temp, 'opentouch-update-'));
  const path = join(directory, update.filename);
  try {
    const response = await fetch(update.url, { signal: AbortSignal.timeout(300000) });
    if (!response.ok || !response.body) throw new Error(`Could not download the installer (HTTP ${response.status}).`);
    const hash = createHash('sha256');
    let bytes = 0;
    const verify = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        bytes += chunk.length;
        if (bytes > update.size) return done(new Error('The installer download is larger than expected.'));
        hash.update(chunk);
        done(null, chunk);
      },
    });
    const body = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
    await pipeline(body, verify, createWriteStream(path, { flags: 'wx', mode: 0o600 }));
    if (bytes !== update.size || hash.digest('hex') !== update.sha256) throw new Error('The installer failed its SHA-256 check.');
    return path;
  } catch (error) {
    await rm(directory, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}
