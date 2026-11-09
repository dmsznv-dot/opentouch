import { updateSourceParams } from '../core/ops';
import { deserializeProject, ProjectFormatError, serializeProject } from '../core/project';
import type { Project, SourceDef } from '../core/types';
import type { AppContext } from './app-context';
import { SequenceSource } from './sources/sequence';
import { VideoSource } from './sources/video';

export const AUTOSAVE_MS = 30_000;

function showMessage(ctx: AppContext, message: string): void {
  ctx.editor.set({ message });
  setTimeout(() => {
    if (ctx.editor.get().message === message) ctx.editor.set({ message: null });
  }, 6000);
}

/**
 * Loads project JSON into the store: media paths are resolved to absolute runtime paths;
 * unresolved videos are marked missing. Returns false (and keeps the current project) on a bad file.
 */
export async function loadProject(ctx: AppContext, json: string, projectPath: string | null, mediaBase: string | null = projectPath): Promise<boolean> {
  let p: Project;
  try {
    p = deserializeProject(json);
  } catch (e) {
    if (e instanceof ProjectFormatError)
      showMessage(ctx, e.code === 'too-new' ? 'Файл создан более новой версией OpenTouch' : 'Файл проекта повреждён');
    else showMessage(ctx, String(e));
    return false;
  }
  const missing: string[] = [];
  const sources: SourceDef[] = [];
  const missingClips = new Map<string, string[]>();
  for (const s of p.sources) {
    if (s.type === 'sequence') {
      const absent: string[] = [];
      const clips = await Promise.all(s.params.clips.map(async (c) => {
        const path = await ctx.api.project.resolveMedia(c.path, mediaBase);
        if (!path) absent.push(c.id);
        return path ? { ...c, path } : c;
      }));
      missingClips.set(s.id, absent);
      sources.push({ ...s, params: { ...s.params, clips } });
      continue;
    }
    if (s.type !== 'video') {
      sources.push(s);
      continue;
    }
    const abs = await ctx.api.project.resolveMedia(s.params.path, mediaBase);
    if (abs) sources.push({ ...s, params: { ...s.params, path: abs } });
    else {
      missing.push(s.id);
      sources.push(s);
    }
  }
  ctx.store.replace({ ...p, sources });
  for (const id of missing) {
    const src = ctx.engine.getSource(id);
    if (src instanceof VideoSource) src.markMissing();
  }
  for (const [id, absent] of missingClips) {
    const source = ctx.engine.getSource(id);
    if (source instanceof SequenceSource) source.markMissing(absent);
  }
  // Prefer the projector this project was calibrated on (spec §7: saved display id first).
  if (p.output.displayHint) {
    const hint = p.output.displayHint;
    const all = ctx.editor.get().displays.all;
    if (all.some((d) => d.id === hint.id)) ctx.editor.set({ displays: await ctx.api.displays.select(hint.id) });
  }
  ctx.editor.set({ projectPath, selectedSurfaceId: null, selectedSourceId: null, selectedPoints: [], draftMask: null });
  ctx.api.app.setProjectPath(projectPath);
  const missingCount = missing.length + [...missingClips.values()].reduce((n, ids) => n + ids.length, 0);
  if (missingCount) showMessage(ctx, `Не найдено медиафайлов: ${missingCount}`);
  return true;
}

export const DISCARD_PROMPT = 'В проекте есть несохранённые изменения. Открыть другой проект без сохранения?';

export async function openProject(ctx: AppContext): Promise<void> {
  if (ctx.store.isDirty() && !window.confirm(DISCARD_PROMPT)) return;
  const r = await ctx.api.project.open();
  if (r) await loadProject(ctx, r.json, r.path);
}

export async function saveProject(ctx: AppContext, saveAs = false): Promise<void> {
  const snapshot = ctx.store.get();
  const path = await ctx.api.project.save(serializeProject(snapshot), saveAs ? null : ctx.editor.get().projectPath);
  if (!path) return;
  if (ctx.store.get() === snapshot) ctx.store.markSaved();
  ctx.api.app.setDirty(ctx.store.isDirty());
  ctx.editor.set({ projectPath: path });
  ctx.api.app.setProjectPath(path);
}

export async function relinkSource(ctx: AppContext, sourceId: string): Promise<void> {
  const path = await ctx.api.media.relink();
  if (path) ctx.store.dispatch('Relink media', (p) => updateSourceParams(p, sourceId, { path }));
}

/** Writes an autosave every AUTOSAVE_MS while there are changes since the last save/autosave. */
export function startAutosave(ctx: AppContext, intervalMs = AUTOSAVE_MS): () => void {
  let last: Project | null = null;
  const t = setInterval(() => {
    const p = ctx.store.get();
    if (!ctx.store.isDirty() || p === last) return;
    last = p;
    void ctx.api.project.autosave(serializeProject(p), ctx.editor.get().projectPath);
  }, intervalMs);
  return () => clearInterval(t);
}

/** On launch (and after a crash reload): reopen what main decided, in the decided mode. */
export async function restoreOnStartup(ctx: AppContext): Promise<void> {
  const r = await ctx.api.app.restoreState();
  if (r.open) {
    try {
      const json = await ctx.api.project.read(r.open);
      const ok = await loadProject(ctx, json, r.projectPath, r.projectPath ?? r.open);
      // A restored autosave holds changes newer than the project file.
      if (ok && r.fromAutosave) ctx.store.dispatch('Restore autosave', (p) => ({ ...p }));
    } catch {
      showMessage(ctx, `Не удалось открыть ${r.open}`);
    }
  }
  ctx.editor.set({ mode: r.mode });
  ctx.api.app.setMode(r.mode);
}

/** Keeps main informed about unsaved changes and handles its "save-and-quit" request from the close prompt. */
export function connectQuitFlow(ctx: AppContext): () => void {
  let last: boolean | null = null;
  const report = () => {
    const d = ctx.store.isDirty();
    if (d !== last) ctx.api.app.setDirty((last = d));
  };
  const offStore = ctx.store.subscribe(report);
  report();
  const offMenu = ctx.api.app.onMenu(async (action) => {
    if (action !== 'save-and-quit') return;
    await saveProject(ctx);
    report();
    if (!ctx.store.isDirty()) ctx.api.app.quit();
  });
  return () => {
    offStore();
    offMenu();
  };
}
