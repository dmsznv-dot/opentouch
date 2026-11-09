import type { DisplayInfo } from '../main/display-logic';

export type { DisplayInfo };

export interface DisplayState {
  current: DisplayInfo | null;
  all: DisplayInfo[];
}

export interface OpenedProject {
  path: string;
  json: string;
}

export interface RestoreState {
  open: string | null;
  mode: 'edit' | 'show';
  /** True when `open` is an autosave (crash recovery) rather than the project file itself. */
  fromAutosave: boolean;
  projectPath: string | null;
}

export interface Settings {
  lastProject: string | null;
  autostart: boolean;
  lastMode: 'edit' | 'show';
}

export type UpdateState =
  | { status: 'idle' | 'checking' | 'current' }
  | { status: 'downloading' | 'ready'; version: string }
  | { status: 'unavailable' | 'error'; detail: string };

/** API exposed by the preload script as `window.opentouch`. */
export interface OpenTouchApi {
  displays: {
    list(): Promise<DisplayState>;
    /** null → automatic choice. */
    select(id: number | null): Promise<DisplayState>;
    onChanged(cb: (s: DisplayState) => void): () => void;
  };
  media: {
    pick(kind?: 'video' | 'audio'): Promise<string[]>;
    relink(kind?: 'video' | 'audio'): Promise<string | null>;
    url(absPath: string): string;
    /** Absolute path of a dropped File (Electron webUtils). */
    pathForFile(file: File): string;
  };
  project: {
    open(): Promise<OpenedProject | null>;
    read(path: string): Promise<string>;
    save(json: string, path: string | null): Promise<string | null>;
    autosave(json: string, path: string | null): Promise<void>;
    resolveMedia(stored: string, projectFile: string | null): Promise<string | null>;
    toRelative(json: string, projectFile: string): Promise<string>;
  };
  app: {
    updateState(): Promise<UpdateState>;
    checkUpdate(): Promise<UpdateState>;
    installUpdate(): Promise<string | null>;
    restoreState(): Promise<RestoreState>;
    setMode(mode: 'edit' | 'show'): void;
    setProjectPath(path: string | null): void;
    getSettings(): Promise<Settings>;
    setAutostart(on: boolean): Promise<Settings>;
    /** Main → renderer commands: 'save-and-quit'. */
    onMenu(cb: (action: string) => void): () => void;
    /** Tells main whether there are unsaved changes (used by the close prompt). */
    setDirty(dirty: boolean): void;
    /** Quit after the renderer finished saving. */
    quit(): void;
  };
}

export const IPC = {
  displaysList: 'displays:list',
  displaysSelect: 'displays:select',
  displaysChanged: 'displays:changed',
  mediaPick: 'media:pick',
  mediaRelink: 'media:relink',
  projectOpen: 'project:open',
  projectRead: 'project:read',
  projectSave: 'project:save',
  projectAutosave: 'project:autosave',
  projectResolveMedia: 'project:resolve-media',
  projectToRelative: 'project:to-relative',
  updateState: 'updates:state',
  updateCheck: 'updates:check',
  updateInstall: 'updates:install',
  appRestoreState: 'app:restore-state',
  appSetMode: 'app:set-mode',
  appSetProjectPath: 'app:set-project-path',
  appGetSettings: 'app:get-settings',
  appSetAutostart: 'app:set-autostart',
  appMenu: 'app:menu',
  appSetDirty: 'app:set-dirty',
  appQuit: 'app:quit',
} as const;
