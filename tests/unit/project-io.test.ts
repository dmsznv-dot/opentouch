import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { createProject } from '../../src/core/project';
import { addSource } from '../../src/core/ops';
import { resolveMediaPath, toProjectRelative } from '../../src/main/project-io';

function tree() {
  const root = mkdtempSync(join(tmpdir(), 'ot-proj-'));
  const projDir = join(root, 'Мой проект');
  mkdirSync(join(projDir, 'media', 'clips'), { recursive: true });
  const projectFile = join(projDir, 'show.otproj');
  const clip = join(projDir, 'media', 'clips', 'фасад 1.mp4');
  writeFileSync(clip, 'x');
  return { root, projDir, projectFile, clip };
}

describe('project-io', () => {
  test('toProjectRelative converts absolute video paths', () => {
    const { projectFile, clip } = tree();
    const p = addSource(createProject(), { id: 's', name: 's', type: 'video', params: { path: clip, loop: true, rate: 1, muted: true } });
    const r = toProjectRelative(p, projectFile);
    expect((r.sources[0].params as { path: string }).path).toBe('media/clips/фасад 1.mp4');
    expect((p.sources[0].params as { path: string }).path).toBe(clip);
  });

  test('relative path resolves against the project folder', async () => {
    const { projectFile, clip } = tree();
    expect(await resolveMediaPath('media/clips/фасад 1.mp4', projectFile)).toBe(clip);
  });

  test('existing absolute path is kept', async () => {
    const { projectFile, clip } = tree();
    expect(await resolveMediaPath(clip, projectFile)).toBe(clip);
  });

  test('moved file is found by name inside the project folder', async () => {
    const { projectFile, clip } = tree();
    expect(await resolveMediaPath('old/place/фасад 1.mp4', projectFile)).toBe(clip);
    expect(await resolveMediaPath('/Volumes/Gone/фасад 1.mp4', projectFile)).toBe(clip);
  });

  test('missing file → null', async () => {
    const { projectFile } = tree();
    expect(await resolveMediaPath('media/nope.mp4', projectFile)).toBeNull();
  });
});
