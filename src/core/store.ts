import type { Project } from './types';

const HISTORY_LIMIT = 200;

export class ProjectStore {
  private state: Project;
  private past: Project[] = [];
  private future: Project[] = [];
  private txStart: Project | null = null;
  private saved: Project;
  private listeners = new Set<() => void>();

  constructor(initial: Project) {
    this.state = initial;
    this.saved = initial;
  }

  get(): Project {
    return this.state;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  private push(prev: Project): void {
    this.past.push(prev);
    if (this.past.length > HISTORY_LIMIT) this.past.shift();
    this.future = [];
  }

  dispatch(_label: string, fn: (p: Project) => Project): void {
    const next = fn(this.state);
    if (next === this.state) return;
    if (!this.txStart) this.push(this.state);
    this.state = next;
    this.emit();
  }

  begin(_label: string): void {
    if (!this.txStart) this.txStart = this.state;
  }

  end(): void {
    const start = this.txStart;
    this.txStart = null;
    if (start && start !== this.state) this.push(start);
  }

  cancel(): void {
    const start = this.txStart;
    this.txStart = null;
    if (start && start !== this.state) {
      this.state = start;
      this.emit();
    }
  }

  undo(): void {
    const prev = this.past.pop();
    if (!prev) return;
    this.future.push(this.state);
    this.state = prev;
    this.emit();
  }

  redo(): void {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(this.state);
    this.state = next;
    this.emit();
  }

  canUndo(): boolean {
    return this.past.length > 0;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }

  /**
   * Applies `fn` to the current state and every history snapshot without adding an undo step
   * (facts about the environment, e.g. the projector's resolution). Marks the project dirty.
   */
  rebase(fn: (p: Project) => Project): void {
    const next = fn(this.state);
    if (next === this.state) return;
    this.past = this.past.map(fn);
    this.future = this.future.map(fn);
    if (this.txStart) this.txStart = fn(this.txStart);
    this.state = next;
    this.emit();
  }

  replace(p: Project): void {
    this.state = p;
    this.saved = p;
    this.past = [];
    this.future = [];
    this.txStart = null;
    this.emit();
  }

  isDirty(): boolean {
    return this.state !== this.saved;
  }

  markSaved(): void {
    this.saved = this.state;
  }
}
