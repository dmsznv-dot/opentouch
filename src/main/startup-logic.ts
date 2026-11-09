import type { RestoreState, Settings } from '../shared/ipc';

/**
 * What to open on launch.
 * - after a renderer crash: the latest autosave (else the project file) in the last mode;
 * - autostart with a last project: that project in Show;
 * - otherwise an empty project in Edit.
 */
export function decideStartup(s: Settings, crashAutosave: string | null, crashed: boolean, currentProject: string | null): RestoreState {
  if (crashed) {
    if (crashAutosave) return { open: crashAutosave, mode: s.lastMode, fromAutosave: true, projectPath: currentProject };
    if (currentProject) return { open: currentProject, mode: s.lastMode, fromAutosave: false, projectPath: currentProject };
  }
  if (s.autostart && s.lastProject) return { open: s.lastProject, mode: 'show', fromAutosave: false, projectPath: s.lastProject };
  return { open: null, mode: 'edit', fromAutosave: false, projectPath: null };
}

/** Allows at most `max` restarts inside a sliding `windowMs`. */
export class RestartLimiter {
  private times: number[] = [];
  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  allow(now: number): boolean {
    this.times = this.times.filter((t) => now - t < this.windowMs);
    if (this.times.length >= this.max) return false;
    this.times.push(now);
    return true;
  }
}
