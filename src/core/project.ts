import { EFFECTS } from './effects';
import { DEFAULT_FRAMING, MAX_ZOOM } from './geometry/framing';
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
const SOURCE_TYPES = new Set(['video', 'testpattern', 'sequence']);
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
  const { framing, ...surface } = s;
  const bounded = (value: unknown, fallback: number, min: number, max: number) =>
    isNum(value) ? Math.min(max, Math.max(min, value)) : fallback;
  return {
    ...(surface as unknown as Surface),
    ...(isObject(framing) ? { framing: {
      rotation: bounded(framing.rotation, DEFAULT_FRAMING.rotation, -180, 180),
      zoom: bounded(framing.zoom, DEFAULT_FRAMING.zoom, 1, MAX_ZOOM),
      x: bounded(framing.x, DEFAULT_FRAMING.x, -1, 1),
      y: bounded(framing.y, DEFAULT_FRAMING.y, -1, 1),
    } } : {}),
    name: typeof s.name === 'string' ? s.name : s.id,
    visible: typeof s.visible === 'boolean' ? s.visible : true,
    opacity: isNum(s.opacity) ? Math.min(Math.max(s.opacity, 0), 1) : 1,
    sourceId: typeof s.sourceId === 'string' ? s.sourceId : null,
    inputRect: inputRect as Surface['inputRect'],
    ...(s.cropToFill !== undefined ? { cropToFill: s.cropToFill === true } : {}),
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
  for (const s of data.sources) {
    if (!isObject(s) || typeof s.id !== 'string' || !SOURCE_TYPES.has(s.type as string) || !isObject(s.params)) invalid('source');
    const p = s.params;
    if (s.type === 'sequence') {
      if (!Array.isArray(p.clips) || !Number.isInteger(p.width) || !Number.isInteger(p.height) ||
        (p.width as number) < 2 || (p.width as number) > 4096 ||
        (p.height as number) < 2 || (p.height as number) > 4096 || typeof p.loop !== 'boolean') invalid('sequence');
      const ids = new Set<string>();
      for (const c of p.clips) {
        if (!isObject(c) || typeof c.id !== 'string' || ids.has(c.id) || typeof c.path !== 'string' || !c.path ||
          (c.kind !== 'video' && c.kind !== 'audio') || typeof c.muted !== 'boolean' ||
          !isNum(c.start) || c.start < 0 || !isNum(c.inPoint) || c.inPoint < 0 || !isNum(c.duration) || c.duration <= 0 ||
          !Number.isFinite(c.start + c.duration) || !Number.isFinite(c.inPoint + c.duration)) invalid('clip');
        ids.add(c.id);
      }
    }
    if (s.type !== 'testpattern' && p.effects !== undefined) {
      if (!Array.isArray(p.effects)) invalid('effects');
      const ids = new Set<string>();
      for (const e of p.effects) {
        if (!isObject(e) || typeof e.id !== 'string' || ids.has(e.id) || typeof e.type !== 'string' ||
          !Object.hasOwn(EFFECTS, e.type) || !isNum(e.value) || e.value < 0 || e.value > 1 ||
          typeof e.enabled !== 'boolean') invalid('effect node');
        ids.add(e.id);
      }
    }
  }
  return { ...(data as unknown as Project), output: { ...(out as unknown as Project['output']), type: 'projector' }, surfaces: data.surfaces.map(normalizeSurface) };
}
