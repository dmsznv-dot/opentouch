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

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isVec = (v: unknown): boolean => isObject(v) && isNum(v.x) && isNum(v.y);
const isVecArray = (v: unknown, len?: number): boolean => Array.isArray(v) && v.every(isVec) && (len === undefined || v.length === len);
const SOURCE_TYPES = new Set(['video', 'testpattern']);
const GRID_MODES = new Set(['linear', 'smooth', 'bezier']);

function invalid(what: string): never {
  throw new ProjectFormatError('invalid', `Project file has a malformed ${what}`);
}

/** Checks a surface and fills in optional fields so older or hand-edited files load safely. */
function normalizeSurface(s: unknown): Surface {
  if (!isObject(s) || typeof s.id !== 'string' || !isVecArray(s.corners, 4)) invalid('surface');
  const masks = s.masks ?? [];
  if (!Array.isArray(masks)) invalid('mask list');
  for (const m of masks)
    if (!isObject(m) || typeof m.id !== 'string' || (m.mode !== 'include' && m.mode !== 'exclude') || !isVecArray(m.points) || !isNum(m.feather)) invalid('mask');
  const g = s.grid ?? null;
  if (g !== null) {
    if (!isObject(g) || !Number.isInteger(g.cols) || !Number.isInteger(g.rows) || (g.cols as number) < 1 || (g.rows as number) < 1 || !GRID_MODES.has(g.mode as string)) invalid('grid');
    const points = ((g.cols as number) + 1) * ((g.rows as number) + 1);
    if (!isVecArray(g.offsets, points)) invalid('grid');
    if (g.handles !== undefined && !isVecArray(g.handles, points * 4)) invalid('grid');
  }
  const r = s.inputRect;
  const inputRect = isObject(r) && isNum(r.x) && isNum(r.y) && isNum(r.w) && isNum(r.h) && r.w > 0 && r.h > 0 ? r : { x: 0, y: 0, w: 1, h: 1 };
  return {
    ...(s as unknown as Surface),
    name: typeof s.name === 'string' ? s.name : s.id,
    visible: typeof s.visible === 'boolean' ? s.visible : true,
    opacity: isNum(s.opacity) ? Math.min(Math.max(s.opacity, 0), 1) : 1,
    sourceId: typeof s.sourceId === 'string' ? s.sourceId : null,
    inputRect: inputRect as Surface['inputRect'],
    grid: g as Surface['grid'],
    masks: masks as Surface['masks'],
  };
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
  if (!isObject(out) || !isNum(out.width) || !isNum(out.height) || !Array.isArray(data.sources) || !Array.isArray(data.surfaces)) {
    throw new ProjectFormatError('invalid', 'Project file is missing output, sources or surfaces');
  }
  for (const s of data.sources)
    if (!isObject(s) || typeof s.id !== 'string' || !SOURCE_TYPES.has(s.type as string) || !isObject(s.params)) invalid('source');
  return { ...(data as unknown as Project), output: { ...(out as unknown as Project['output']), type: 'projector' }, surfaces: data.surfaces.map(normalizeSurface) };
}
