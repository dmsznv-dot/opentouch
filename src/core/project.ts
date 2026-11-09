import type { Project, Surface } from './types';

export const CURRENT_VERSION = 1;

export class ProjectFormatError extends Error {
  constructor(
    readonly code: 'invalid' | 'too-new',
    message: string,
  ) {
    super(message);
    this.name = 'ProjectFormatError';
  }
}

export function createProject(width = 1920, height = 1080): Project {
  return { version: 1, output: { type: 'projector', width, height }, sources: [], surfaces: [] };
}

export function createSurface(id: string, name: string): Surface {
  return {
    id,
    name,
    visible: true,
    opacity: 1,
    sourceId: null,
    inputRect: { x: 0, y: 0, w: 1, h: 1 },
    corners: [
      { x: 0.25, y: 0.25 },
      { x: 0.75, y: 0.25 },
      { x: 0.75, y: 0.75 },
      { x: 0.25, y: 0.75 },
    ],
    grid: null,
    masks: [],
  };
}

export function serializeProject(p: Project): string {
  return JSON.stringify(p, null, 2);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function deserializeProject(json: string): Project {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new ProjectFormatError('invalid', 'Project file is not valid JSON');
  }
  if (!isObject(data) || typeof data.version !== 'number') {
    throw new ProjectFormatError('invalid', 'Project file has no version');
  }
  if (data.version > CURRENT_VERSION) {
    throw new ProjectFormatError('too-new', `Project version ${data.version} is newer than supported ${CURRENT_VERSION}`);
  }
  const out = data.output;
  if (
    !isObject(out) ||
    typeof out.width !== 'number' ||
    typeof out.height !== 'number' ||
    !Array.isArray(data.sources) ||
    !Array.isArray(data.surfaces)
  ) {
    throw new ProjectFormatError('invalid', 'Project file is missing output, sources or surfaces');
  }
  for (const s of data.surfaces) {
    if (!isObject(s) || typeof s.id !== 'string' || !Array.isArray(s.corners) || s.corners.length !== 4) {
      throw new ProjectFormatError('invalid', 'Project file has a malformed surface');
    }
  }
  return data as unknown as Project;
}
