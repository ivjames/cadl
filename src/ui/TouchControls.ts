import type { DrivingInput, HeldControl } from "../input/DrivingInput";

export interface TouchControlsOptions {
  onToggleCamera: () => void;
  onReset: () => void;
  onSignalLeft: () => void;
  onSignalRight: () => void;
}

/** Wire a hold-to-activate button (steer/gas/brake) to a driving control. */
function bindHold(id: string, input: DrivingInput, control: HeldControl): void {
  const el = document.getElementById(id);
  if (!el) return;

  const press = (event: PointerEvent): void => {
    event.preventDefault();
    // Capture the pointer so we still get pointerup even if the finger slides
    // off the button — this is what prevents "stuck" controls.
    try {
      el.setPointerCapture(event.pointerId);
    } catch {
      /* not all pointers are capturable; the release listeners still cover us */
    }
    el.classList.add("is-pressed");
    input.press(control, true);
  };

  const release = (): void => {
    el.classList.remove("is-pressed");
    input.press(control, false);
  };

  el.addEventListener("pointerdown", press);
  el.addEventListener("pointerup", release);
  el.addEventListener("pointercancel", release);
  el.addEventListener("pointerleave", release);
  el.addEventListener("lostpointercapture", release);
  el.addEventListener("contextmenu", (event) => event.preventDefault());
}

/** Wire a tap button (camera/reset) to a one-shot handler. */
function bindTap(id: string, handler: () => void): void {
  const el = document.getElementById(id);
  if (!el) return;

  const clearPressed = (): void => el.classList.remove("is-pressed");

  el.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    el.classList.add("is-pressed");
    handler();
  });
  el.addEventListener("pointerup", clearPressed);
  el.addEventListener("pointercancel", clearPressed);
  el.addEventListener("pointerleave", clearPressed);
}

/**
 * Connect the on-screen touch controls to the shared input + camera/reset
 * callbacks. Uses pointer events throughout so a single code path serves touch,
 * pen, and mouse. Also suppresses Safari pinch-zoom gesture events globally.
 */
export function setupTouchControls(input: DrivingInput, options: TouchControlsOptions): void {
  // Steering is the on-screen wheel (see SteeringWheel.ts) + keyboard.
  bindHold("gasButton", input, "gas");
  bindHold("brakeButton", input, "brake");
  bindTap("cameraButton", options.onToggleCamera);
  bindTap("resetButton", options.onReset);
  bindTap("signalLeft", options.onSignalLeft);
  bindTap("signalRight", options.onSignalRight);

  // Block iOS Safari pinch-zoom / double-tap zoom over the controls & canvas.
  for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
    document.addEventListener(type, (event) => event.preventDefault());
  }
}
