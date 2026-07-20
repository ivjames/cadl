/**
 * Pure, deterministic arcade driving model.
 *
 * This module has NO Babylon.js (or DOM) dependency on purpose: it is the
 * rule/behaviour core that unit tests can exercise without launching a
 * renderer. `TrainingVehicle` owns the Babylon meshes and simply pushes the
 * state produced here onto them each frame.
 */

/** Full kinematic state of the vehicle in world space. */
export interface CarState {
  /** World X position of the vehicle pivot (metres). */
  x: number;
  /** World Z position of the vehicle pivot (metres). */
  z: number;
  /** Heading in radians. 0 points down +Z; positive turns toward +X. */
  heading: number;
  /** Signed speed along the heading (m/s). Positive = forward, negative = reverse. */
  speed: number;
}

/** Normalised driver intent for a single step. */
export interface DriveInput {
  /** Accelerator, 0..1. */
  gas: number;
  /** Brake / reverse, 0..1. */
  brake: number;
  /** Steering, -1 (full left) .. 1 (full right). */
  steer: number;
}

/**
 * Where the vehicle spawns and returns to on reset. x is the right-hand lane
 * centre (ROAD_HALF/2 in the scene) so the car starts in its lane, aligned with
 * the south approach's stop line and sign rather than straddling the centreline.
 */
export const SPAWN: Readonly<CarState> = { x: 2.75, z: -22, heading: 0, speed: 0 };

/** Tunable arcade constants. Deliberately not a physics engine. */
export const DRIVING = {
  /** Forward acceleration at full gas (m/s²). */
  forwardAccel: 6,
  /** Reverse acceleration (m/s²). Reserved for a future dedicated reverse/gear
   *  control — the brake no longer engages reverse. */
  reverseAccel: 4,
  /** Braking deceleration when rolling forward (m/s²). */
  brakeDecel: 14,
  /** Passive drag when coasting (m/s²). */
  drag: 4,
  /** Top forward speed (m/s ≈ 45 mph). */
  maxForward: 20,
  /** Top reverse speed (m/s ≈ 11 mph). Reserved (see reverseAccel). */
  maxReverse: 5,
  /** Yaw rate at full steer and full steering authority (rad/s). */
  steerRate: 1.4,
  /** Speed at which steering reaches full authority (m/s). */
  steerSpeedRef: 6,
  /** Speeds with magnitude below this are treated as stopped. */
  stopEpsilon: 0.02,
} as const;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const clamp01 = (value: number): number => clamp(value, 0, 1);

/** A fresh copy of the spawn state (never hand out the shared constant). */
export function spawnState(): CarState {
  return { ...SPAWN };
}

/**
 * Advance the vehicle one step. Pure: returns a new state, never mutates input.
 *
 * Longitudinal rules:
 *  - Brake while rolling forward decelerates toward zero and clamps AT zero, so
 *    a single step can never flip forward speed straight into reverse.
 *  - Brake while stopped (or already reversing) engages reverse.
 *  - Gas accelerates forward (and, from reverse, smoothly back through zero).
 *  - No pedal: passive drag bleeds speed toward zero.
 */
export function stepCar(state: CarState, input: DriveInput, dt: number): CarState {
  const gas = clamp01(input.gas);
  const brake = clamp01(input.brake);
  let speed = state.speed;

  if (brake > 0) {
    // Brake bleeds speed toward a full stop and holds there — it never engages
    // reverse, so the car won't roll backward when braking from a standstill.
    speed = Math.max(0, speed - brake * DRIVING.brakeDecel * dt);
  } else if (gas > 0) {
    speed += gas * DRIVING.forwardAccel * dt;
  } else {
    const drag = DRIVING.drag * dt;
    speed = Math.abs(speed) <= drag ? 0 : speed - Math.sign(speed) * drag;
  }

  speed = clamp(speed, -DRIVING.maxReverse, DRIVING.maxForward);

  // Steering authority grows with speed; you cannot turn in place, and backing
  // up inverts the turn direction (yaw rate scales with signed velocity).
  const authority = Math.min(Math.abs(speed) / DRIVING.steerSpeedRef, 1);
  const heading =
    state.heading + input.steer * authority * DRIVING.steerRate * Math.sign(speed) * dt;

  const x = state.x + Math.sin(heading) * speed * dt;
  const z = state.z + Math.cos(heading) * speed * dt;

  return { x, z, heading, speed };
}

/** Convert a signed m/s speed to an absolute mph reading for the HUD. */
export function speedToMph(speed: number): number {
  return Math.abs(speed) * 2.23694;
}
