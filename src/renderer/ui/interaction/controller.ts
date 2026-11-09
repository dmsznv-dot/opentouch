import type { ProjectStore } from '../../../core/store';
import type { Vec2 } from '../../../core/types';
import type { EditorStore } from '../../editor-store';
import * as tool from './output-tool';

/** Holds the Output tool's state and environment; used by the viewport (pointer) and shortcuts (keys). */
export class OutputToolController {
  private state: tool.ToolState = tool.idleTool;
  private viewPx = { width: 1, height: 1 };

  constructor(
    private readonly store: ProjectStore,
    private readonly editor: EditorStore,
  ) {}

  setViewportSize(width: number, height: number): void {
    this.viewPx = { width: Math.max(1, width), height: Math.max(1, height) };
  }

  private env(): tool.ToolEnv {
    const o = this.store.get().output;
    return {
      store: this.store,
      editor: this.editor,
      pxToNorm: { x: 1 / this.viewPx.width, y: 1 / this.viewPx.height },
      outputPx: { x: 1 / o.width, y: 1 / o.height },
    };
  }

  get mode(): tool.ToolState['mode'] {
    return this.state.mode;
  }

  down(at: Vec2, mods: tool.Mods): void {
    this.state = tool.pointerDown(this.state, this.env(), at, mods);
  }
  move(at: Vec2, mods: tool.Mods): void {
    this.state = tool.pointerMove(this.state, this.env(), at, mods);
  }
  up(at: Vec2): void {
    this.state = tool.pointerUp(this.state, this.env(), at);
  }
  cancel(): void {
    this.state = tool.cancel(this.state, this.env());
  }
  startMask(): void {
    this.state = tool.startMask(this.state, this.env());
  }
  nudge(dir: Vec2, big: boolean): void {
    tool.nudge(this.env(), dir, big);
  }
}
