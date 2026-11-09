import { access, rename, rm, writeFile } from 'node:fs/promises';

export function autosaveName(projectFile: string, n: number): string {
  return `${projectFile}.autosave.${n}`;
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** Rotates <file>.autosave.1..keep (1 = newest) and writes `json` as .1. */
export async function writeAutosave(projectFile: string, json: string, keep = 5): Promise<void> {
  await rm(autosaveName(projectFile, keep), { force: true });
  for (let n = keep - 1; n >= 1; n--) {
    const from = autosaveName(projectFile, n);
    if (await exists(from)) await rename(from, autosaveName(projectFile, n + 1));
  }
  const tmp = `${autosaveName(projectFile, 1)}.tmp`;
  await writeFile(tmp, json, 'utf8');
  await rename(tmp, autosaveName(projectFile, 1));
}

export async function latestAutosave(projectFile: string): Promise<string | null> {
  const p = autosaveName(projectFile, 1);
  return (await exists(p)) ? p : null;
}
