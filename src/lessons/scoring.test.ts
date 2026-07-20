import { describe, expect, it } from "vitest";
import {
  DrivingCoach,
  FULL_STOP_MPH,
  PENALTIES,
  SPEEDING_GRACE_S,
  TURN_THRESHOLD,
  type DrivingSample,
} from "./scoring";

const base: DrivingSample = {
  heading: 0,
  speedMph: 10,
  overLimit: false,
  signal: null,
  stopAhead: null,
  leadGap: null,
  junction: null,
  crossTraffic: false,
  crossTrafficAhead: false,
  pedestrianAhead: false,
  parked: false,
};

function feed(coach: DrivingCoach, sample: Partial<DrivingSample>, frames: number, dt = 1 / 60): void {
  for (let i = 0; i < frames; i += 1) coach.observe({ ...base, ...sample }, dt);
}

describe("DrivingCoach — speeding", () => {
  it("registers one violation after sustained overspeed, not instantly", () => {
    const coach = new DrivingCoach();
    coach.observe({ ...base, overLimit: true }, SPEEDING_GRACE_S / 2);
    expect(coach.violations.length).toBe(0); // still within grace
    coach.observe({ ...base, overLimit: true }, SPEEDING_GRACE_S);
    expect(coach.violations.length).toBe(1);
    expect(coach.score).toBe(100 - PENALTIES.speed);
  });

  it("does not re-fire until speed drops back under the limit", () => {
    const coach = new DrivingCoach();
    feed(coach, { overLimit: true }, 200); // long overspeed
    expect(coach.violations.length).toBe(1);
    feed(coach, { overLimit: false }, 10); // back under
    feed(coach, { overLimit: true }, 200); // over again
    expect(coach.violations.length).toBe(2);
  });
});

describe("DrivingCoach — following distance", () => {
  it("flags sustained tailgating of a close lead car", () => {
    const coach = new DrivingCoach();
    // 30 mph ≈ 13.4 m/s; a 10 m gap is well under the 2 s rule (~27 m).
    feed(coach, { speedMph: 30, leadGap: 10 }, 120);
    expect(coach.violations.some((v) => v.kind === "follow")).toBe(true);
  });

  it("does not flag a safe gap", () => {
    const coach = new DrivingCoach();
    feed(coach, { speedMph: 30, leadGap: 40 }, 120); // ~3 s gap
    expect(coach.violations.some((v) => v.kind === "follow")).toBe(false);
  });

  it("does not flag when nearly stopped", () => {
    const coach = new DrivingCoach();
    feed(coach, { speedMph: 3, leadGap: 4 }, 120);
    expect(coach.violations.some((v) => v.kind === "follow")).toBe(false);
  });

  it("credits a safe following distance after tracking a lead car", () => {
    const coach = new DrivingCoach();
    // 20 mph ≈ 8.9 m/s; a 30 m gap is ~3.3 s — safely back.
    feed(coach, { speedMph: 20, leadGap: 30 }, 200);
    expect(coach.hasAchievement("keptDistance")).toBe(true);
    expect(coach.score).toBe(100);
  });

  it("does not credit distance with no car ahead", () => {
    const coach = new DrivingCoach();
    feed(coach, { speedMph: 20, leadGap: null }, 200);
    expect(coach.hasAchievement("keptDistance")).toBe(false);
  });

  it("does not credit distance while tailgating", () => {
    const coach = new DrivingCoach();
    feed(coach, { speedMph: 30, leadGap: 10 }, 200); // ~0.75 s gap
    expect(coach.hasAchievement("keptDistance")).toBe(false);
  });
});

describe("DrivingCoach — pedestrians", () => {
  it("flags bearing down on a pedestrian in the path", () => {
    const coach = new DrivingCoach();
    feed(coach, { speedMph: 15, pedestrianAhead: true }, 60);
    expect(coach.violations.some((v) => v.kind === "pedestrian")).toBe(true);
  });

  it("does not flag when slowed for the pedestrian", () => {
    const coach = new DrivingCoach();
    feed(coach, { speedMph: 3, pedestrianAhead: true }, 60);
    expect(coach.violations.some((v) => v.kind === "pedestrian")).toBe(false);
  });

  it("credits a yield when crawling for a pedestrian ahead", () => {
    const coach = new DrivingCoach();
    feed(coach, { speedMph: 1, pedestrianAhead: true }, 60);
    expect(coach.hasAchievement("yieldedPedestrian")).toBe(true);
    // No penalty for yielding correctly.
    expect(coach.score).toBe(100);
  });

  it("awards the pedestrian yield only once", () => {
    const coach = new DrivingCoach();
    feed(coach, { speedMph: 1, pedestrianAhead: true }, 60);
    feed(coach, { speedMph: 20, pedestrianAhead: false }, 30);
    feed(coach, { speedMph: 1, pedestrianAhead: true }, 60);
    expect(coach.achievements.filter((a) => a.kind === "yieldedPedestrian").length).toBe(1);
  });

  it("does not credit a yield while still moving fast at the pedestrian", () => {
    const coach = new DrivingCoach();
    feed(coach, { speedMph: 15, pedestrianAhead: true }, 30);
    expect(coach.hasAchievement("yieldedPedestrian")).toBe(false);
  });
});

describe("DrivingCoach — parking", () => {
  it("awards a park after the car holds still in the bay", () => {
    const coach = new DrivingCoach();
    feed(coach, { speedMph: 0, parked: true }, 60);
    expect(coach.hasAchievement("parked")).toBe(true);
  });

  it("does not award a park before the hold time elapses", () => {
    const coach = new DrivingCoach();
    coach.observe({ ...base, speedMph: 0, parked: true }, 0.1);
    expect(coach.hasAchievement("parked")).toBe(false);
  });

  it("resets the hold if the car leaves the bay, and awards only once", () => {
    const coach = new DrivingCoach();
    coach.observe({ ...base, parked: true }, 0.3);
    coach.observe({ ...base, parked: false }, 0.3); // slipped out, restart
    expect(coach.hasAchievement("parked")).toBe(false);
    feed(coach, { parked: true }, 60);
    feed(coach, { parked: false }, 10);
    feed(coach, { parked: true }, 60); // back in again
    expect(coach.achievements.filter((a) => a.kind === "parked").length).toBe(1);
  });
});

describe("DrivingCoach — right of way", () => {
  it("credits a yield for waiting at a crawl for cross traffic ahead", () => {
    const coach = new DrivingCoach();
    feed(coach, { speedMph: 1, crossTrafficAhead: true }, 60);
    expect(coach.hasAchievement("yieldedCrossTraffic")).toBe(true);
    expect(coach.score).toBe(100); // yielding correctly costs nothing
  });

  it("does not credit a yield while still rolling toward the junction", () => {
    const coach = new DrivingCoach();
    feed(coach, { speedMph: 12, crossTrafficAhead: true }, 60);
    expect(coach.hasAchievement("yieldedCrossTraffic")).toBe(false);
  });

  it("awards the right-of-way yield only once", () => {
    const coach = new DrivingCoach();
    feed(coach, { speedMph: 1, crossTrafficAhead: true }, 60);
    feed(coach, { speedMph: 12, crossTrafficAhead: false }, 30);
    feed(coach, { speedMph: 1, crossTrafficAhead: true }, 60);
    expect(coach.achievements.filter((a) => a.kind === "yieldedCrossTraffic").length).toBe(1);
  });
});

describe("DrivingCoach — intersections", () => {
  it("flags entering a junction occupied by cross traffic", () => {
    const coach = new DrivingCoach();
    coach.observe({ ...base, junction: null, crossTraffic: true }, 1 / 60); // approaching
    coach.observe({ ...base, junction: { cx: 0, cz: 0 }, crossTraffic: true }, 1 / 60); // enter
    expect(coach.violations.some((v) => v.kind === "yield")).toBe(true);
  });

  it("does not flag entering a clear junction", () => {
    const coach = new DrivingCoach();
    coach.observe({ ...base, junction: { cx: 0, cz: 0 }, crossTraffic: false }, 1 / 60);
    expect(coach.violations.some((v) => v.kind === "yield")).toBe(false);
  });

  it("flags sitting stopped in a junction", () => {
    const coach = new DrivingCoach();
    feed(coach, { speedMph: 0, junction: { cx: 0, cz: 0 } }, 200);
    expect(coach.violations.some((v) => v.kind === "block")).toBe(true);
  });

  it("does not flag rolling through a junction", () => {
    const coach = new DrivingCoach();
    feed(coach, { speedMph: 12, junction: { cx: 0, cz: 0 } }, 60);
    expect(coach.violations.some((v) => v.kind === "block")).toBe(false);
  });
});

describe("DrivingCoach — stops", () => {
  it("flags rolling through a stop the car reaches but doesn't stop for", () => {
    const coach = new DrivingCoach();
    // Roll up to the line (distance shrinking to ~0) at 8 mph, then cross it.
    for (let d = 10; d >= 1; d -= 1) {
      coach.observe({ ...base, speedMph: 8, stopAhead: { name: "S", distance: d } }, 1 / 60);
    }
    coach.observe({ ...base, speedMph: 8, stopAhead: null }, 1 / 60); // crossed
    expect(coach.violations.some((v) => v.kind === "stop")).toBe(true);
  });

  it("does not flag when the car stops at the line", () => {
    const coach = new DrivingCoach();
    for (let d = 10; d >= 3; d -= 1) {
      coach.observe({ ...base, speedMph: 6, stopAhead: { name: "S", distance: d } }, 1 / 60);
    }
    for (let i = 0; i < 5; i += 1) {
      coach.observe(
        { ...base, speedMph: FULL_STOP_MPH - 0.5, stopAhead: { name: "S", distance: 1 } },
        1 / 60,
      );
    }
    coach.observe({ ...base, speedMph: 6, stopAhead: null }, 1 / 60); // pull away
    expect(coach.violations.some((v) => v.kind === "stop")).toBe(false);
  });

  it("does not flag when the car turns away before reaching the line", () => {
    const coach = new DrivingCoach();
    // Enters the zone but leaves it (stopAhead → null) while still ~8 m short.
    coach.observe({ ...base, speedMph: 8, stopAhead: { name: "S", distance: 8 } }, 1 / 60);
    coach.observe({ ...base, speedMph: 8, stopAhead: null }, 1 / 60);
    expect(coach.violations.some((v) => v.kind === "stop")).toBe(false);
  });
});

describe("DrivingCoach — signals", () => {
  const turnFrames = 40;
  const perFrameTurn = -(TURN_THRESHOLD + 0.2) / turnFrames; // sweep left past threshold

  it("flags a turn made without signalling", () => {
    const coach = new DrivingCoach();
    let heading = 0;
    for (let i = 0; i < turnFrames; i += 1) {
      heading += perFrameTurn;
      coach.observe({ ...base, heading, signal: null }, 1 / 60);
    }
    expect(coach.violations.some((v) => v.kind === "signal")).toBe(true);
  });

  it("does not flag a turn that was signalled", () => {
    const coach = new DrivingCoach();
    let heading = 0;
    for (let i = 0; i < turnFrames; i += 1) {
      heading += perFrameTurn;
      coach.observe({ ...base, heading, signal: "left" }, 1 / 60);
    }
    expect(coach.violations.some((v) => v.kind === "signal")).toBe(false);
  });

  it("does not flag a small lane-change wiggle as a turn", () => {
    const coach = new DrivingCoach();
    let heading = 0;
    for (let i = 0; i < 10; i += 1) {
      heading += -0.02; // total 0.2 rad, well under threshold
      coach.observe({ ...base, heading, signal: null }, 1 / 60);
    }
    expect(coach.violations.length).toBe(0);
  });

  it("still scores a slow turn where some frames dip below the straight threshold", () => {
    const coach = new DrivingCoach();
    let heading = 0;
    // Alternate real turn frames with tiny sub-threshold dips. The old
    // single-frame reset never accumulated; the sustained-straight timer does.
    for (let i = 0; i < 80; i += 1) {
      heading += i % 2 === 0 ? -0.02 : -0.001;
      coach.observe({ ...base, heading, signal: null }, 1 / 60);
    }
    expect(coach.violations.some((v) => v.kind === "signal")).toBe(true);
  });
});

describe("DrivingCoach — reset", () => {
  it("restores a clean scorecard", () => {
    const coach = new DrivingCoach();
    feed(coach, { overLimit: true }, 200);
    expect(coach.score).toBeLessThan(100);
    coach.reset();
    expect(coach.score).toBe(100);
    expect(coach.violations.length).toBe(0);
  });
});
