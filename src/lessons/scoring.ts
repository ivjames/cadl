/**
 * Driving coach — pure scoring engine, no Babylon/DOM.
 *
 * Fed one {@link DrivingSample} per frame, it watches for the study-guide
 * violations the current mechanics can detect — rolling a stop, exceeding the
 * posted limit, and turning without signalling — and maintains a running score.
 * This is the seam graded California lessons build on; it holds no rendering or
 * DOM state so it can be unit-tested without a renderer.
 */

import type { SignalDirection } from "../vehicle/signals";
import type { StopAhead } from "../rules/stopControls";

/** A per-frame snapshot of everything the coach needs. */
export interface DrivingSample {
  /** Heading in radians (same convention as driving.ts). */
  heading: number;
  /** Absolute speed for HUD-style checks. */
  speedMph: number;
  /** True when over the posted limit (beyond tolerance). */
  overLimit: boolean;
  /** Active turn signal, or null. */
  signal: SignalDirection | null;
  /** Nearest stop control ahead, or null (from stopSignAhead). */
  stopAhead: StopAhead | null;
  /** Centre-to-centre distance to the lead car ahead (m), or null if clear. */
  leadGap: number | null;
  /** The intersection the car is currently inside, or null. */
  junction: { cx: number; cz: number } | null;
  /** Whether cross traffic is in that junction (traffic to yield to). */
  crossTraffic: boolean;
  /** Whether cross traffic occupies the junction the car is approaching. */
  crossTrafficAhead: boolean;
  /** Whether a pedestrian is in the car's path ahead. */
  pedestrianAhead: boolean;
  /** Whether the car is parked in the active lesson's bay (position + rest). */
  parked: boolean;
}

export type ViolationKind =
  | "stop"
  | "speed"
  | "signal"
  | "follow"
  | "yield"
  | "block"
  | "pedestrian";
/** Positive things a lesson can require the driver to do. */
export type AchievementKind =
  | "cleanStop"
  | "signaledTurn"
  | "parked"
  | "yieldedPedestrian"
  | "yieldedCrossTraffic"
  | "keptDistance";

export interface Violation {
  type: "violation";
  kind: ViolationKind;
  message: string;
}

export interface Achievement {
  type: "achievement";
  kind: AchievementKind;
  message: string;
}

/** Anything the coach emits in a frame. */
export type CoachEvent = Violation | Achievement;

export const PENALTIES: Record<ViolationKind, number> = {
  stop: 15,
  speed: 10,
  signal: 10,
  follow: 8,
  yield: 15,
  block: 10,
  pedestrian: 20,
};

/** Speed (mph) below which the car counts as fully stopped. */
export const FULL_STOP_MPH = 1.5;
/** A stop control announced within this distance means we're in its stop zone. */
export const STOP_ZONE_M = 12;
/** Only grade a stop if the car got at least this close to the line — otherwise
 *  it left the zone by turning away, not by crossing the line. */
export const STOP_CROSS_M = 3;
/** Sustained seconds over the limit before a speeding violation registers. */
export const SPEEDING_GRACE_S = 0.75;
/** The "3-second rule", relaxed a little for arcade play. */
export const FOLLOW_TIME_GAP_S = 2;
/** Speed below which following distance isn't judged. */
export const FOLLOW_MIN_MPH = 5;
/** Sustained seconds tailgating before it registers. */
export const FOLLOW_GRACE_S = 0.6;
/** Minimum speed (mph) at which following distance is credited. */
export const FOLLOW_KEEP_MIN_MPH = 8;
/** Time gap (s) at or above which the following distance is considered safe. */
export const FOLLOW_KEEP_GAP_S = 2.5;
/** Sustained seconds tracking a lead car at a safe gap before it's credited. */
export const FOLLOW_KEEP_S = 3;
/** Sustained seconds stopped inside a junction before "blocking" registers. */
export const BLOCK_GRACE_S = 2;
/** Speed below which waiting for cross traffic ahead counts as yielding (mph). */
export const CROSS_YIELD_MPH = 3;
/** Sustained seconds yielding to approaching cross traffic before it's credited. */
export const CROSS_YIELD_S = 0.4;
/** Speed above which not yielding to a pedestrian ahead registers. */
export const PEDESTRIAN_MIN_MPH = 6;
/** Sustained seconds bearing down on a pedestrian before it registers. */
export const PEDESTRIAN_GRACE_S = 0.4;
/** Speed below which slowing for a pedestrian ahead counts as yielding (mph). */
export const PEDESTRIAN_YIELD_MPH = 2.5;
/** Sustained seconds crawling for a pedestrian ahead before a yield is credited. */
export const PEDESTRIAN_YIELD_S = 0.4;
/** Sustained seconds held inside the bay at rest before a park is awarded. */
export const PARK_HOLD_S = 0.5;
/** Heading swept (radians) before a manoeuvre counts as a turn. */
export const TURN_THRESHOLD = 0.7;
/** Per-frame heading change below which the car isn't turning this frame. */
export const STRAIGHT_EPSILON = 0.005;
/** Sustained straight time (s) before a manoeuvre is considered finished — so a
 *  single slow frame mid-turn doesn't reset it. */
export const STRAIGHT_HOLD_S = 0.35;

const STARTING_SCORE = 100;

export class DrivingCoach {
  private currentScore = STARTING_SCORE;
  private readonly log: CoachEvent[] = [];

  // Speeding hysteresis.
  private overLimitTime = 0;
  private speedingActive = false;

  // Following-distance hysteresis.
  private followTime = 0;
  private followingActive = false;
  // Positive: sustained time tracking a lead car at a safe gap (one-shot).
  private keepTime = 0;
  private keepAwarded = false;

  // Intersection conduct.
  private prevJunction: { cx: number; cz: number } | null = null;
  private blockTime = 0;
  private blockFlagged = false;
  // Positive: sustained time yielding to approaching cross traffic (one-shot).
  private crossYieldTime = 0;
  private crossYieldAwarded = false;

  // Pedestrian hysteresis.
  private pedTime = 0;
  private pedActive = false;
  // Positive: sustained time crawling for a pedestrian ahead, and a one-shot latch.
  private pedYieldTime = 0;
  private pedYieldAwarded = false;

  // Parking: sustained time held inside the bay at rest, and a one-shot latch.
  private parkTime = 0;
  private parkedAwarded = false;

  // Stop tracking: min speed + closest distance seen while approaching a control.
  private approachName: string | null = null;
  private approachMinMph = Infinity;
  private approachLastDistance = Infinity;

  // Turn / signal tracking.
  private prevHeading: number | null = null;
  private turnAccum = 0;
  private turnFlagged = false;
  private straightTime = 0;
  private sawLeftSignal = false;
  private sawRightSignal = false;

  get score(): number {
    return this.currentScore;
  }

  get violations(): readonly Violation[] {
    return this.log.filter((e): e is Violation => e.type === "violation");
  }

  get achievements(): readonly Achievement[] {
    return this.log.filter((e): e is Achievement => e.type === "achievement");
  }

  /** Whether the coach has recorded a given achievement kind at least once. */
  hasAchievement(kind: AchievementKind): boolean {
    return this.log.some((e) => e.type === "achievement" && e.kind === kind);
  }

  /** Whether a given violation kind has occurred at least once. */
  hasViolation(kind: ViolationKind): boolean {
    return this.log.some((e) => e.type === "violation" && e.kind === kind);
  }

  reset(): void {
    this.currentScore = STARTING_SCORE;
    this.log.length = 0;
    this.overLimitTime = 0;
    this.speedingActive = false;
    this.followTime = 0;
    this.followingActive = false;
    this.keepTime = 0;
    this.keepAwarded = false;
    this.prevJunction = null;
    this.blockTime = 0;
    this.blockFlagged = false;
    this.crossYieldTime = 0;
    this.crossYieldAwarded = false;
    this.pedTime = 0;
    this.pedActive = false;
    this.pedYieldTime = 0;
    this.pedYieldAwarded = false;
    this.parkTime = 0;
    this.parkedAwarded = false;
    this.approachName = null;
    this.approachMinMph = Infinity;
    this.approachLastDistance = Infinity;
    this.prevHeading = null;
    this.turnAccum = 0;
    this.turnFlagged = false;
    this.straightTime = 0;
    this.sawLeftSignal = false;
    this.sawRightSignal = false;
  }

  /**
   * Advance one frame. Returns the event emitted this frame (violation or
   * achievement), or null.
   */
  observe(sample: DrivingSample, dt: number): CoachEvent | null {
    const headingDelta = this.prevHeading === null ? 0 : sample.heading - this.prevHeading;
    this.prevHeading = sample.heading;

    return (
      this.checkPedestrian(sample, dt) ??
      this.checkSpeeding(sample, dt) ??
      this.checkFollowing(sample, dt) ??
      this.checkIntersection(sample, dt) ??
      this.checkRightOfWay(sample, dt) ??
      this.checkStops(sample) ??
      this.checkParked(sample, dt) ??
      this.checkSignals(sample, headingDelta, dt)
    );
  }

  private checkParked(sample: DrivingSample, dt: number): CoachEvent | null {
    if (this.parkedAwarded) return null;
    if (sample.parked) {
      this.parkTime += dt;
      if (this.parkTime >= PARK_HOLD_S) {
        this.parkedAwarded = true;
        return this.award("parked", "Parked inside the bay");
      }
    } else {
      this.parkTime = 0;
    }
    return null;
  }

  private checkPedestrian(sample: DrivingSample, dt: number): CoachEvent | null {
    if (sample.pedestrianAhead) {
      if (sample.speedMph > PEDESTRIAN_MIN_MPH) {
        // Bearing down on a pedestrian: a violation once sustained.
        this.pedYieldTime = 0;
        this.pedTime += dt;
        if (!this.pedActive && this.pedTime >= PEDESTRIAN_GRACE_S) {
          this.pedActive = true;
          return this.emit("pedestrian", "Yield to the pedestrian");
        }
      } else if (sample.speedMph <= PEDESTRIAN_YIELD_MPH) {
        // Crawling for a pedestrian ahead: credit a yield (once).
        this.pedTime = 0;
        this.pedYieldTime += dt;
        if (!this.pedYieldAwarded && this.pedYieldTime >= PEDESTRIAN_YIELD_S) {
          this.pedYieldAwarded = true;
          return this.award("yieldedPedestrian", "Yielded to the pedestrian");
        }
      } else {
        // Between the two thresholds: neither a violation nor yet a yield.
        this.pedTime = 0;
        this.pedYieldTime = 0;
      }
    } else {
      this.pedTime = 0;
      this.pedActive = false;
      this.pedYieldTime = 0;
    }
    return null;
  }

  private emit(kind: ViolationKind, message: string): Violation {
    const violation: Violation = { type: "violation", kind, message };
    this.log.push(violation);
    this.currentScore = Math.max(0, this.currentScore - PENALTIES[kind]);
    return violation;
  }

  private award(kind: AchievementKind, message: string): Achievement {
    const achievement: Achievement = { type: "achievement", kind, message };
    this.log.push(achievement);
    return achievement;
  }

  private checkSpeeding(sample: DrivingSample, dt: number): CoachEvent | null {
    if (sample.overLimit) {
      this.overLimitTime += dt;
      if (!this.speedingActive && this.overLimitTime >= SPEEDING_GRACE_S) {
        this.speedingActive = true;
        return this.emit("speed", "Over the speed limit");
      }
    } else {
      this.overLimitTime = 0;
      this.speedingActive = false;
    }
    return null;
  }

  private checkFollowing(sample: DrivingSample, dt: number): CoachEvent | null {
    const mps = sample.speedMph / 2.23694;
    const tailgating =
      sample.leadGap !== null &&
      sample.speedMph > FOLLOW_MIN_MPH &&
      sample.leadGap / mps < FOLLOW_TIME_GAP_S;
    if (tailgating) {
      this.keepTime = 0; // too close — no credit while tailgating
      this.followTime += dt;
      if (!this.followingActive && this.followTime >= FOLLOW_GRACE_S) {
        this.followingActive = true;
        return this.emit("follow", "Following too closely");
      }
      return null;
    }

    this.followTime = 0;
    this.followingActive = false;

    // Positive: tracking a lead car at a safe gap while moving credits distance.
    const trackingSafely =
      sample.leadGap !== null &&
      sample.speedMph >= FOLLOW_KEEP_MIN_MPH &&
      sample.leadGap / mps >= FOLLOW_KEEP_GAP_S;
    if (!this.keepAwarded && trackingSafely) {
      this.keepTime += dt;
      if (this.keepTime >= FOLLOW_KEEP_S) {
        this.keepAwarded = true;
        return this.award("keptDistance", "Kept a safe following distance");
      }
    } else if (!trackingSafely) {
      this.keepTime = 0;
    }
    return null;
  }

  private checkIntersection(sample: DrivingSample, dt: number): CoachEvent | null {
    const j = sample.junction;
    const prev = this.prevJunction;
    const enteredNew =
      j !== null && (prev === null || prev.cx !== j.cx || prev.cz !== j.cz);
    this.prevJunction = j;

    // Failing to yield: entering a junction that cross traffic already occupies.
    if (enteredNew && sample.crossTraffic) {
      this.blockTime = 0;
      this.blockFlagged = false;
      return this.emit("yield", "Yield to cross traffic");
    }

    // Blocking: sitting stopped inside the junction box too long.
    if (j !== null) {
      if (sample.speedMph < 1.5) {
        this.blockTime += dt;
        if (!this.blockFlagged && this.blockTime >= BLOCK_GRACE_S) {
          this.blockFlagged = true;
          return this.emit("block", "Blocking the intersection");
        }
      } else {
        this.blockTime = 0;
      }
    } else {
      this.blockTime = 0;
      this.blockFlagged = false;
    }
    return null;
  }

  private checkRightOfWay(sample: DrivingSample, dt: number): CoachEvent | null {
    if (this.crossYieldAwarded) return null;
    // Waiting at a crawl for cross traffic in the junction ahead is a proper yield.
    if (sample.crossTrafficAhead && sample.speedMph <= CROSS_YIELD_MPH) {
      this.crossYieldTime += dt;
      if (this.crossYieldTime >= CROSS_YIELD_S) {
        this.crossYieldAwarded = true;
        return this.award("yieldedCrossTraffic", "Yielded the right of way");
      }
    } else {
      this.crossYieldTime = 0;
    }
    return null;
  }

  private checkStops(sample: DrivingSample): CoachEvent | null {
    const inZone =
      sample.stopAhead !== null && sample.stopAhead.distance <= STOP_ZONE_M
        ? sample.stopAhead
        : null;

    if (inZone !== null) {
      // Approaching a stop line: track the slowest speed and closest distance.
      if (inZone.name !== this.approachName) {
        this.approachName = inZone.name;
        this.approachMinMph = Infinity;
        this.approachLastDistance = Infinity;
      }
      this.approachMinMph = Math.min(this.approachMinMph, sample.speedMph);
      this.approachLastDistance = inZone.distance;
      return null;
    }

    // Left a stop zone. Only grade it as rolling the stop if the car actually
    // reached the line (got within STOP_CROSS_M) — leaving by turning away
    // early is not a rolled stop.
    if (this.approachName !== null) {
      const crossedLine = this.approachLastDistance <= STOP_CROSS_M;
      const rolledThrough = this.approachMinMph > FULL_STOP_MPH;
      const minMph = this.approachMinMph;
      this.approachName = null;
      this.approachMinMph = Infinity;
      this.approachLastDistance = Infinity;
      if (crossedLine && rolledThrough) {
        return this.emit("stop", `Rolled the stop (${Math.round(minMph)} mph)`);
      }
      if (crossedLine) {
        return this.award("cleanStop", "Full stop at the line");
      }
    }
    return null;
  }

  private checkSignals(sample: DrivingSample, headingDelta: number, dt: number): CoachEvent | null {
    // A single slow frame isn't "straight" — only sustained straightness ends
    // the manoeuvre, so slow (low-speed) turns still accumulate and get graded.
    if (Math.abs(headingDelta) < STRAIGHT_EPSILON) {
      this.straightTime += dt;
      if (this.straightTime >= STRAIGHT_HOLD_S) {
        this.turnAccum = 0;
        this.turnFlagged = false;
        this.sawLeftSignal = false;
        this.sawRightSignal = false;
      }
      return null;
    }

    this.straightTime = 0;
    this.turnAccum += headingDelta;
    if (sample.signal === "left") this.sawLeftSignal = true;
    if (sample.signal === "right") this.sawRightSignal = true;

    if (!this.turnFlagged && Math.abs(this.turnAccum) >= TURN_THRESHOLD) {
      this.turnFlagged = true;
      const turningLeft = this.turnAccum < 0; // left turn decreases heading
      const signalled = turningLeft ? this.sawLeftSignal : this.sawRightSignal;
      const way = turningLeft ? "left" : "right";
      return signalled
        ? this.award("signaledTurn", `Signalled ${way} turn`)
        : this.emit("signal", `Turned ${way} without signalling`);
    }
    return null;
  }
}
