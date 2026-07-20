import type { DriveInput } from "../vehicle/driving";

/** The four held controls shared by keyboard and touch. */
export type HeldControl = "gas" | "brake" | "left" | "right";

const KEY_MAP: Record<HeldControl, readonly string[]> = {
  gas: ["KeyW", "ArrowUp"],
  brake: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
};

/**
 * Unifies keyboard and pointer/touch input into a single {@link DriveInput}.
 *
 * Touch (`press`) and keyboard (`onKeyDown`/`onKeyUp`) are tracked separately
 * and OR-ed together at `read()` time, so a control is "on" if it is held by
 * either source. Kept free of any direct `window`/DOM reference in its
 * constructor so it can be unit tested in a plain Node environment; the caller
 * wires DOM events via `attach`.
 */
export class DrivingInput {
  private readonly keys = new Set<string>();
  private touch: Record<HeldControl, boolean> = {
    gas: false,
    brake: false,
    left: false,
    right: false,
  };

  /** Subscribe to keyboard + focus-loss events on the given window. */
  attach(target: Window): void {
    target.addEventListener("keydown", this.onKeyDown);
    target.addEventListener("keyup", this.onKeyUp);
    target.addEventListener("blur", this.onBlur);
  }

  /** Remove the listeners added by {@link attach}. */
  detach(target: Window): void {
    target.removeEventListener("keydown", this.onKeyDown);
    target.removeEventListener("keyup", this.onKeyUp);
    target.removeEventListener("blur", this.onBlur);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    this.keys.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private readonly onBlur = (): void => {
    this.clear();
  };

  /** Set or release a touch/pointer control. */
  press(control: HeldControl, active: boolean): void {
    this.touch[control] = active;
  }

  private isHeld(control: HeldControl): boolean {
    if (this.touch[control]) return true;
    return KEY_MAP[control].some((code) => this.keys.has(code));
  }

  /** Snapshot the combined driver intent for this frame. */
  read(): DriveInput {
    const left = this.isHeld("left");
    const right = this.isHeld("right");
    return {
      gas: this.isHeld("gas") ? 1 : 0,
      brake: this.isHeld("brake") ? 1 : 0,
      steer: (right ? 1 : 0) - (left ? 1 : 0),
    };
  }

  /** Drop every held key and touch control (used on reset and focus loss). */
  clear(): void {
    this.keys.clear();
    this.touch = { gas: false, brake: false, left: false, right: false };
  }
}
