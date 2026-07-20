/**
 * Turn-signal state machine — pure, no Babylon/DOM.
 *
 * Models a real blinker: the driver arms left or right, and the signal
 * auto-cancels once a turn in that direction has been completed and the wheel
 * straightens (the California guide: "Cancel your signal after completing the
 * maneuver"). Manual toggle/cancel is handled by the caller via `setSignal`.
 *
 * Heading convention matches driving.ts: a LEFT turn decreases heading, a RIGHT
 * turn increases it.
 */

export type SignalDirection = "left" | "right";

export interface SignalState {
  /** Which way we're signalling, or null when off. */
  active: SignalDirection | null;
  /** Signed heading change accumulated since the signal was armed (radians). */
  accumulatedTurn: number;
  /** True once we've turned far enough in the signalled direction to "count". */
  peaked: boolean;
}

/** Heading swept in the signalled direction before a turn counts as begun (~40°). */
export const TURN_COUNTED_THRESHOLD = 0.7;
/** Steering magnitude below which the wheel is considered straightened. */
export const STRAIGHT_STEER_EPSILON = 0.05;

export function initialSignalState(): SignalState {
  return { active: null, accumulatedTurn: 0, peaked: false };
}

/** Arm, switch, or clear the signal. Passing the current direction turns it off. */
export function setSignal(state: SignalState, direction: SignalDirection | null): SignalState {
  if (direction === null || direction === state.active) {
    return initialSignalState();
  }
  return { active: direction, accumulatedTurn: 0, peaked: false };
}

/**
 * Advance the signal one step given the frame's heading change and current
 * steering. Returns a new state; auto-cancels when a turn in the signalled
 * direction has completed and the wheel has returned toward centre.
 */
export function updateSignal(
  state: SignalState,
  headingDelta: number,
  steer: number,
): SignalState {
  if (state.active === null) return state;

  const accumulatedTurn = state.accumulatedTurn + headingDelta;
  const wantedSign = state.active === "left" ? -1 : 1;
  const peaked =
    state.peaked ||
    (Math.sign(accumulatedTurn) === wantedSign &&
      Math.abs(accumulatedTurn) >= TURN_COUNTED_THRESHOLD);

  // Once the turn has been made and the wheel is roughly straight again, cancel.
  if (peaked && Math.abs(steer) < STRAIGHT_STEER_EPSILON) {
    return initialSignalState();
  }
  return { active: state.active, accumulatedTurn, peaked };
}
