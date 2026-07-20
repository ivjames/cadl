import { describe, expect, it } from "vitest";
import { LessonRunner } from "./LessonRunner";
import { LESSONS } from "./lessons";
import type { DrivingSample } from "./scoring";

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
  offRoad: false,
  hitCar: false,
  hitPedestrian: false,
};

const lesson = (id: string) => LESSONS.find((l) => l.id === id)!;

/** Roll up to the line, stop fully, then cross → a clean-stop achievement. */
function driveCleanStop(runner: LessonRunner): void {
  for (let d = 10; d >= 3; d -= 1) {
    runner.observe({ ...base, speedMph: 6, stopAhead: { name: "S", distance: d } }, 1 / 60);
  }
  for (let i = 0; i < 5; i += 1) {
    runner.observe({ ...base, speedMph: 1, stopAhead: { name: "S", distance: 1 } }, 1 / 60);
  }
  runner.observe({ ...base, speedMph: 6, stopAhead: null }, 1 / 60);
}

/** Roll up to the line at speed and cross without stopping → a stop violation. */
function driveRolledStop(runner: LessonRunner): void {
  for (let d = 10; d >= 1; d -= 1) {
    runner.observe({ ...base, speedMph: 8, stopAhead: { name: "S", distance: d } }, 1 / 60);
  }
  runner.observe({ ...base, speedMph: 8, stopAhead: null }, 1 / 60);
}

function driveTurn(runner: LessonRunner, signal: "left" | null): void {
  let heading = 0;
  for (let i = 0; i < 45; i += 1) {
    heading += -0.025; // sweep left past the turn threshold
    runner.observe({ ...base, heading, signal }, 1 / 60);
  }
}

describe("LessonRunner", () => {
  it("Free Drive never passes or fails — it's an open scorecard", () => {
    const runner = new LessonRunner(lesson("free"));
    driveRolledStop(runner);
    driveTurn(runner, null);
    expect(runner.status).toBe("in-progress");
  });

  it("Stop & Go passes after a clean stop", () => {
    const runner = new LessonRunner(lesson("stop-go"));
    driveCleanStop(runner);
    expect(runner.status).toBe("passed");
    expect(runner.objectives[0]!.done).toBe(true);
  });

  it("Stop & Go fails when the stop is rolled", () => {
    const runner = new LessonRunner(lesson("stop-go"));
    driveRolledStop(runner);
    expect(runner.status).toBe("failed");
    expect(runner.failReasonText).toMatch(/Rolled the stop/);
  });

  it("Signal Your Turn passes with a signalled turn", () => {
    const runner = new LessonRunner(lesson("signal-turn"));
    driveTurn(runner, "left");
    expect(runner.status).toBe("passed");
  });

  it("Signal Your Turn fails an unsignalled turn", () => {
    const runner = new LessonRunner(lesson("signal-turn"));
    driveTurn(runner, null);
    expect(runner.status).toBe("failed");
  });

  it("Full Intersection needs both objectives", () => {
    const runner = new LessonRunner(lesson("intersection"));
    driveCleanStop(runner);
    expect(runner.status).toBe("in-progress"); // turn still owed
    driveTurn(runner, "left");
    expect(runner.status).toBe("passed");
  });

  it("Following Distance passes after holding a safe gap behind a lead car", () => {
    const runner = new LessonRunner(lesson("following"));
    for (let i = 0; i < 200; i += 1) {
      runner.observe({ ...base, speedMph: 20, leadGap: 30 }, 1 / 60);
    }
    expect(runner.status).toBe("passed");
  });

  it("Following Distance fails if the driver tailgates", () => {
    const runner = new LessonRunner(lesson("following"));
    for (let i = 0; i < 120; i += 1) {
      runner.observe({ ...base, speedMph: 30, leadGap: 10 }, 1 / 60);
    }
    expect(runner.status).toBe("failed");
  });

  it("Right of Way passes when the driver waits for cross traffic ahead", () => {
    const runner = new LessonRunner(lesson("right-of-way"));
    for (let i = 0; i < 40; i += 1) {
      runner.observe({ ...base, speedMph: 1, crossTrafficAhead: true }, 1 / 60);
    }
    expect(runner.status).toBe("passed");
  });

  it("Right of Way fails when the driver enters against cross traffic", () => {
    const runner = new LessonRunner(lesson("right-of-way"));
    runner.observe({ ...base, junction: null, crossTraffic: true }, 1 / 60); // approaching
    runner.observe({ ...base, junction: { cx: 0, cz: 0 }, crossTraffic: true }, 1 / 60); // barge in
    expect(runner.status).toBe("failed");
  });

  it("Yield to Pedestrians passes when the driver crawls for a crossing ped", () => {
    const runner = new LessonRunner(lesson("crosswalk"));
    for (let i = 0; i < 40; i += 1) {
      runner.observe({ ...base, speedMph: 1, pedestrianAhead: true }, 1 / 60);
    }
    expect(runner.status).toBe("passed");
  });

  it("Yield to Pedestrians fails if the driver bears down on the ped", () => {
    const runner = new LessonRunner(lesson("crosswalk"));
    for (let i = 0; i < 40; i += 1) {
      runner.observe({ ...base, speedMph: 15, pedestrianAhead: true }, 1 / 60);
    }
    expect(runner.status).toBe("failed");
  });

  it("Pull In & Park passes once the car rests in the bay", () => {
    const runner = new LessonRunner(lesson("parking"));
    // Not yet parked while still rolling toward the bay.
    for (let i = 0; i < 5; i += 1) runner.observe({ ...base, speedMph: 4, parked: false }, 1 / 60);
    expect(runner.status).toBe("in-progress");
    // Come to rest inside the bay and hold it.
    for (let i = 0; i < 40; i += 1) runner.observe({ ...base, speedMph: 0, parked: true }, 1 / 60);
    expect(runner.status).toBe("passed");
    expect(runner.objectives[0]!.done).toBe(true);
  });

  it("reset returns the lesson to in-progress", () => {
    const runner = new LessonRunner(lesson("stop-go"));
    driveRolledStop(runner);
    expect(runner.status).toBe("failed");
    runner.reset();
    expect(runner.status).toBe("in-progress");
    expect(runner.score).toBe(100);
  });
});
