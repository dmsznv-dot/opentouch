import { readdir, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { Project, SourceDef } from '../core/types';

const SEARCH_DEPTH = 3;

async function isFile(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

/** Absolute video paths → paths relative to the project file (POSIX separators). */
export function toProjectRelative(p: Project, projectFile: string): Project {
  const dir = dirname(projectFile);
  const toRelative = (path: string) => isAbsolute(path) ? relative(dir, path).split(sep).join('/') : path;
  return {
    ...p,
    sources: p.sources.map((s): SourceDef => {
      if (s.type === 'video') return { ...s, params: { ...s.params, path: toRelative(s.params.path) } };
      if (s.type === 'sequence') return { ...s, params: { ...s.params, clips: s.params.clips.map((c) => ({ ...c, path: toRelative(c.path) })) } };
      return s;
    }),
  };
}

async function findByName(dir: string, name: string, depth: number): Promise<string | null> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const e of entries) if (e.isFile() && e.name === name) return join(dir, e.name);
  if (depth <= 0) return null;
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.')) continue;
    const hit = await findByName(join(dir, e.name), name, depth - 1);
    if (hit) return hit;
  }
  return null;
}

/** Existing absolute path → relative to project → same file name anywhere in the project folder (depth 3) → null. */
export async function resolveMediaPath(stored: string, projectFile: string | null): Promise<string | null> {
  if (isAbsolute(stored) && (await isFile(stored))) return stored;
  if (!projectFile) return null;
  const dir = dirname(projectFile);
  if (!isAbsolute(stored)) {
    const rel = resolve(dir, stored);
    if (await isFile(rel)) return rel;
  }
  return findByName(dir, basename(stored), SEARCH_DEPTH);
}
